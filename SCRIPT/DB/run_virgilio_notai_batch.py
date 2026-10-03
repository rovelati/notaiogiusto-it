#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
import re
import time
from pathlib import Path

import psycopg2.extras

from enrich_virgilio_notai import db_connect, discover_from_search, enrich_one, normalize_virgilio_url


SCRIPT_DIR = Path(__file__).resolve().parent
STATE_DIR = SCRIPT_DIR / "state"
LOG_DIR = SCRIPT_DIR / "logs"


def load_state(path: Path) -> dict:
    if not path.exists():
        return {"processed_notary_ids": [], "failed": []}
    return json.loads(path.read_text())


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2, default=str))
    tmp.replace(path)


def fetch_notaries(
    conn,
    limit: int | None,
    offset: int,
    retry_failed: bool,
    comune: str | None = None,
) -> list[dict]:
    where = """
        n.status = 'published'
        and n.comune is not null
        and (
            %s
            or not exists (
                select 1 from notai.notary_enrichments e
                where e.notary_id = n.id and e.source = 'virgilio'
            )
        )
        and (%s = '' or lower(coalesce(n.comune, '')) = lower(%s))
    """
    sql = f"""
        select n.id, n.full_name, n.source_slug, n.comune, n.phone, n.email, n.pec
        from notai.notaries n
        where {where}
        order by
          case when %s <> '' and lower(coalesce(n.comune, '')) = lower(%s) then 0 else 1 end,
          n.imported_at asc
        offset %s
    """
    city = (comune or "").strip()
    params: list = [retry_failed, city, city, city, city, offset]
    if limit is not None:
        sql += " limit %s"
        params.append(limit)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return list(cur.fetchall())


_COMUNE_CANDIDATE_CACHE: dict[str, list[str]] = {}


def discover_candidates_cached(comune: str, candidate_limit: int) -> list[str]:
    key = (comune or "").strip().lower()
    if key not in _COMUNE_CANDIDATE_CACHE:
        _COMUNE_CANDIDATE_CACHE[key] = discover_from_search(comune, max(candidate_limit, 120))
    return list(_COMUNE_CANDIDATE_CACHE[key][:candidate_limit])


def rank_candidates_by_name(notary: dict, urls: list[str]) -> list[str]:
    """Prioritizza URL il cui slug contiene pezzi del nome del notaio."""
    tokens = [
        token
        for token in re.findall(r"[a-zàèéìòù]+", (notary.get("full_name") or "").lower())
        if len(token) >= 4 and token not in {"notaio", "notai", "studio", "notarile"}
    ]
    if not tokens:
        return urls

    def score(url: str) -> int:
        slug = url.lower()
        return sum(1 for token in tokens if token in slug)

    return sorted(urls, key=score, reverse=True)


def select_candidates_for_notary(notary: dict, urls: list[str], max_tries: int = 8) -> list[str]:
    """Limita i fetch scheda: prima slug con nome, altrimenti pochi candidati generici."""
    ranked = rank_candidates_by_name(notary, urls)
    tokens = [
        token
        for token in re.findall(r"[a-zàèéìòù]+", (notary.get("full_name") or "").lower())
        if len(token) >= 4 and token not in {"notaio", "notai", "studio", "notarile"}
    ]

    def score(url: str) -> int:
        slug = url.lower()
        return sum(1 for token in tokens if token in slug)

    named = [url for url in ranked if score(url) > 0]
    if named:
        return named[:max_tries]
    return ranked[: min(3, max_tries)]


def sleep_between(min_delay: float, max_delay: float) -> None:
    if max_delay <= 0:
        return
    time.sleep(random.uniform(min_delay, max_delay))


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch arricchimento Virgilio per notai.")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--comune", default="", help="Filtro/priorità comune (es. Milano).")
    parser.add_argument("--candidate-limit", type=int, default=10)
    parser.add_argument("--threshold", type=int, default=70)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--min-delay", type=float, default=6.0)
    parser.add_argument("--max-delay", type=float, default=14.0)
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--state-file", default=str(STATE_DIR / "virgilio_batch_state.json"))
    args = parser.parse_args()

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    state_path = Path(args.state_file)
    state = load_state(state_path)
    processed_ids = set(state.get("processed_notary_ids", []))

    stats = {"selected": 0, "processed": 0, "matched": 0, "no_match": 0, "errors": 0}

    with db_connect() as conn:
        notaries = fetch_notaries(conn, args.limit, args.offset, args.retry_failed, args.comune)
        stats["selected"] = len(notaries)
        print(
            json.dumps(
                {
                    "event": "batch_start",
                    "selected": len(notaries),
                    "apply": args.apply,
                    "comune": args.comune or None,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )

        for index, notary in enumerate(notaries, start=1):
            notary_id = str(notary["id"])
            if notary_id in processed_ids and not args.retry_failed:
                continue

            print(
                json.dumps(
                    {"event": "notary_start", "index": index, "id": notary_id, "name": notary["full_name"], "comune": notary["comune"]},
                    ensure_ascii=False,
                ),
                flush=True,
            )
            try:
                candidates = discover_candidates_cached(notary["comune"], args.candidate_limit)
                unique: list[str] = []
                seen: set[str] = set()
                for candidate in select_candidates_for_notary(notary, candidates, max_tries=8):
                    normalized = normalize_virgilio_url(candidate) or candidate
                    if normalized not in seen:
                        seen.add(normalized)
                        unique.append(normalized)

                results = []
                if not unique:
                    stats["no_match"] += 1
                for candidate_url in unique:
                    result = enrich_one(conn, notary, candidate_url, args.threshold, args.apply)
                    results.append(result)
                    if result.get("match"):
                        stats["matched"] += 1
                        break
                    sleep_between(args.min_delay, args.max_delay)

                if unique and not any(r.get("match") for r in results):
                    stats["no_match"] += 1

                stats["processed"] += 1
                if args.apply:
                    processed_ids.add(notary_id)
                    state["processed_notary_ids"] = sorted(processed_ids)
                    save_state(state_path, state)

                print(
                    json.dumps(
                        {"event": "notary_done", "id": notary_id, "candidate_count": len(unique), "results": results},
                        ensure_ascii=False,
                        default=str,
                    ),
                    flush=True,
                )
            except Exception as exc:
                error = str(exc)
                stats["errors"] += 1
                if args.apply:
                    state.setdefault("failed", []).append(
                        {
                            "id": notary_id,
                            "name": notary["full_name"],
                            "comune": notary["comune"],
                            "error": error,
                            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        }
                    )
                    save_state(state_path, state)
                print(json.dumps({"event": "notary_error", "id": notary_id, "error": error}, ensure_ascii=False), flush=True)

            sleep_between(args.min_delay, args.max_delay)

    print(json.dumps({"event": "batch_done", "stats": stats}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
