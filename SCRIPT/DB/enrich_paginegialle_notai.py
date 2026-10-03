#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
from dataclasses import asdict
from pathlib import Path
from typing import Iterable

import psycopg2
import psycopg2.extras
from bs4 import BeautifulSoup


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_PG_ROOT = Path(os.getenv("PAGINEGIALLE_SPIDER_ROOT", "/var/www/codebase/SPIDER"))
if DEFAULT_PG_ROOT.exists():
    sys.path.insert(0, str(DEFAULT_PG_ROOT))

try:
    import paginegialle_scraper as pg_scraper
    from paginegialle_scraper import build_record, fetch_html
except ImportError as exc:
    raise SystemExit(
        "Modulo paginegialle_scraper non trovato. "
        "Imposta PAGINEGIALLE_SPIDER_ROOT o copia gli script PG da Veterinari.org."
    ) from exc


NOTARY_TERMS = {"notaio", "notai", "notarile", "notarili", "studio notarile", "studi notarili"}
PG_BASE = "https://www.paginegialle.it"
ANDROID_CHROME_UA = (
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36"
)


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def configure_pg_session() -> None:
    load_dotenv(SCRIPT_DIR / ".env")
    user_agent = os.getenv("PG_USER_AGENT", ANDROID_CHROME_UA)
    headers = {
        "User-Agent": user_agent,
        "sec-ch-ua": os.getenv("PG_SEC_CH_UA", '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"'),
        "sec-ch-ua-mobile": os.getenv("PG_SEC_CH_UA_MOBILE", "?1"),
        "sec-ch-ua-platform": os.getenv("PG_SEC_CH_UA_PLATFORM", '"Android"'),
        "upgrade-insecure-requests": "1",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Referer": os.getenv("PG_REFERER", "https://www.google.com/"),
    }
    pg_scraper.SESSION.headers.update(headers)
    if os.getenv("PG_COOKIE"):
        pg_scraper.SESSION.headers["Cookie"] = os.getenv("PG_COOKIE", "")


configure_pg_session()


def db_connect():
    load_dotenv(SCRIPT_DIR / ".env")
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL non configurato")
    return psycopg2.connect(db_url)


def norm(value: str | None) -> str:
    value = value or ""
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", value.lower()).strip()


def words(value: str | None) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", norm(value)) if len(w) > 1}


def digits(value: str | None) -> str:
    d = re.sub(r"\D", "", value or "")
    if d.startswith("0039"):
        d = d[4:]
    if d.startswith("39") and len(d) > 10:
        d = d[2:]
    return d


def phone_tokens(value: str | None) -> set[str]:
    out = set()
    for chunk in re.split(r"[;,/]|(?:\s+-\s+)", value or ""):
        d = digits(chunk)
        if len(d) >= 7:
            out.add(d)
    return out


def pg_search_url(query_or_comune: str) -> str:
    query = (query_or_comune or "").strip()
    if not query:
        return f"{PG_BASE}/ricerca/notai"
    if " " in query and not query.isupper():
        return f"{PG_BASE}/ricerca/{urllib.parse.quote(query)}"
    return f"{PG_BASE}/ricerca/notai/{urllib.parse.quote(query.title())}"


def normalize_pg_url(href: str) -> str | None:
    if not href:
        return None
    href = urllib.parse.urljoin(PG_BASE, href)
    parsed = urllib.parse.urlparse(href)
    if parsed.netloc != "www.paginegialle.it":
        return None
    path = parsed.path.rstrip("/")
    excluded = ("/ricerca/", "/preventivi/", "/contattaci", "/elencosedi")
    if any(part in path for part in excluded):
        return None
    if path.endswith(".htm") or path.endswith(".html"):
        return None
    if path.count("/") <= 1 and path.strip("/") in {"notai", "notaio", "notai.htm", "notaio.htm"}:
        return None
    if not any(term in path.lower() for term in ("notai", "notaio", "notar")):
        return None
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def discover_from_search(comune: str, limit: int = 20) -> list[str]:
    html = fetch_pg_html(pg_search_url(comune))
    soup = BeautifulSoup(html, "html.parser")
    seen: set[str] = set()
    urls: list[str] = []
    for link in soup.select("a[href]"):
        url = normalize_pg_url(link.get("href", ""))
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
        if len(urls) >= limit:
            break
    return urls


