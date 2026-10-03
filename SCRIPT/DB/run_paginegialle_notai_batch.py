#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import psycopg2.extras

from enrich_paginegialle_notai import (
    db_connect,
    discover_from_search,
    enrich_one,
    normalize_pg_url,
)


SCRIPT_DIR = Path(__file__).resolve().parent
STATE_DIR = SCRIPT_DIR / "state"
LOG_DIR = SCRIPT_DIR / "logs"
WAF_MARKERS = (
    "AWS WAF challenge",
    "challenge-container",
    "verify that you're not a robot",
    "PagineGialle ha restituito",
)


def load_state(path: Path) -> dict:
    if not path.exists():
        return {"processed_notary_ids": [], "failed": [], "waf_stops": 0}
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
                where e.notary_id = n.id and e.source = 'paginegialle'
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


def is_waf_error(error: str) -> bool:
    return any(marker.lower() in error.lower() for marker in WAF_MARKERS)


def sleep_between(min_delay: float, max_delay: float) -> None:
    if max_delay <= 0:
        return
    time.sleep(random.uniform(min_delay, max_delay))


def discover_candidates(notary: dict, candidate_limit: int, search_mode: str) -> list[str]:
    candidates: list[str] = []
    if search_mode in {"name", "both"}:
        candidates.extend(discover_from_search(f"{notary['full_name']} {notary['comune']}", candidate_limit))
    if len(candidates) < candidate_limit and search_mode in {"category", "both", "name"}:
        # name-only su PG spesso torna 0: fallback comune / "notai {comune}"
        if search_mode != "name" or not candidates:
            candidates.extend(discover_from_search(f"notai {notary['comune']}", candidate_limit))
        if len(candidates) < candidate_limit:
            candidates.extend(discover_from_search(notary["comune"], candidate_limit))

    seen: set[str] = set()
    unique: list[str] = []
    for candidate in candidates:
        normalized = normalize_pg_url(candidate) or candidate
        if normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
        if len(unique) >= candidate_limit:
            break
    return unique


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch arricchimento PagineGialle per notai.")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--comune", default="", help="Priorità/filtro comune (es. Milano).")
    parser.add_argument("--candidate-limit", type=int, default=6)
    parser.add_argument("--threshold", type=int, default=70)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--search-mode", choices=["name", "category", "both"], default="name")
    parser.add_argument("--min-delay", type=float, default=8.0)
    parser.add_argument("--max-delay", type=float, default=18.0)
    parser.add_argument("--stop-on-waf", action="store_true", default=True)
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--state-file", default=str(STATE_DIR / "paginegialle_batch_state.json"))
    args = parser.parse_args()

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    state_path = Path(args.state_file)
    state = load_state(state_path)
    processed_ids = set(state.get("processed_notary_ids", []))

    stats = {
        "selected": 0,
        "processed": 0,
        "matched": 0,
        "no_match": 0,
        "errors": 0,
        "waf_stops": state.get("waf_stops", 0),
    }

    with db_connect() as conn:
        notaries = fetch_notaries(conn, args.limit, args.offset, args.retry_failed, args.comune)
        stats["selected"] = len(notaries)
        print(
            json.dumps(
                {"event": "batch_start", "selected": len(notaries), "apply": args.apply, "comune": args.comune or None},
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
                    {
                        "event": "notary_start",
                        "index": index,
                        "id": notary_id,
                        "name": notary["full_name"],
                        "comune": notary["comune"],
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )

            try:
                candidates = discover_candidates(notary, args.candidate_limit, args.search_mode)
                results = []
                if not candidates:
                    stats["no_match"] += 1
                for candidate_url in candidates:
                    result = enrich_one(conn, notary, candidate_url, args.threshold, args.apply)
                    results.append(result)
                    if result.get("match"):
                        stats["matched"] += 1
                        break
                    sleep_between(args.min_delay, args.max_delay)

                if candidates and not any(r.get("match") for r in results):
                    stats["no_match"] += 1

                stats["processed"] += 1
                if args.apply:
                    processed_ids.add(notary_id)
                    state["processed_notary_ids"] = sorted(processed_ids)
                    save_state(state_path, state)

                print(
                    json.dumps(
                        {
                            "event": "notary_done",
                            "id": notary_id,
                            "candidate_count": len(candidates),
                            "results": results,
                        },
                        ensure_ascii=False,
                        default=str,
                    ),
                    flush=True,
                )

                if candidates:
                    sleep_between(args.min_delay, args.max_delay)

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

                if args.stop_on_waf and is_waf_error(error):
                    if args.apply:
                        state["waf_stops"] = state.get("waf_stops", 0) + 1
                        save_state(state_path, state)
                    print(json.dumps({"event": "batch_stop", "reason": "waf_detected", "stats": stats}, ensure_ascii=False), flush=True)
                    return 3

            sleep_between(args.min_delay, args.max_delay)

    print(json.dumps({"event": "batch_done", "stats": stats}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
