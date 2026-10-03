#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import os
import re
import time
import unicodedata
import urllib.parse
from dataclasses import asdict, dataclass
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from bs4 import BeautifulSoup


SCRIPT_DIR = Path(__file__).resolve().parent
VIRGILIO_BASE = "https://aziende.virgilio.it"
VIRGILIO_SEARCH_BASE = "https://www.virgilio.it"
NOTARY_TERMS = {"notaio", "notai", "notarile", "notarili", "studio notarile", "studi notarili"}
WEBSITE_BLOCKLIST = (
    "aziende.virgilio.it",
    "virgilio.it",
    "libero.it",
    "pgcasa.it",
    "paginebianche.it",
    "paginegialle.it",
    "tuttocitta.it",
    "italiaonline.it",
    "img.italiaonline.it",
    "dilei.it",
)
DEFAULT_UA = (
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36"
)

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": DEFAULT_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
)


@dataclass
class VirgilioRecord:
    url: str
    name: str = ""
    category: str = ""
    address: str = ""
    city: str = ""
    cap: str = ""
    phone: str = ""
    website: str = ""
    image: str = ""
    lat: float | None = None
    lng: float | None = None
    short_description: str = ""
    description: str = ""
    opening_hours: dict | None = None
    services: list[dict] | None = None


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


def slugify_city(comune: str) -> str:
    value = norm(comune).replace("'", " ")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value


def fetch_html(url: str, timeout: int = 35) -> str:
    resp = SESSION.get(url, timeout=timeout)
    resp.raise_for_status()
    try:
        text = resp.content.decode("utf-8")
    except UnicodeDecodeError:
        text = resp.text
    low = text[:5000].lower()
    if any(marker in low for marker in ("captcha", "challenge-container", "access denied", "forbidden")) and len(text) < 30000:
        raise RuntimeError(f"Virgilio ha restituito pagina anti-bot/non valida per {url}")
    if len(text) < 10000:
        raise RuntimeError(f"HTML Virgilio troppo corto/non valido per {url}: {len(text)} byte")
    return text


def search_url(comune: str) -> str:
    return f"{VIRGILIO_SEARCH_BASE}/italia/{slugify_city(comune)}/cat/NOTAI_STUDI.html"


def normalize_virgilio_url(href: str) -> str | None:
    if not href:
        return None
    href = urllib.parse.urljoin(VIRGILIO_SEARCH_BASE, href)
    parsed = urllib.parse.urlparse(href)
    if parsed.netloc != "aziende.virgilio.it":
        return None
    path = parsed.path.rstrip("/")
    if not path.startswith("/notaio/"):
        return None
    return urllib.parse.urlunparse(("https", parsed.netloc, path, "", "", ""))


def discover_from_search(comune: str, limit: int = 20) -> list[str]:
    """Raccoglie schede aziende.virgilio.it dal listing comunale, seguendo la paginazione."""
    first_url = search_url(comune)
    to_visit = [first_url]
    visited_pages: set[str] = set()
    urls: list[str] = []
    seen: set[str] = set()

    while to_visit and len(urls) < limit:
        page_url = to_visit.pop(0)
        if page_url in visited_pages:
            continue
        visited_pages.add(page_url)
        html_text = fetch_html(page_url)
        soup = BeautifulSoup(html_text, "lxml")

        for link in soup.select("a[href]"):
            href = link.get("href", "")
            detail = normalize_virgilio_url(href)
            if detail and detail not in seen:
                seen.add(detail)
                urls.append(detail)
                if len(urls) >= limit:
                    break

        if len(urls) >= limit:
            break

        # Pagine tipo /italia/milano/cat/NOTAI_STUDI_(2).html?...
        for link in soup.select("a[href*='NOTAI_STUDI_']"):
            href = link.get("href", "")
            abs_url = urllib.parse.urljoin(page_url, href)
            parsed = urllib.parse.urlparse(abs_url)
            if "NOTAI_STUDI_" not in parsed.path:
                continue
            clean = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", parsed.query, ""))
            if clean not in visited_pages and clean not in to_visit:
                to_visit.append(clean)

    return urls[:limit]