def ensure_valid_pg_html(html: str, url: str) -> None:
    lowered = html[:5000].lower()
    if "awswaf" in lowered or "challenge-container" in lowered or "verify that you're not a robot" in lowered:
        raise RuntimeError(
            f"PagineGialle ha restituito AWS WAF challenge per {url}. "
            "Aggiornare PG_COOKIE da una sessione browser valida o usare fetch browser-based."
        )
    if len(html) < 10000:
        raise RuntimeError(f"HTML PagineGialle troppo corto/non valido per {url}: {len(html)} byte")


def fetch_pg_html(url: str) -> str:
    try:
        html = fetch_html(url)
        ensure_valid_pg_html(html, url)
        return html
    except Exception as exc:
        if os.getenv("PG_BROWSER_FALLBACK", "1") != "1":
            raise

        cmd = ["node", str(SCRIPT_DIR / "paginegialle_fetch_html.mjs"), url]
        env = os.environ.copy()
        env.setdefault("PG_BROWSER_PROFILE", str(SCRIPT_DIR / "state" / "pg-browser-profile"))
        completed = subprocess.run(
            cmd,
            env=env,
            text=True,
            capture_output=True,
            timeout=int(os.getenv("PG_BROWSER_TIMEOUT_SECONDS", "120")),
            check=False,
        )
        if completed.returncode != 0:
            message = completed.stderr.strip() or f"exit code {completed.returncode}"
            raise RuntimeError(f"Fetch browser PagineGialle fallito per {url}: {message}") from exc
        html = completed.stdout
        ensure_valid_pg_html(html, url)
        return html


def service_keywords() -> dict[str, list[str]]:
    return {
        "atto-di-donazione": ["atto di donazione", "donazione"],
        "pratica-di-successione": ["pratica di successione", "successione", "successioni"],
        "testamento": ["testamento", "testamenti", "mortis causa"],
        "convenzioni-matrimoniali": ["convenzioni matrimoniali", "convenzione matrimoniale"],
        "eredita": ["eredita", "eredità", "ereditario"],
        "separazione-dei-beni": ["separazione dei beni"],
        "diritto-di-famiglia": ["diritto di famiglia"],
        "compravendita-immobiliare": ["trasferimenti immobiliari", "diritto immobiliare", "compravendita", "vendita casa", "acquisto casa"],
        "mutuo": ["mutuo", "mutui", "atti ipotecari", "garanzia"],
        "diritto-societario": ["diritto societario", "societario", "operazioni straordinarie", "costituzione societa", "costituzione società"],
        "procura": ["procura", "procure"],
        "consulenza-notarile": ["consulenza", "consulenze"],
    }


def extract_services(record) -> list[dict]:
    text = norm(" ".join([record.name, record.category, record.description, record.tags]))
    found = []
    for slug, keys in service_keywords().items():
        evidence = [key for key in keys if norm(key) in text]
        if evidence:
            found.append({"slug": slug, "evidence": evidence[0]})
    return found


