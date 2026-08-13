#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib3
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import certifi
import psycopg2
import psycopg2.extras
import requests
from bs4 import BeautifulSoup


DEFAULT_SITEMAP_INDEX = "https://www.notariato.it/it/sitemap_index.xml"
USER_AGENT = "NotaioGiustoBot/0.1 (+https://www.notaiogiusto.it; info@notaiogiusto.it)"
SCRIPT_DIR = Path(__file__).resolve().parent
SCHEMA_FILE = SCRIPT_DIR / "schema_notai.sql"

LABELS = {
    "full_name": "Nome e Cognome",
    "birth_date": "Data di nascita",
    "fiscal_code": "Codice fiscale",
    "comune": "Comune",
    "current_office_since": "In questa sede dal:",
    "address": "Indirizzo",
    "cap": "CAP",
    "phone": "Telefono",
    "email": "Email",
    "pec": "Pec",
    "district": "Distretto",
}
SECTION_LABELS = {
    "Dati personali",
    "Informazioni professionali",
    "Sedi precedenti",
    "Torna alla ricerca dei notai",
}
ALL_LABELS = {normalize for normalize in []}


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize_space(value: str | None) -> str:
    return " ".join((value or "").replace("\xa0", " ").split())


def normalize_label(value: str) -> str:
    return normalize_space(value).casefold().rstrip(":")


NORMALIZED_LABELS = {normalize_label(v) for v in LABELS.values()} | {normalize_label(v) for v in SECTION_LABELS}


def parse_date(value: str | None) -> str | None:
    value = normalize_space(value)
    if not value:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value
    return None


def slug_from_url(url: str) -> str:
    path = urllib.parse.urlparse(url).path.rstrip("/")
    return path.split("/")[-1]


def is_valid_notary_url(url: str) -> bool:
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.rstrip("/")
    return (
        parsed.netloc.endswith("notariato.it")
        and path.startswith("/it/notary/")
        and path != "/it/notary"
        and path != "/it/notary/-"
        and "/-/" not in parsed.path
    )


def split_name(full_name: str) -> tuple[str | None, str | None]:
    parts = normalize_space(full_name).split()
    if len(parts) < 2:
        return full_name or None, None
    return " ".join(parts[:-1]), parts[-1]


def split_phones(phone: str | None) -> list[str]:
    if not phone:
        return []
    chunks = re.split(r"[;,/]|(?:\s+-\s+)", phone)
    phones = []
    for chunk in chunks:
        cleaned = normalize_space(chunk)
        if cleaned:
            phones.append(cleaned)
    return phones


def get_session(timeout: int, insecure: bool = False) -> requests.Session:
    if insecure:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "it-IT,it;q=0.9,en;q=0.5",
        }
    )
    session.request_timeout = timeout
    session.request_verify = False if insecure else certifi.where()
    return session


def request_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=session.request_timeout, verify=session.request_verify)
    response.raise_for_status()
    return response.text


