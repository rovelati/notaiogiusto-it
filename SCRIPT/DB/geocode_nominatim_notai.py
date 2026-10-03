#!/usr/bin/env python3
"""Geocoding gratuito notai via Nominatim (OpenStreetMap).

Rispetta la usage policy OSMF:
- max 1 req/s (default delay 1.2s)
- User-Agent identificativo
- cache risultati lato nostro
- countrycodes=it + bounding box Italia
"""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.parse
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests


SCRIPT_DIR = Path(__file__).resolve().parent
STATE_DIR = SCRIPT_DIR / "state"
LOG_DIR = SCRIPT_DIR / "logs"
CACHE_PATH = STATE_DIR / "nominatim_geocode_cache.json"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "NotaioGiusto.it/0.1 (geocode-notai; contact=ops@notaiogiusto.it)"

# Bounding box approssimativa Italia (incl. isole maggiori)
IT_LAT = (35.0, 47.2)
IT_LNG = (6.0, 19.3)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def db_connect():
    load_dotenv(SCRIPT_DIR / ".env")
    load_dotenv(SCRIPT_DIR.parent.parent / ".env")
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL non configurato")
    return psycopg2.connect(db_url)


def load_cache() -> dict:
    if not CACHE_PATH.exists():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text())
    except Exception:
        return {}


def save_cache(cache: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=2))
    tmp.replace(CACHE_PATH)


def build_query(row: dict) -> str:
    parts = [
        (row.get("address") or "").strip(),
        (row.get("cap") or "").strip(),
        (row.get("comune") or "").strip(),
        "Italia",
    ]
    return ", ".join(p for p in parts if p)


def in_italy(lat: float, lng: float) -> bool:
    return IT_LAT[0] <= lat <= IT_LAT[1] and IT_LNG[0] <= lng <= IT_LNG[1]


def fetch_notaries(conn, limit: int, offset: int, only_comune: str | None) -> list[dict]:
    sql = """
        select id, full_name, source_slug, address, cap, comune
        from notai.notaries n
        where (lat is null or lng is null)
          and coalesce(nullif(trim(address), ''), null) is not null
          and coalesce(nullif(trim(comune), ''), null) is not null
          and not exists (
            select 1
            from notai.notary_enrichments e
            where e.notary_id = n.id
              and e.source = 'nominatim'
              and e.status in ('completed', 'empty')
          )
    """
    params: list = []
    if only_comune:
        sql += " and lower(comune) = lower(%s)"
        params.append(only_comune)
    sql += " order by n.imported_at asc nulls last, n.full_name asc offset %s limit %s"
    params.extend([offset, limit])
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return list(cur.fetchall())