def get_notary(conn, notary_id: str | None, source_slug: str | None):
    where = "id = %s" if notary_id else "source_slug = %s"
    value = notary_id or source_slug
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(f"select * from notai.notaries where {where} limit 1", (value,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError("Notaio non trovato nel master Notariato")
        return row


def score_match(notary: dict, record) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    official_words = words(notary.get("full_name"))
    pg_words = words(record.name)
    overlap = official_words & pg_words
    if len(overlap) >= 2:
        score += 55
        reasons.append(f"nome overlap: {', '.join(sorted(overlap))}")
    elif overlap:
        score += 25
        reasons.append(f"nome parziale: {', '.join(sorted(overlap))}")

    comune = norm(notary.get("comune"))
    pg_text = norm(" ".join([record.city, record.address, record.description]))
    if comune and comune in pg_text:
        score += 20
        reasons.append("comune nel testo PG")

    official_phones = phone_tokens(notary.get("phone"))
    pg_phones = phone_tokens(record.phone_numbers)
    if official_phones and pg_phones and official_phones & pg_phones:
        score += 35
        reasons.append("telefono uguale")

    if any(term in norm(record.category) for term in NOTARY_TERMS) or any(term in norm(record.name) for term in NOTARY_TERMS):
        score += 10
        reasons.append("categoria notarile")

    if record.website:
        score += 5
        reasons.append("sito presente")
    if record.emails:
        score += 5
        reasons.append("email presente")

    return score, reasons


def save_enrichment(conn, notary: dict, pg_url: str, record, score: int, reasons: list[str], apply: bool) -> None:
    services = extract_services(record)
    payload = asdict(record)
    payload["match_score"] = score
    payload["match_reasons"] = reasons
    payload["suggested_services"] = services

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into notai.notary_enrichments (notary_id, source, status, source_url, payload)
            values (%s, 'paginegialle', 'completed', %s, %s)
            on conflict (notary_id, source, source_url) where source_url is not null
            do update set status = excluded.status, payload = excluded.payload, updated_at = now()
            """,
            (notary["id"], pg_url, psycopg2.extras.Json(payload)),
        )
        if apply:
            cur.execute(
                """
                update notai.notaries
                set website = coalesce(nullif(website, ''), nullif(%s, '')),
                    phone = coalesce(nullif(phone, ''), nullif(%s, '')),
                    raw_import = raw_import || jsonb_build_object('paginegialle', %s::jsonb)
                where id = %s
                """,
                (
                    record.website,
                    record.phone_numbers,
                    json.dumps({"source_url": pg_url, "match_score": score, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}),
                    notary["id"],
                ),
            )
            for service in services:
                cur.execute(
                    """
                    select coalesce(canonical_service_id, id)
                    from notai.services_taxonomy
                    where slug = %s
                    limit 1
                    """,
                    (service["slug"],),
                )
                row = cur.fetchone()
                if not row:
                    continue
                cur.execute(
                    """
                    insert into notai.notary_services (notary_id, service_id, source, confidence, evidence)
                    values (%s, %s, 'paginegialle', %s, %s)
                    on conflict (notary_id, service_id, source)
                    do update set confidence = excluded.confidence, evidence = excluded.evidence
                    """,
                    (notary["id"], row[0], min(score / 100, 0.95), service["evidence"]),
                )


def enrich_one(conn, notary: dict, pg_url: str, threshold: int, apply: bool) -> dict:
    html = fetch_pg_html(pg_url)
    record = build_record(pg_url, html)
    score, reasons = score_match(notary, record)
    ok = score >= threshold
    if ok:
        save_enrichment(conn, notary, pg_url, record, score, reasons, apply)
        conn.commit()
    return {
        "pg_url": pg_url,
        "pg_name": record.name,
        "score": score,
        "match": ok,
        "reasons": reasons,
        "website": record.website,
        "emails": record.emails,
        "phones": record.phone_numbers,
        "services": extract_services(record),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Arricchisce i notai master Notariato con dati PagineGialle.")
    parser.add_argument("--notary-id")
    parser.add_argument("--source-slug")
    parser.add_argument("--pg-url", action="append", help="URL scheda PagineGialle; ripetibile.")
    parser.add_argument("--discover", action="store_true", help="Cerca candidate PG dal comune del notaio.")
    parser.add_argument("--candidate-limit", type=int, default=10)
    parser.add_argument("--threshold", type=int, default=70)
    parser.add_argument("--apply", action="store_true", help="Salva e applica arricchimenti se il match supera threshold.")
    parser.add_argument("--delay", type=float, default=1.5)
    args = parser.parse_args()

    if not args.notary_id and not args.source_slug:
        raise SystemExit("Serve --notary-id oppure --source-slug")

    with db_connect() as conn:
        notary = get_notary(conn, args.notary_id, args.source_slug)
        candidates = list(args.pg_url or [])
        if args.discover:
            candidates.extend(discover_from_search(notary.get("comune") or "", args.candidate_limit))
        seen = []
        for url in candidates:
            normalized = normalize_pg_url(url) or url
            if normalized not in seen:
                seen.append(normalized)

        results = []
        for idx, url in enumerate(seen, start=1):
            try:
                results.append(enrich_one(conn, notary, url, args.threshold, args.apply))
            except Exception as exc:
                results.append({"pg_url": url, "error": str(exc)})
            if idx < len(seen) and args.delay > 0:
                time.sleep(args.delay)

    print(json.dumps({"notary": {"id": str(notary["id"]), "full_name": notary["full_name"], "comune": notary["comune"]}, "results": results}, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