def sitemap_locs(xml_text: str, tag: str) -> list[tuple[str, str | None]]:
    root = ET.fromstring(xml_text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    out: list[tuple[str, str | None]] = []
    for item in root.findall(f".//sm:{tag}", ns):
        loc = item.find("sm:loc", ns)
        lastmod = item.find("sm:lastmod", ns)
        if loc is not None and loc.text:
            out.append((loc.text.strip(), lastmod.text.strip() if lastmod is not None and lastmod.text else None))
    return out


def collect_notary_urls(session: requests.Session, args: argparse.Namespace) -> list[tuple[str, str | None]]:
    if args.only_url:
        return [(args.only_url, None)]

    sitemap_urls: list[str]
    if args.all_sitemaps:
        index_xml = request_text(session, args.sitemap_index)
        sitemap_urls = [
            loc
            for loc, _ in sitemap_locs(index_xml, "sitemap")
            if re.search(r"/notary-sitemap\d+\.xml$", loc)
        ]
    else:
        sitemap_urls = [args.sitemap]

    seen: set[str] = set()
    urls: list[tuple[str, str | None]] = []
    for sitemap_url in sitemap_urls:
        xml_text = request_text(session, sitemap_url)
        for loc, lastmod in sitemap_locs(xml_text, "url"):
            if is_valid_notary_url(loc) and loc not in seen:
                seen.add(loc)
                urls.append((loc, lastmod))
    return urls


def visible_lines(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return [normalize_space(line) for line in soup.get_text("\n").splitlines() if normalize_space(line)]


def meta_link(html: str, rel: str | None = None, type_: str | None = None) -> str | None:
    soup = BeautifulSoup(html, "html.parser")
    attrs = {}
    if rel:
        attrs["rel"] = rel
    if type_:
        attrs["type"] = type_
    tag = soup.find("link", attrs=attrs)
    href = tag.get("href") if tag else None
    return href if href else None


def value_after_label(lines: list[str], label: str) -> str | None:
    wanted = normalize_label(label)
    for idx, line in enumerate(lines):
        if normalize_label(line) != wanted:
            continue
        for candidate in lines[idx + 1 : idx + 8]:
            if normalize_label(candidate) in NORMALIZED_LABELS:
                return None
            return candidate
    return None


def parse_previous_locations(lines: list[str]) -> list[dict]:
    previous: list[dict] = []
    try:
        start = next(i for i, line in enumerate(lines) if normalize_label(line) == normalize_label("Sedi precedenti")) + 1
    except StopIteration:
        return previous

    place: str | None = None
    idx = start
    while idx < len(lines):
        line = lines[idx]
        norm = normalize_label(line)
        if norm in {normalize_label("Torna alla ricerca dei notai"), normalize_label("Chi siamo")}:
            break
        if norm == "dal":
            date_value = parse_date(lines[idx + 1] if idx + 1 < len(lines) else None)
            if place and date_value:
                previous.append({"comune": place, "from": date_value})
            place = None
            idx += 2
            continue
        if norm not in NORMALIZED_LABELS:
            place = line
        idx += 1
    return previous


def profile_raw_text(lines: list[str]) -> str:
    try:
        start = next(i for i, line in enumerate(lines) if normalize_label(line) == normalize_label("Dati personali"))
    except StopIteration:
        start = 0
    end = len(lines)
    for idx in range(start, len(lines)):
        if normalize_label(lines[idx]) == normalize_label("Torna alla ricerca dei notai"):
            end = idx + 1
            break
    return "\n".join(lines[start:end])


def parse_notary_page(url: str, html: str, lastmod: str | None = None) -> dict:
    lines = visible_lines(html)
    data = {key: value_after_label(lines, label) for key, label in LABELS.items()}
    full_name = normalize_space(data.get("full_name"))
    if not full_name:
        raise ValueError("nome notaio non trovato")

    first_name, last_name = split_name(full_name)
    canonical = meta_link(html, rel="canonical")
    wp_json = meta_link(html, rel="alternate", type_="application/json")
    phone = normalize_space(data.get("phone"))

    return {
        "source_url": url,
        "source_slug": slug_from_url(url),
        "official_reference_url": url,
        "canonical_url": canonical,
        "wp_json_url": wp_json,
        "official_lastmod": lastmod,
        "full_name": full_name,
        "first_name": first_name,
        "last_name": last_name,
        "birth_date": parse_date(data.get("birth_date")),
        "fiscal_code": normalize_space(data.get("fiscal_code")).upper() or None,
        "comune": normalize_space(data.get("comune")) or None,
        "current_office_since": parse_date(data.get("current_office_since")),
        "address": normalize_space(data.get("address")) or None,
        "cap": normalize_space(data.get("cap")) or None,
        "phone": phone or None,
        "phones": split_phones(phone),
        "email": normalize_space(data.get("email")) or None,
        "pec": normalize_space(data.get("pec")) or None,
        "district": normalize_space(data.get("district")) or None,
        "previous_locations": parse_previous_locations(lines),
        "raw_text": profile_raw_text(lines),
        "raw_html_hash": hashlib.sha256(html.encode("utf-8", errors="ignore")).hexdigest(),
        "raw_import": {
            "source": "notariato",
            "source_url": url,
            "canonical_url": canonical,
            "wp_json_url": wp_json,
            "official_lastmod": lastmod,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "parser": "notariato_html_v1",
        },
    }


def db_connect():
    load_dotenv(SCRIPT_DIR / ".env")
    load_dotenv(Path.cwd() / ".env")
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL non configurato")
    return psycopg2.connect(db_url)


def apply_schema() -> None:
    with db_connect() as conn, conn.cursor() as cur:
        cur.execute(SCHEMA_FILE.read_text())
    print(f"Schema applicato: {SCHEMA_FILE}")


UPSERT_SQL = """
insert into notai.notaries (
    source_url, source_slug, official_reference_url, canonical_url, wp_json_url, official_lastmod,
    full_name, first_name, last_name, birth_date, fiscal_code,
    comune, current_office_since, address, cap, phone, phones, email, pec, district,
    previous_locations, raw_text, raw_html_hash, raw_import, imported_at
) values (
    %(source_url)s, %(source_slug)s, %(official_reference_url)s, %(canonical_url)s, %(wp_json_url)s, %(official_lastmod)s,
    %(full_name)s, %(first_name)s, %(last_name)s, %(birth_date)s, %(fiscal_code)s,
    %(comune)s, %(current_office_since)s, %(address)s, %(cap)s, %(phone)s, %(phones)s, %(email)s, %(pec)s, %(district)s,
    %(previous_locations)s, %(raw_text)s, %(raw_html_hash)s, %(raw_import)s, now()
)
on conflict (source_url) do update set
    source_slug = excluded.source_slug,
    official_reference_url = excluded.official_reference_url,
    canonical_url = excluded.canonical_url,
    wp_json_url = excluded.wp_json_url,
    official_lastmod = excluded.official_lastmod,
    full_name = excluded.full_name,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    birth_date = excluded.birth_date,
    fiscal_code = excluded.fiscal_code,
    comune = excluded.comune,
    current_office_since = excluded.current_office_since,
    address = excluded.address,
    cap = excluded.cap,
    phone = excluded.phone,
    phones = excluded.phones,
    email = excluded.email,
    pec = excluded.pec,
    district = excluded.district,
    previous_locations = excluded.previous_locations,
    raw_text = excluded.raw_text,
    raw_html_hash = excluded.raw_html_hash,
    raw_import = excluded.raw_import,
    imported_at = now()
returning (xmax = 0) as inserted;
"""


def save_notary(conn, data: dict) -> bool:
    payload = dict(data)
    payload["previous_locations"] = psycopg2.extras.Json(payload["previous_locations"])
    payload["raw_import"] = psycopg2.extras.Json(payload["raw_import"])
    with conn.cursor() as cur:
        cur.execute(UPSERT_SQL, payload)
        return bool(cur.fetchone()[0])


def create_run(conn, args: argparse.Namespace, selected_count: int) -> str:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into notai.import_runs (source, selected_count, options)
            values ('notariato', %s, %s)
            returning id
            """,
            (selected_count, psycopg2.extras.Json(vars(args))),
        )
        return str(cur.fetchone()[0])


def finish_run(conn, run_id: str, status: str, stats: dict, notes: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update notai.import_runs
            set finished_at = now(),
                status = %s,
                processed_count = %s,
                inserted_count = %s,
                updated_count = %s,
                skipped_count = %s,
                error_count = %s,
                notes = %s
            where id = %s
            """,
            (
                status,
                stats["processed"],
                stats["inserted"],
                stats["updated"],
                stats["skipped"],
                stats["errors"],
                notes,
                run_id,
            ),
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Importa i notai ufficiali da notariato.it nello schema notai.")
    parser.add_argument("--sitemap-index", default=DEFAULT_SITEMAP_INDEX)
    parser.add_argument("--sitemap", default="https://www.notariato.it/it/notary-sitemap1.xml")
    parser.add_argument("--all-sitemaps", action="store_true")
    parser.add_argument("--only-url")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--insecure", action="store_true", help="Disattiva la verifica TLS solo se il bundle CA locale e rotto.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply-schema", action="store_true")
    parser.add_argument("--save-html-dir")
    args = parser.parse_args()

    if args.apply_schema:
        apply_schema()

    session = get_session(args.timeout, args.insecure)
    urls = collect_notary_urls(session, args)
    urls = urls[args.offset :]
    if args.limit is not None:
        urls = urls[: args.limit]

    print(f"URL notai selezionate: {len(urls)}")
    if args.limit == 0:
        return 0

    stats = {"processed": 0, "inserted": 0, "updated": 0, "skipped": 0, "errors": 0}
    conn = None
    run_id = None
    if not args.dry_run:
        conn = db_connect()
        run_id = create_run(conn, args, len(urls))
        conn.commit()

    html_dir = Path(args.save_html_dir) if args.save_html_dir else None
    if html_dir:
        html_dir.mkdir(parents=True, exist_ok=True)

    try:
        for index, (url, lastmod) in enumerate(urls, start=1):
            try:
                html = request_text(session, url)
                if html_dir:
                    (html_dir / f"{slug_from_url(url)}.html").write_text(html)
                data = parse_notary_page(url, html, lastmod)
                stats["processed"] += 1

                if args.dry_run:
                    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))
                else:
                    inserted = save_notary(conn, data)
                    conn.commit()
                    stats["inserted" if inserted else "updated"] += 1
                    print(f"[{index}/{len(urls)}] {'insert' if inserted else 'update'} {data['full_name']} - {data.get('comune')}")

            except requests.HTTPError as exc:
                status_code = exc.response.status_code if exc.response is not None else None
                if status_code in {404, 410}:
                    stats["skipped"] += 1
                    print(f"[{index}/{len(urls)}] skip URL non piu disponibile ({status_code}) {url}")
                else:
                    stats["errors"] += 1
                    print(f"[{index}/{len(urls)}] ERRORE HTTP {url}: {exc}", file=sys.stderr)
            except Exception as exc:
                stats["errors"] += 1
                print(f"[{index}/{len(urls)}] ERRORE {url}: {exc}", file=sys.stderr)

            if index < len(urls) and args.delay > 0:
                time.sleep(args.delay)

        if conn and run_id:
            finish_run(conn, run_id, "completed" if stats["errors"] == 0 else "completed_with_errors", stats)
            conn.commit()
    finally:
        if conn:
            conn.close()

    print("Statistiche:", json.dumps(stats, ensure_ascii=False))
    return 0 if stats["errors"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
