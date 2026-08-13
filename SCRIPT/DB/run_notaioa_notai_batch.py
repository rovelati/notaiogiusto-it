#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import psycopg2.extras

from enrich_notaioa_notai import db_connect, enrich_one, sitemap_notary_urls


SCRIPT_DIR = Path(__file__).resolve().parent
STATE_DIR = SCRIPT_DIR / "state"
LOG_DIR = SCRIPT_DIR / "logs"
STATE_FILE = STATE_DIR / "notaioa_batch_state.json"


def source_slug_from_url(url: str) -> str:
    parts = [part for part in urlparse(url).path.split("/") if part]
    if len(parts) >= 2 and parts[0] == "notaio":
        return parts[1]
    return ""


def load_state() -> dict:
    if not STATE_FILE.exists():
        return {"processed_urls": []}
    try:
        return json.loads(STATE_FILE.read_text())
    except json.JSONDecodeError:
        return {"processed_urls": []}


def save_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2))
    tmp.replace(STATE_FILE)


def find_notary_by_slug(conn, source_slug: str):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            select *
            from notai.notaries
            where source_slug = %s
            limit 1
            """,
            (source_slug,),
        )
        return cur.fetchone()


def has_existing_enrichment(conn, notary_id: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            select 1
            from notai.notary_enrichments
            where notary_id = %s and source = 'notaioa' and status = 'completed'
            limit 1
            """,
            (notary_id,),
        )
        return cur.fetchone() is not None


def log_line(path: Path, payload: dict) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with path.open("a") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch enrichment notai da Notaioa.it via sitemap.")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--threshold", type=int, default=80)
    parser.add_argument("--min-delay", type=float, default=1.2)
    parser.add_argument("--max-delay", type=float, default=2.8)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--apply-profile-services", action="store_true")
    parser.add_argument("--ignore-state", action="store_true")
    args = parser.parse_args()

    if args.min_delay < 1.0:
        raise SystemExit("Notaioa robots.txt indica crawl-delay 1: usare --min-delay >= 1")
    if args.max_delay < args.min_delay:
        raise SystemExit("--max-delay deve essere >= --min-delay")

    urls = sitemap_notary_urls(args.offset + args.limit)
    urls = urls[args.offset : args.offset + args.limit]
    state = load_state()
    processed_urls = set(state.get("processed_urls") or [])
    log_path = LOG_DIR / f"notaioa_batch_{time.strftime('%Y%m%d_%H%M%S')}.jsonl"

    stats = {
        "selected": len(urls),
        "processed": 0,
        "matched": 0,
        "skipped_state": 0,
        "skipped_not_found": 0,
        "skipped_existing": 0,
        "errors": 0,
        "apply": args.apply,
        "log": str(log_path),
    }

    with db_connect() as conn:
        for index, url in enumerate(urls, start=args.offset + 1):
            slug = source_slug_from_url(url)
            row = {"index": index, "url": url, "source_slug": slug}
            try:
                if not args.ignore_state and url in processed_urls:
                    stats["skipped_state"] += 1
                    row["status"] = "skipped_state"
                    log_line(log_path, row)
                    continue
                notary = find_notary_by_slug(conn, slug)
                if not notary:
                    stats["skipped_not_found"] += 1
                    row["status"] = "not_found_in_master"
                    log_line(log_path, row)
                    processed_urls.add(url)
                    state["processed_urls"] = sorted(processed_urls)
                    save_state(state)
                    continue
                if has_existing_enrichment(conn, notary["id"]):
                    stats["skipped_existing"] += 1
                    row["status"] = "skipped_existing"
                    log_line(log_path, row)
                    processed_urls.add(url)
                    state["processed_urls"] = sorted(processed_urls)
                    save_state(state)
                    continue
                result = enrich_one(conn, notary, url, args.threshold, args.apply, args.apply_profile_services)
                stats["processed"] += 1
                if result["match"]:
                    stats["matched"] += 1
                row.update({"status": "processed", "result": result})
                log_line(log_path, row)
                processed_urls.add(url)
                state["processed_urls"] = sorted(processed_urls)
                save_state(state)
                time.sleep(random.uniform(args.min_delay, args.max_delay))
            except Exception as exc:
                conn.rollback()
                stats["errors"] += 1
                row.update({"status": "error", "error": str(exc)})
                log_line(log_path, row)
                print(f"Errore su {url}: {exc}", file=sys.stderr)
                time.sleep(random.uniform(args.min_delay, args.max_delay))

    print(json.dumps(stats, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