def text_or_empty(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip() if node else ""


def attr_content(soup: BeautifulSoup, selector: str, attr: str = "content") -> str:
    node = soup.select_one(selector)
    return (node.get(attr) or "").strip() if node else ""


def extract_map_payload(soup: BeautifulSoup) -> dict:
    for node in soup.select('[onclick*="openMapLayer17"]'):
        onclick = node.get("onclick", "")
        match = re.search(r"openMapLayer17\((\{.*?\})\);", onclick, flags=re.S)
        if not match:
            continue
        payload = html.unescape(match.group(1))
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            continue
    return {}


def extract_opening_hours(soup: BeautifulSoup) -> dict:
    hours: dict[str, list[str]] = {}
    for row in soup.select(".orari_apertura td"):
        parts = [p for p in row.get_text(" ", strip=True).split(" ") if p]
        if not parts:
            continue
        day = parts[0]
        value = " ".join(parts[1:]).strip()
        if day:
            hours[day] = [value] if value else []
    return hours


def clean_host(url: str) -> str:
    host = urllib.parse.urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def domain_matches_name(url: str, name: str) -> bool:
    host = clean_host(url)
    if not host or any(blocked in host for blocked in WEBSITE_BLOCKLIST):
        return False
    compact_host = re.sub(r"[^a-z0-9]", "", host)
    tokens = [token for token in words(name) if len(token) >= 4 and token not in {"notaio", "notai", "studio", "notarile"}]
    return any(token in compact_host for token in tokens)


def service_keywords() -> dict[str, list[str]]:
    return {
        "atto-di-donazione": ["atto di donazione", "atti di donazione", "donazione", "donazioni"],
        "pratica-di-successione": ["pratica di successione", "pratiche di successione", "successione", "successioni"],
        "testamento": ["testamento", "testamenti", "pratiche testamentarie", "mortis causa"],
        "convenzioni-matrimoniali": ["convenzioni matrimoniali", "convenzione matrimoniale"],
        "eredita": ["eredita", "eredità", "ereditario"],
        "separazione-dei-beni": ["separazione dei beni"],
        "diritto-di-famiglia": ["diritto di famiglia"],
        "compravendita-immobiliare": ["trasferimenti immobiliari", "compravendita", "atti di compravendita", "prima casa"],
        "mutuo": ["mutuo", "mutui", "stipulazione dei mutui", "atti ipotecari", "garanzia ipotecaria"],
        "diritto-societario": ["diritto societario", "atti societari", "costituzione", "cessazioni di aziende", "modifiche societarie"],
        "procura": ["procura", "procure"],
        "consulenza-notarile": ["consulenza", "consulenze", "consulenza professionale"],
        "certificazioni-notarili": ["certificazioni notarili", "certificazione notarile"],
        "atti-di-divisione": ["atti di divisione", "atto di divisione", "divisione"],
        "prima-casa": ["prima casa", "atti per la prima casa"],
        "estratti-autentici-documenti": ["estratti autentici", "estratti autentici di documenti"],
        "servizi-notarili-casa": ["servizi notarili per la casa"],
    }


def extract_services_from_text(value: str) -> list[dict]:
    text = norm(value)
    found: list[dict] = []
    for slug, keys in service_keywords().items():
        evidence = next((key for key in keys if norm(key) in text), None)
        if evidence:
            found.append({"slug": slug, "evidence": evidence})
    return found


def parse_record(url: str, raw_html: str) -> VirgilioRecord:
    soup = BeautifulSoup(raw_html, "lxml")
    map_payload = extract_map_payload(soup)

    name = text_or_empty(soup.select_one('h1[itemprop="name"]')) or map_payload.get("nsgn", "")
    category = text_or_empty(soup.select_one("#categoriaPrimaria")) or map_payload.get("ctgr0", "")
    street = text_or_empty(soup.select_one('[itemprop="streetAddress"]')) or map_payload.get("via", "")
    cap = text_or_empty(soup.select_one('[itemprop="postalCode"]'))
    locality_parts: list[str] = []
    for node in soup.select('[itemprop="addressLocality"]'):
        value = text_or_empty(node)
        if value and value not in locality_parts:
            locality_parts.append(value)
    city = " ".join(locality_parts).strip() or map_payload.get("loc", "")
    address = " ".join(part for part in [street, cap, city] if part).strip()
    website = ""
    for meta in soup.select('meta[itemprop="url"]'):
        candidate = (meta.get("content") or "").strip()
        if candidate and domain_matches_name(candidate, name):
            website = candidate
            break
    if not website:
        for link in soup.select('a[href^="http"]'):
            candidate = (link.get("href") or "").strip()
            link_text = text_or_empty(link)
            if candidate and domain_matches_name(candidate, name) and ("sito" in norm(link_text) or domain_matches_name(candidate, name)):
                website = candidate
                break
    image = attr_content(soup, 'meta[itemprop="image"]') or map_payload.get("lg", "")
    phone = map_payload.get("tel", "")

    lat = lng = None
    if map_payload.get("ll") and ";" in map_payload["ll"]:
        lat_s, lng_s = map_payload["ll"].split(";", 1)
        try:
            lat, lng = float(lat_s), float(lng_s)
        except ValueError:
            lat = lng = None

    short_description = text_or_empty(soup.select_one("article.place_info cite"))
    description = text_or_empty(soup.select_one("article.place_info p"))
    services = extract_services_from_text(" ".join([name, category, short_description, description]))

    return VirgilioRecord(
        url=url,
        name=name,
        category=category,
        address=address,
        city=city,
        cap=cap,
        phone=phone,
        website=website,
        image=image,
        lat=lat,
        lng=lng,
        short_description=short_description,
        description=description,
        opening_hours=extract_opening_hours(soup),
        services=services,
    )


def get_notary(conn, notary_id: str | None, source_slug: str | None):
    where = "id = %s" if notary_id else "source_slug = %s"
    value = notary_id or source_slug
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(f"select * from notai.notaries where {where} limit 1", (value,))
        row = cur.fetchone()
        if not row:
            raise RuntimeError("Notaio non trovato nel master Notariato")
        return row


def score_match(notary: dict, record: VirgilioRecord) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    overlap = words(notary.get("full_name")) & words(record.name)
    if len(overlap) >= 2:
        score += 55
        reasons.append(f"nome overlap: {', '.join(sorted(overlap))}")
    elif overlap:
        score += 25
        reasons.append(f"nome parziale: {', '.join(sorted(overlap))}")

    comune = norm(notary.get("comune"))
    if comune and comune in norm(" ".join([record.city, record.address, record.description])):
        score += 20
        reasons.append("comune nel testo Virgilio")

    official_phones = phone_tokens(notary.get("phone"))
    vir_phones = phone_tokens(record.phone)
    if official_phones and vir_phones and official_phones & vir_phones:
        score += 35
        reasons.append("telefono uguale")

    if any(term in norm(record.category) for term in NOTARY_TERMS) or any(term in norm(record.name) for term in NOTARY_TERMS):
        score += 10
        reasons.append("categoria notarile")

    if record.website:
        score += 5
        reasons.append("sito presente")
    if record.description:
        score += 5
        reasons.append("descrizione presente")

    return score, reasons


def save_enrichment(conn, notary: dict, source_url: str, record: VirgilioRecord, score: int, reasons: list[str], apply: bool) -> None:
    payload = asdict(record)
    payload["match_score"] = score
    payload["match_reasons"] = reasons

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into notai.notary_enrichments (notary_id, source, status, source_url, payload)
            values (%s, 'virgilio', 'completed', %s, %s)
            on conflict (notary_id, source, source_url) where source_url is not null
            do update set status = excluded.status, payload = excluded.payload, updated_at = now()
            """,
            (notary["id"], source_url, psycopg2.extras.Json(payload)),
        )
        if apply:
            cur.execute(
                """
                update notai.notaries
                set website = coalesce(nullif(website, ''), nullif(%s, '')),
                    phone = coalesce(nullif(phone, ''), nullif(%s, '')),
                    lat = coalesce(lat, %s),
                    lng = coalesce(lng, %s),
                    description = coalesce(nullif(description, ''), nullif(%s, '')),
                    raw_import = raw_import || jsonb_build_object('virgilio', %s::jsonb)
                where id = %s
                """,
                (
                    record.website,
                    record.phone,
                    record.lat,
                    record.lng,
                    record.description,
                    json.dumps({"source_url": source_url, "match_score": score, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}),
                    notary["id"],
                ),
            )
            for service in record.services or []:
                cur.execute(
                    """
                    select coalesce(source.canonical_service_id, source.id)
                    from notai.services_taxonomy source
                    where source.slug = %s
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
                    values (%s, %s, 'virgilio', %s, %s)
                    on conflict (notary_id, service_id, source)
                    do update set confidence = excluded.confidence, evidence = excluded.evidence
                    """,
                    (notary["id"], row[0], min(score / 100, 0.95), service["evidence"]),
                )


def enrich_one(conn, notary: dict, url: str, threshold: int, apply: bool) -> dict:
    normalized = normalize_virgilio_url(url) or url
    raw_html = fetch_html(normalized)
    record = parse_record(normalized, raw_html)
    score, reasons = score_match(notary, record)
    ok = score >= threshold
    if ok:
        save_enrichment(conn, notary, normalized, record, score, reasons, apply)
        conn.commit()
    return {
        "url": normalized,
        "name": record.name,
        "score": score,
        "match": ok,
        "reasons": reasons,
        "phone": record.phone,
        "website": record.website,
        "city": record.city,
        "address": record.address,
        "lat": record.lat,
        "lng": record.lng,
        "services": record.services,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Arricchisce i notai master Notariato con dati aziende.virgilio.it.")
    parser.add_argument("--notary-id")
    parser.add_argument("--source-slug")
    parser.add_argument("--virgilio-url", action="append")
    parser.add_argument("--discover", action="store_true")
    parser.add_argument("--candidate-limit", type=int, default=10)
    parser.add_argument("--threshold", type=int, default=70)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--delay", type=float, default=1.5)
    args = parser.parse_args()

    if not args.notary_id and not args.source_slug:
        raise SystemExit("Serve --notary-id oppure --source-slug")

    with db_connect() as conn:
        notary = get_notary(conn, args.notary_id, args.source_slug)
        candidates = list(args.virgilio_url or [])
        if args.discover:
            candidates.extend(discover_from_search(notary.get("comune") or "", args.candidate_limit))
        seen: list[str] = []
        for url in candidates:
            normalized = normalize_virgilio_url(url) or url
            if normalized not in seen:
                seen.append(normalized)

        results = []
        for idx, url in enumerate(seen, start=1):
            try:
                results.append(enrich_one(conn, notary, url, args.threshold, args.apply))
            except Exception as exc:
                results.append({"url": url, "error": str(exc)})
            if idx < len(seen) and args.delay > 0:
                time.sleep(args.delay)

    print(json.dumps({"notary": {"id": str(notary["id"]), "full_name": notary["full_name"], "comune": notary["comune"]}, "results": results}, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