def nominatim_search(session: requests.Session, query: str) -> dict | None:
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": 1,
        "countrycodes": "it",
        "addressdetails": 0,
    }
    response = session.get(NOMINATIM_URL, params=params, timeout=30)
    response.raise_for_status()
    rows = response.json()
    if not rows:
        return None
    hit = rows[0]
    try:
        lat = float(hit["lat"])
        lng = float(hit["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    if not in_italy(lat, lng):
        return None
    return {
        "lat": lat,
        "lng": lng,
        "display_name": hit.get("display_name"),
        "osm_type": hit.get("osm_type"),
        "osm_id": hit.get("osm_id"),
        "importance": hit.get("importance"),
        "query": query,
    }


def upsert_enrichment(conn, notary_id: str, source_url: str, status: str, payload: dict) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update notai.notary_enrichments
            set status = %s,
                payload = %s::jsonb,
                updated_at = now()
            where notary_id = %s and source = 'nominatim' and source_url = %s
            """,
            (status, json.dumps(payload, ensure_ascii=False), notary_id, source_url),
        )
        if cur.rowcount == 0:
            cur.execute(
                """
                insert into notai.notary_enrichments (notary_id, source, status, source_url, payload)
                values (%s, 'nominatim', %s, %s, %s::jsonb)
                """,
                (notary_id, status, source_url, json.dumps(payload, ensure_ascii=False)),
            )


def apply_coords(conn, notary_id: str, result: dict, query: str, apply: bool) -> None:
    payload = {
        "provider": "nominatim",
        "query": query,
        "lat": result["lat"],
        "lng": result["lng"],
        "display_name": result.get("display_name"),
        "osm_type": result.get("osm_type"),
        "osm_id": result.get("osm_id"),
        "importance": result.get("importance"),
    }
    source_url = f"nominatim://search?{urllib.parse.urlencode({'q': query})}"
    upsert_enrichment(conn, notary_id, source_url, "completed", payload)
    if apply:
        with conn.cursor() as cur:
            cur.execute(
                """
                update notai.notaries
                set lat = coalesce(lat, %s),
                    lng = coalesce(lng, %s),
                    raw_import = coalesce(raw_import, '{}'::jsonb) || jsonb_build_object('nominatim', %s::jsonb),
                    updated_at = now()
                where id = %s
                """,
                (
                    result["lat"],
                    result["lng"],
                    json.dumps(payload, ensure_ascii=False),
                    notary_id,
                ),
            )
        conn.commit()


def mark_empty(conn, notary_id: str, query: str, apply: bool) -> None:
    source_url = f"nominatim://search?{urllib.parse.urlencode({'q': query})}"
    payload = {"provider": "nominatim", "query": query, "lat": None, "lng": None}
    upsert_enrichment(conn, notary_id, source_url, "empty", payload)
    if apply:
        conn.commit()


def ensure_conn(conn):
    try:
        if conn is None or conn.closed:
            return db_connect()
        with conn.cursor() as cur:
            cur.execute("select 1")
        return conn
    except Exception:
        try:
            if conn and not conn.closed:
                conn.close()
        except Exception:
            pass
        return db_connect()


def main() -> int:
    parser = argparse.ArgumentParser(description="Geocoding notai con Nominatim OSM (gratis).")
    parser.add_argument("--limit", type=int, default=200, help="0 = tutti i rimanenti")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--comune", default="")
    parser.add_argument("--delay", type=float, default=1.2, help="Secondi tra richieste (policy: <=1 req/s)")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if args.delay < 1.0:
        raise SystemExit("delay minimo 1.0s per rispettare la policy Nominatim")

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    cache = load_cache()

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Accept-Language": "it",
        }
    )

    stats = {
        "selected": 0,
        "from_cache": 0,
        "fetched": 0,
        "geocoded": 0,
        "empty": 0,
        "errors": 0,
        "apply": args.apply,
    }

    limit = None if args.limit == 0 else args.limit
    conn = db_connect()
    try:
        rows = fetch_notaries(conn, limit if limit is not None else 100000, args.offset, args.comune or None)
        stats["selected"] = len(rows)
        print(json.dumps({"event": "batch_start", **stats}, ensure_ascii=False), flush=True)

        for index, row in enumerate(rows, start=1):
            notary_id = str(row["id"])
            query = build_query(row)
            print(
                json.dumps(
                    {
                        "event": "notary_start",
                        "index": index,
                        "id": notary_id,
                        "name": row["full_name"],
                        "comune": row["comune"],
                        "query": query,
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            try:
                conn = ensure_conn(conn)
                cached = cache.get(query)
                result = None
                if cached is not None:
                    stats["from_cache"] += 1
                    result = cached if cached.get("lat") is not None else None
                    if result is None:
                        mark_empty(conn, notary_id, query, args.apply)
                        stats["empty"] += 1
                        print(json.dumps({"event": "notary_done", "id": notary_id, "source": "cache", "ok": False}, ensure_ascii=False), flush=True)
                        continue
                else:
                    result = nominatim_search(session, query)
                    stats["fetched"] += 1
                    cache[query] = result or {"lat": None, "lng": None, "query": query}
                    save_cache(cache)
                    time.sleep(args.delay)

                conn = ensure_conn(conn)
                if result and result.get("lat") is not None:
                    apply_coords(conn, notary_id, result, query, args.apply)
                    stats["geocoded"] += 1
                    print(
                        json.dumps(
                            {
                                "event": "notary_done",
                                "id": notary_id,
                                "ok": True,
                                "lat": result["lat"],
                                "lng": result["lng"],
                                "display_name": result.get("display_name"),
                            },
                            ensure_ascii=False,
                        ),
                        flush=True,
                    )
                else:
                    mark_empty(conn, notary_id, query, args.apply)
                    stats["empty"] += 1
                    print(json.dumps({"event": "notary_done", "id": notary_id, "ok": False}, ensure_ascii=False), flush=True)
            except Exception as exc:
                stats["errors"] += 1
                print(json.dumps({"event": "notary_error", "id": notary_id, "error": str(exc)}, ensure_ascii=False), flush=True)
                try:
                    conn = ensure_conn(None)
                except Exception:
                    pass
                time.sleep(max(args.delay, 2.0))
    finally:
        try:
            if conn and not conn.closed:
                conn.close()
        except Exception:
            pass

    print(json.dumps({"event": "batch_done", "stats": stats}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
