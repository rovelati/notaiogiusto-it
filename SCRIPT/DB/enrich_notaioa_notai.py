#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import time
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras
import requests
from bs4 import BeautifulSoup


SCRIPT_DIR = Path(__file__).resolve().parent
BASE_URL = "https://notaioa.it"
SERVICES_URL = f"{BASE_URL}/servizi/"
SITEMAP_INDEX = f"{BASE_URL}/sitemap.php"
UA = "Mozilla/5.0 (compatible; NotaioGiustoBot/0.1; +https://notaiogiusto.it)"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9,en;q=0.8"})

PROFILE_SERVICE_ALIASES = {
    "compravendite-immobiliari": "compravendita-immobiliare",
    "mutui-e-finanziamenti": "mutuo-ipotecario",
    "successioni-e-testamenti": "successione-ereditaria",
    "donazioni": "donazione",
    "procure-e-deleghe": "procura-generale-speciale",
    "atti-internazionali": "apostille-e-legalizzazioni",
}

PROFILE_SERVICE_CATEGORIES = {
    "compravendite-immobiliari": "Atti Immobiliari",
    "mutui-e-finanziamenti": "Atti Immobiliari",
    "successioni-e-testamenti": "Diritto di Famiglia",
    "donazioni": "Diritto di Famiglia",
    "societa-e-imprese": "Diritto Societario",
    "atti-di-famiglia": "Diritto di Famiglia",
    "procure-e-deleghe": "Altri Servizi",
    "atti-internazionali": "Altri Servizi",
}


@dataclass
class NotaioaService:
    slug: str
    name: str
    category: str
    description: str
    documents: list[str]
    source_url: str = SERVICES_URL


@dataclass
class NotaioaRecord:
    source_url: str
    name: str = ""
    first_name: str = ""
    last_name: str = ""
    address: str = ""
    city: str = ""
    province: str = ""
    cap: str = ""
    district: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    lat: float | None = None
    lng: float | None = None
    description: str = ""
    services: list[dict] | None = None
    raw_jsonld: list[dict] | None = None


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


def fetch_html(url: str, timeout: int = 40) -> str:
    response = SESSION.get(url, timeout=timeout)
    response.raise_for_status()
    try:
        text = response.content.decode("utf-8")
    except UnicodeDecodeError:
        text = response.text
    content_type = response.headers.get("content-type", "")
    min_len = 500 if "xml" in content_type or url.endswith(".xml") or "sitemap" in url else 5000
    if len(text) < min_len:
        raise RuntimeError(f"HTML troppo corto per {url}: {len(text)} byte")
    return text


def norm(value: str | None) -> str:
    value = value or ""
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", value.lower()).strip()


def slugify(value: str) -> str:
    value = norm(value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


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


def text_or_empty(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip() if node else ""


def parse_jsonld(soup: BeautifulSoup) -> list[dict]:
    items: list[dict] = []
    for script in soup.select('script[type="application/ld+json"]'):
        raw = script.get_text(strip=True)
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            items.extend([item for item in parsed if isinstance(item, dict)])
        elif isinstance(parsed, dict):
            items.append(parsed)
    return items


def parse_services_page(html: str) -> list[NotaioaService]:
    soup = BeautifulSoup(html, "lxml")
    services: list[NotaioaService] = []
    for section in soup.select("section.servizi-section"):
        category_node = section.select_one(".servizi-section-header h2") or section.select_one("h2")
        category = text_or_empty(category_node)
        for card in section.select(".servizio-card"):
            name_node = card.select_one("h3, h4")
            desc_node = card.select_one(".servizio-card-body p")
            name = text_or_empty(name_node)
            if not name:
                continue
            documents = [text_or_empty(li) for li in card.select(".servizio-documenti li")]
            services.append(
                NotaioaService(
                    slug=slugify(name),
                    name=name,
                    category=category,
                    description=text_or_empty(desc_node),
                    documents=[doc for doc in documents if doc],
                )
            )
    return services


def extract_profile_services(soup: BeautifulSoup) -> list[dict]:
    services: list[dict] = []
    section = soup.select_one("#servizi")
    if not section:
        return services
    for card in section.select(".service-card"):
        name_node = card.select_one("h3, h4")
        desc_node = card.select_one("p")
        name = text_or_empty(name_node)
        if not name:
            continue
        profile_slug = slugify(name)
        services.append(
            {
                "slug": PROFILE_SERVICE_ALIASES.get(profile_slug, profile_slug),
                "name": name,
                "profile_slug": profile_slug,
                "category": PROFILE_SERVICE_CATEGORIES.get(profile_slug, "Da schede Notaioa"),
                "evidence": text_or_empty(desc_node),
            }
        )
    return services


def first_business_jsonld(items: list[dict]) -> dict:
    for item in items:
        types = item.get("@type")
        if isinstance(types, str):
            types = [types]
        if types and any(t in types for t in ["Notary", "LocalBusiness", "ProfessionalService", "LegalService"]):
            return item
    return {}


def parse_notary_profile(url: str, html: str) -> NotaioaRecord:
    soup = BeautifulSoup(html, "lxml")
    jsonld = parse_jsonld(soup)
    business = first_business_jsonld(jsonld)
    person = next((item for item in jsonld if item.get("@type") == "Person"), {})
    address = business.get("address") if isinstance(business.get("address"), dict) else {}
    geo = business.get("geo") if isinstance(business.get("geo"), dict) else {}

    name = person.get("name") or business.get("name") or text_or_empty(soup.select_one("h1"))
    first_name = person.get("givenName") or ""
    last_name = person.get("familyName") or ""
    services = extract_profile_services(soup)

    def as_float(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    return NotaioaRecord(
        source_url=url,
        name=name,
        first_name=first_name,
        last_name=last_name,
        address=address.get("streetAddress") or "",
        city=address.get("addressLocality") or "",
        province=address.get("addressRegion") or "",
        cap=address.get("postalCode") or "",
        phone=business.get("telephone") or "",
        email=business.get("email") or person.get("email") or "",
        website=business.get("sameAs") if isinstance(business.get("sameAs"), str) else "",
        lat=as_float(geo.get("latitude")),
        lng=as_float(geo.get("longitude")),
        description=business.get("description") or "",
        services=services,
        raw_jsonld=jsonld,
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


def score_match(notary: dict, record: NotaioaRecord) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    official_words = words(notary.get("full_name"))
    profile_words = words(" ".join([record.name, record.first_name, record.last_name]))
    overlap = official_words & profile_words
    if len(overlap) >= 2:
        score += 55
        reasons.append(f"nome overlap: {', '.join(sorted(overlap))}")
    elif overlap:
        score += 25
        reasons.append(f"nome parziale: {', '.join(sorted(overlap))}")

    official_phones = phone_tokens(notary.get("phone"))
    profile_phones = phone_tokens(record.phone)
    if official_phones and profile_phones and official_phones & profile_phones:
        score += 35
        reasons.append("telefono uguale")

    if norm(notary.get("email")) and norm(notary.get("email")) == norm(record.email):
        score += 25
        reasons.append("email uguale")

    comune = norm(notary.get("comune"))
    if comune and comune in norm(" ".join([record.city, record.province, record.address])):
        score += 20
        reasons.append("comune nel profilo")

    if record.services:
        score += 5
        reasons.append("servizi presenti")

    return score, reasons


def upsert_service(cur, slug: str, name: str, category: str, description: str, synonyms: list[str] | None = None):
    cur.execute(
        """
        update notai.services_taxonomy
        set description = coalesce(nullif(%s, ''), description),
            synonyms = case
                when synonyms = '{}'::text[] then %s
                else synonyms
            end,
            updated_at = now()
        where slug = %s
        returning coalesce(canonical_service_id, id)
        """,
        (description, synonyms or [name], slug),
    )
    row = cur.fetchone()
    return row[0] if row else None


def import_services(conn, apply: bool) -> list[dict]:
    services = parse_services_page(fetch_html(SERVICES_URL))
    if apply:
        with conn.cursor() as cur:
            for service in services:
                upsert_service(cur, service.slug, service.name, service.category, service.description, [service.name] + service.documents)
        conn.commit()
    return [asdict(service) for service in services]


def save_enrichment(
    conn,
    notary: dict,
    record: NotaioaRecord,
    score: int,
    reasons: list[str],
    apply: bool,
    apply_profile_services: bool = False,
) -> None:
    payload = asdict(record)
    payload["match_score"] = score
    payload["match_reasons"] = reasons
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into notai.notary_enrichments (notary_id, source, status, source_url, payload)
            values (%s, 'notaioa', 'completed', %s, %s)
            on conflict (notary_id, source, source_url) where source_url is not null
            do update set status = excluded.status, payload = excluded.payload, updated_at = now()
            """,
            (notary["id"], record.source_url, psycopg2.extras.Json(payload)),
        )
        if apply:
            cur.execute(
                """
                update notai.notaries
                set lat = coalesce(lat, %s),
                    lng = coalesce(lng, %s),
                    raw_import = raw_import || jsonb_build_object('notaioa', %s::jsonb)
                where id = %s
                """,
                (
                    record.lat,
                    record.lng,
                    json.dumps({"source_url": record.source_url, "match_score": score, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}),
                    notary["id"],
                ),
            )
            if not apply_profile_services:
                return
            for service in record.services or []:
                service_id = upsert_service(
                    cur,
                    service["slug"],
                    service["name"],
                    service.get("category", "Da schede Notaioa"),
                    service.get("evidence", ""),
                    [service["name"], service.get("profile_slug", "")],
                )
                if not service_id:
                    continue
                cur.execute(
                    """
                    insert into notai.notary_services (notary_id, service_id, source, confidence, evidence)
                    values (%s, %s, 'notaioa', %s, %s)
                    on conflict (notary_id, service_id, source)
                    do update set confidence = excluded.confidence, evidence = excluded.evidence
                    """,
                    (notary["id"], service_id, min(score / 100, 0.95), service.get("evidence", service["name"])),
                )


def enrich_one(conn, notary: dict, url: str, threshold: int, apply: bool, apply_profile_services: bool = False) -> dict:
    record = parse_notary_profile(url, fetch_html(url))
    score, reasons = score_match(notary, record)
    matched = score >= threshold
    if matched:
        save_enrichment(conn, notary, record, score, reasons, apply, apply_profile_services)
        conn.commit()
    return {
        "url": url,
        "name": record.name,
        "score": score,
        "match": matched,
        "reasons": reasons,
        "phone": record.phone,
        "email": record.email,
        "city": record.city,
        "services": record.services,
    }


def sitemap_notary_urls(limit: int | None = None) -> list[str]:
    index_xml = fetch_html(SITEMAP_INDEX)
    soup = BeautifulSoup(index_xml, "xml")
    sitemap_urls = [loc.get_text(strip=True) for loc in soup.find_all("loc") if "sitemap-notai.php" in loc.get_text(strip=True)]
    out: list[str] = []
    for sitemap_url in sitemap_urls:
        xml = fetch_html(sitemap_url)
        sitemap = BeautifulSoup(xml, "xml")
        for loc in sitemap.find_all("loc"):
            url = loc.get_text(strip=True)
            if urlparse(url).path.startswith("/notaio/"):
                out.append(url)
                if limit and len(out) >= limit:
                    return out
        time.sleep(1.0)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Arricchisce i notai da Notaioa.it come fonte secondaria.")
    parser.add_argument("--import-services", action="store_true")
    parser.add_argument("--notary-id")
    parser.add_argument("--source-slug")
    parser.add_argument("--notaioa-url")
    parser.add_argument("--sitemap-urls", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--threshold", type=int, default=80)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--apply-profile-services", action="store_true")
    args = parser.parse_args()

    with db_connect() as conn:
        output: dict = {}
        if args.import_services:
            output["services"] = import_services(conn, args.apply)
        if args.sitemap_urls:
            output["urls"] = sitemap_notary_urls(args.limit)
        if args.notaioa_url:
            if not args.notary_id and not args.source_slug:
                raise SystemExit("Per --notaioa-url serve --notary-id oppure --source-slug")
            notary = get_notary(conn, args.notary_id, args.source_slug)
            output["enrichment"] = enrich_one(conn, notary, args.notaioa_url, args.threshold, args.apply, args.apply_profile_services)
    print(json.dumps(output, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
