#!/usr/bin/env python3
"""Arricchisce i notai tramite Google Places partendo dal NAP.

Il matching è conservativo: telefono, nome, indirizzo/civico, comune e distanza
concorrono a un punteggio. I dati ufficiali Notariato non vengono sovrascritti:
Google completa solo telefono, sito e coordinate mancanti e alimenta le tabelle
dedicate a recensioni e sentiment.

Per sicurezza lo script è dry-run per impostazione predefinita. Usare --apply
solo dopo avere verificato report e punteggi su un campione.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import math
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable, Optional

import psycopg2
from psycopg2.extras import Json, RealDictCursor
import requests


SCRIPT_DIR = Path(__file__).resolve().parent
ENV_FILE = SCRIPT_DIR / ".env"
FIND_PLACE_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
DETAIL_FIELDS = ",".join(
    [
        "place_id",
        "name",
        "formatted_address",
        "geometry",
        "formatted_phone_number",
        "international_phone_number",
        "website",
        "url",
        "opening_hours",
        "rating",
        "user_ratings_total",
        "reviews",
        "photos",
        "business_status",
        "types",
    ]
)
SEARCH_FIELDS = (
    "place_id,name,formatted_address,geometry,types"
)
SOURCE = "google_places"
DEFAULT_TTL_DAYS = 30

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("google-places-notai")


def load_env(path: Path = ENV_FILE) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:]
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_env()


@dataclass
class Notary:
    id: str
    slug: str
    name: str
    address: str
    comune: str
    cap: str
    phone: str
    website: str
    lat: Optional[float]
    lng: Optional[float]
    google_place_id: str


class CostGuard:
    """Stima prudenziale; i prezzi effettivi dipendono dal listino GCP attivo."""

    def __init__(self, max_usd: float):
        self.max_usd = max(0.0, max_usd)
        self.searches = 0
        self.details = 0
        self.search_cost = float(os.getenv("GOOGLE_PLACES_SEARCH_COST_USD", "0.032"))
        self.details_cost = float(os.getenv("GOOGLE_PLACES_DETAILS_COST_USD", "0.017"))

    @property
    def total(self) -> float:
        return self.searches * self.search_cost + self.details * self.details_cost

    def reserve(self, kind: str) -> None:
        increment = self.search_cost if kind == "search" else self.details_cost
        if self.max_usd and self.total + increment > self.max_usd:
            raise RuntimeError(
                f"Budget API esaurito: stima ${self.total:.3f}, limite ${self.max_usd:.3f}"
            )
        if kind == "search":
            self.searches += 1
        else:
            self.details += 1

    def as_dict(self) -> dict[str, Any]:
        return {
            "search_calls": self.searches,
            "details_calls": self.details,
            "estimated_usd": round(self.total, 4),
            "budget_usd": self.max_usd,
        }


class GooglePlaces:
    def __init__(self, api_key: str, budget: CostGuard):
        self.api_key = api_key
        self.budget = budget
        self.session = requests.Session()
        referer = os.getenv("GOOGLE_MAPS_REFERER", "").strip()
        self.headers = {"Referer": referer} if referer else {}

    def _get(self, url: str, params: dict[str, Any], kind: str) -> dict[str, Any]:
        self.budget.reserve(kind)
        response = self.session.get(
            url,
            params={**params, "key": self.api_key, "language": "it", "region": "it"},
            headers=self.headers,
            timeout=25,
        )
        response.raise_for_status()
        data = response.json()
        status = data.get("status")
        if status not in {"OK", "ZERO_RESULTS"}:
            raise RuntimeError(
                f"Google Places {status}: {data.get('error_message') or 'errore API'}"
            )
        return data

    def find_phone(self, phone: str, location_bias: str = "") -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "input": phone,
            "inputtype": "phonenumber",
            "fields": SEARCH_FIELDS,
        }
        if location_bias:
            params["locationbias"] = location_bias
        data = self._get(FIND_PLACE_URL, params, "search")
        return list(data.get("candidates") or [])

    def text_search(self, query: str, location_bias: str = "") -> list[dict[str, Any]]:
        params: dict[str, Any] = {"query": query}
        if location_bias:
            params["location"] = location_bias.removeprefix("point:")
            params["radius"] = 10000
        data = self._get(TEXT_SEARCH_URL, params, "search")
        return list(data.get("results") or [])[:5]

    def details(self, place_id: str) -> Optional[dict[str, Any]]:
        data = self._get(
            DETAILS_URL,
            {"place_id": place_id, "fields": DETAIL_FIELDS, "reviews_sort": "most_relevant"},
            "details",
        )
        return data.get("result")


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return " ".join(re.findall(r"[a-z0-9]+", text))


NAME_STOP = {
    "notaio",
    "notai",
    "notarile",
    "studio",
    "dott",
    "dottore",
    "dr",
    "avv",
    "avvocato",
    "associato",
    "associati",
}
ADDRESS_STOP = {
    "via",
    "viale",
    "piazza",
    "piazzale",
    "corso",
    "strada",
    "largo",
    "della",
    "delle",
    "degli",
    "dei",
    "del",
    "di",
    "italia",
}


def tokens(value: Any, stop: set[str]) -> set[str]:
    return {item for item in normalize(value).split() if len(item) >= 3 and item not in stop}


def normalized_phone(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if digits.startswith("0039"):
        digits = digits[4:]
    elif digits.startswith("39") and len(digits) > 10:
        digits = digits[2:]
    return digits


def international_phone(value: Any) -> str:
    digits = normalized_phone(value)
    return f"+39{digits}" if digits else ""


def street_number(value: Any) -> str:
    match = re.search(r"\b(\d{1,5})(?:\s*[/\\-]?\s*[a-z])?\b", normalize(value))
    return match.group(1) if match else ""


def distance_km(a_lat: Optional[float], a_lng: Optional[float], b_lat: Any, b_lng: Any) -> Optional[float]:
    if a_lat is None or a_lng is None or b_lat is None or b_lng is None:
        return None
    try:
        lat1, lng1, lat2, lng2 = map(float, (a_lat, a_lng, b_lat, b_lng))
    except (TypeError, ValueError):
        return None
    to_rad = math.pi / 180
    d_lat = (lat2 - lat1) * to_rad
    d_lng = (lng2 - lng1) * to_rad
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1 * to_rad)
        * math.cos(lat2 * to_rad)
        * math.sin(d_lng / 2) ** 2
    )
    return 6371 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def match_candidate(notary: Notary, candidate: dict[str, Any]) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    candidate_phone = (
        candidate.get("international_phone_number")
        or candidate.get("formatted_phone_number")
        or ""
    )
    if notary.phone and candidate_phone and normalized_phone(notary.phone) == normalized_phone(candidate_phone):
        score += 55
        reasons.append("telefono esatto +55")

    expected_name = tokens(notary.name, NAME_STOP)
    found_name = tokens(candidate.get("name"), NAME_STOP)
    shared_name = expected_name & found_name
    name_ratio = SequenceMatcher(None, normalize(notary.name), normalize(candidate.get("name"))).ratio()
    surname = normalize(notary.name).split()[-1:] or []
    if surname and surname[0] in found_name:
        score += 24
        reasons.append("cognome presente +24")
    if expected_name and len(shared_name) >= min(2, len(expected_name)):
        score += 18
        reasons.append("nome coerente +18")
    elif name_ratio >= 0.72:
        score += 12
        reasons.append("nome simile +12")

    found_address = candidate.get("formatted_address") or ""
    expected_street = tokens(notary.address, ADDRESS_STOP)
    found_street = tokens(found_address, ADDRESS_STOP)
    shared_street = {item for item in expected_street & found_street if not item.isdigit()}
    expected_number = street_number(notary.address)
    found_number = street_number(found_address)
    if expected_number and found_number and expected_number == found_number:
        score += 18
        reasons.append("civico esatto +18")
    if shared_street:
        score += 16
        reasons.append("via coerente +16")
    if notary.comune and normalize(notary.comune) in normalize(found_address):
        score += 14
        reasons.append("comune coerente +14")

    geo = (candidate.get("geometry") or {}).get("location") or {}
    distance = distance_km(notary.lat, notary.lng, geo.get("lat"), geo.get("lng"))
    if distance is not None:
        if distance <= 0.5:
            score += 15
            reasons.append(f"distanza {distance:.2f} km +15")
        elif distance <= 2:
            score += 10
            reasons.append(f"distanza {distance:.2f} km +10")
        elif distance > 20:
            score -= 35
            reasons.append(f"distanza anomala {distance:.1f} km -35")

    return score, reasons


def fetch_notaries(conn, args: argparse.Namespace) -> list[Notary]:
    conditions = ["status = 'published'", "full_name <> ''"]
    params: list[Any] = []
    if args.notary_id:
        params.append(args.notary_id)
        conditions.append(f"id = %s::uuid")
    if args.slug:
        params.append(args.slug)
        conditions.append("source_slug = %s")
    if not args.include_checked and not args.notary_id and not args.slug:
        params.append(args.max_age_days)
        conditions.append(
            "(google_checked_at is null or google_checked_at < now() - (%s || ' days')::interval)"
        )
    params.append(args.limit)
    sql = f"""
        select id::text, source_slug, full_name, coalesce(address, '') address,
               coalesce(comune, '') comune, coalesce(cap, '') cap,
               coalesce(phone, '') phone, coalesce(website, '') website,
               lat, lng, coalesce(google_place_id, '') google_place_id
        from notai.notaries
        where {' and '.join(conditions)}
        order by google_checked_at nulls first, updated_at desc
        limit %s
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return [
        Notary(
            id=row["id"],
            slug=row["source_slug"] or "",
            name=row["full_name"] or "",
            address=row["address"] or "",
            comune=row["comune"] or "",
            cap=row["cap"] or "",
            phone=row["phone"] or "",
            website=row["website"] or "",
            lat=float(row["lat"]) if row["lat"] is not None else None,
            lng=float(row["lng"]) if row["lng"] is not None else None,
            google_place_id=row["google_place_id"] or "",
        )
        for row in rows
    ]


def place_already_owned(conn, notary_id: str, place_id: str) -> Optional[dict[str, str]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            select id::text, full_name
            from notai.notaries
            where google_place_id = %s and id <> %s::uuid
            limit 1
            """,
            (place_id, notary_id),
        )
        return cur.fetchone()


def candidate_queries(notary: Notary) -> list[str]:
    raw = [
        f"Notaio {notary.name}, {notary.address}, {notary.comune}, Italia",
        f"{notary.name} notaio {notary.comune}",
        f"Studio notarile {notary.name} {notary.comune}",
    ]
    return list(dict.fromkeys(query.strip(" ,") for query in raw if query.strip(" ,")))


def find_match(
    conn,
    client: GooglePlaces,
    notary: Notary,
    threshold: int,
    manual_place_id: str = "",
) -> tuple[Optional[dict[str, Any]], dict[str, Any]]:
    if manual_place_id or notary.google_place_id:
        place_id = manual_place_id or notary.google_place_id
        return {"place_id": place_id}, {
            "method": "manual" if manual_place_id else "refresh",
            "score": 100,
            "reasons": ["place_id esplicito"],
        }

    bias = f"point:{notary.lat},{notary.lng}" if notary.lat is not None and notary.lng is not None else ""
    candidates: list[tuple[dict[str, Any], str]] = []
    if notary.phone:
        for item in client.find_phone(international_phone(notary.phone), bias):
            candidates.append((item, "phone"))
    for query in candidate_queries(notary):
        for item in client.text_search(query, bias):
            candidates.append((item, f"text:{query}"))
        if candidates:
            break

    best: Optional[dict[str, Any]] = None
    best_meta: dict[str, Any] = {"method": "none", "score": 0, "reasons": []}
    seen: set[str] = set()
    for candidate, method in candidates:
        place_id = str(candidate.get("place_id") or "")
        if not place_id or place_id in seen:
            continue
        seen.add(place_id)
        owner = place_already_owned(conn, notary.id, place_id)
        if owner:
            logger.warning(
                "Place %s già associato a %s (%s)",
                place_id,
                owner["full_name"],
                owner["id"],
            )
            continue
        score, reasons = match_candidate(notary, candidate)
        if score > int(best_meta["score"]):
            best = candidate
            best_meta = {
                "method": method,
                "score": score,
                "reasons": reasons,
                "candidate_name": candidate.get("name"),
                "candidate_address": candidate.get("formatted_address"),
            }
    if not best or int(best_meta["score"]) < threshold:
        return None, best_meta
    return best, best_meta


SENTIMENT_AXES: dict[str, dict[str, list[str]]] = {
    "professionalita": {
        "positive": ["professional", "competent", "preparat", "precis", "scrupolos", "seri"],
        "negative": ["incompetent", "imprecis", "errore", "superficial"],
    },
    "chiarezza": {
        "positive": ["chiar", "spieg", "trasparent", "comprensib", "esaustiv"],
        "negative": ["poco chiar", "confus", "non spieg", "informazioni insufficienti"],
    },
    "disponibilita": {
        "positive": ["disponibil", "gentil", "cordial", "ascolto", "cortes"],
        "negative": ["scortes", "indisponibil", "maleducat", "non risponde"],
    },
    "rapidita": {
        "positive": ["rapid", "veloc", "puntual", "tempestiv", "attesa brev", "senza attesa"],
        "negative": ["lent", "ritard", "tempi lunghi", "lunga attesa", "sei mesi", "mesi per", "mai portato a termine"],
    },
    "costi": {
        "positive": ["prezzo onesto", "prezzi onesti", "costi onesti", "ottimi sono i prezzi", "costo chiar", "preventivo chiar", "convenient"],
        "negative": ["costos", "caro", "costo eccessiv", "sorpresa sul prezzo"],
    },
    "comunicazione": {
        "positive": ["comunicazione chiar", "rispost rapid", "sempre reperibil", "facile da contattare"],
        "negative": ["introvabil", "irreperibil", "non risponde", "lunga nelle risposte", "lunghe nelle risposte"],
    },
}
AXIS_LABELS = {
    "professionalita": "Professionalità",
    "chiarezza": "Chiarezza",
    "disponibilita": "Disponibilità",
    "rapidita": "Tempi",
    "costi": "Trasparenza dei costi",
    "comunicazione": "Comunicazione",
}


def sentiment_from_reviews(
    reviews: Iterable[dict[str, Any]],
    aggregate_rating: Any,
    aggregate_count: Any,
) -> dict[str, Any]:
    rows = list(reviews)
    axes: dict[str, dict[str, Any]] = {}
    for axis, lexicon in SENTIMENT_AXES.items():
        positive = 0
        negative = 0
        evidence: list[str] = []
        for review in rows:
            text = normalize(review.get("text"))
            pos = any(normalize(term) in text for term in lexicon["positive"])
            neg = any(normalize(term) in text for term in lexicon["negative"])
            if pos:
                positive += 1
            if neg:
                negative += 1
            if (pos or neg) and len(evidence) < 2:
                evidence.append(str(review.get("_id") or ""))
        total = positive + negative
        score = positive / total if total else None
        label = "neutral"
        if score is not None and score >= 0.67:
            label = "positive"
        elif score is not None and score <= 0.33:
            label = "negative"
        axes[axis] = {
            "label": label,
            "score": round(score, 2) if score is not None else None,
            "positive_hits": positive,
            "negative_hits": negative,
            "evidence": [item for item in evidence if item],
        }

    rating = float(aggregate_rating) if aggregate_rating is not None else None
    overall_score = (rating - 1) / 4 if rating is not None else 0.5
    overall_score = min(1.0, max(0.0, overall_score))
    overall_label = "positive" if overall_score >= 0.75 else "negative" if overall_score <= 0.40 else "neutral"
    strengths = [
        AXIS_LABELS[axis]
        for axis, value in axes.items()
        if value["label"] == "positive"
    ][:3]
    concerns = [
        AXIS_LABELS[axis]
        for axis, value in axes.items()
        if value["label"] == "negative"
    ][:3]
    sample_count = len(rows)
    total_count = int(aggregate_count or sample_count)
    if sample_count:
        summary = (
            f"Sintesi automatica su {sample_count} recensioni Google mostrate dall'API"
            f" rispetto a {total_count} valutazioni complessive."
        )
    else:
        summary = "Nessun testo di recensione disponibile per l'analisi automatica."
    return {
        "label": overall_label,
        "score": round(overall_score, 2),
        "strengths": strengths,
        "concerns": concerns,
        "summary": summary,
        "axes": axes,
        "sample_count": sample_count,
        "aggregate_count": total_count,
        "sample_is_partial": total_count > sample_count,
        "method": "transparent_lexicon_v1",
    }


def review_id(place_id: str, review: dict[str, Any]) -> str:
    token = "|".join(
        [
            place_id,
            str(review.get("author_url") or review.get("author_name") or ""),
            str(review.get("time") or ""),
            str(review.get("text") or ""),
        ]
    )
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def compact_photos(details: dict[str, Any], limit: int = 5) -> list[dict[str, Any]]:
    result = []
    for photo in list(details.get("photos") or [])[:limit]:
        reference = photo.get("photo_reference")
        if not reference:
            continue
        result.append(
            {
                "reference": reference,
                "width": photo.get("width"),
                "height": photo.get("height"),
                "attributions": photo.get("html_attributions") or [],
            }
        )
    return result


def compact_hours(details: dict[str, Any]) -> dict[str, Any]:
    hours = details.get("opening_hours") or {}
    return {
        "open_now": hours.get("open_now"),
        "weekday_text": hours.get("weekday_text") or [],
        "periods": hours.get("periods") or [],
    }


def write_no_match(conn, notary: Notary, meta: dict[str, Any], apply: bool) -> None:
    if not apply:
        return
    payload = {
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "match": meta,
        "policy": {"refresh_after_days": DEFAULT_TTL_DAYS},
    }
    with conn.cursor() as cur:
        cur.execute(
            "update notai.notaries set google_checked_at = now() where id = %s::uuid",
            (notary.id,),
        )
        cur.execute(
            """
            insert into notai.notary_enrichments (notary_id, source, status, payload)
            values (%s::uuid, %s, 'no_match', %s)
            """,
            (notary.id, SOURCE, Json(payload)),
        )


def write_details(
    conn,
    notary: Notary,
    details: dict[str, Any],
    match_meta: dict[str, Any],
    apply: bool,
    skip_reviews: bool,
) -> dict[str, Any]:
    place_id = str(details.get("place_id") or "")
    geometry = (details.get("geometry") or {}).get("location") or {}
    phone = details.get("international_phone_number") or details.get("formatted_phone_number")
    photos = compact_photos(details)
    hours = compact_hours(details)
    raw_reviews = list(details.get("reviews") or [])[:5]
    reviews = []
    for review in raw_reviews:
        item = dict(review)
        item["_id"] = review_id(place_id, item)
        reviews.append(item)
    sentiment = sentiment_from_reviews(
        reviews,
        details.get("rating"),
        details.get("user_ratings_total"),
    )
    fetched_at = dt.datetime.now(dt.timezone.utc)
    expires_at = fetched_at + dt.timedelta(days=DEFAULT_TTL_DAYS)
    payload = {
        "place_id": place_id,
        "fetched_at": fetched_at.isoformat(),
        "expires_at": expires_at.isoformat(),
        "match": match_meta,
        "google": {
            "name": details.get("name"),
            "formatted_address": details.get("formatted_address"),
            "phone": phone,
            "website": details.get("website"),
            "maps_url": details.get("url"),
            "business_status": details.get("business_status"),
            "types": details.get("types") or [],
            "rating": details.get("rating"),
            "review_count": details.get("user_ratings_total"),
            "photo_count": len(photos),
        },
        "sentiment": sentiment,
    }
    if not apply:
        return {
            "place_id": place_id,
            "google_name": details.get("name"),
            "google_address": details.get("formatted_address"),
            "rating": details.get("rating"),
            "review_count": details.get("user_ratings_total"),
            "reviews_sample": len(reviews),
            "photos": len(photos),
            "sentiment": sentiment,
        }

    with conn.cursor() as cur:
        cur.execute(
            """
            update notai.notaries
            set phone = coalesce(nullif(phone, ''), %s),
                website = coalesce(nullif(website, ''), %s),
                lat = coalesce(lat, %s),
                lng = coalesce(lng, %s),
                google_place_id = %s,
                google_maps_url = %s,
                google_business_status = %s,
                google_opening_hours = %s,
                google_photos = %s,
                google_checked_at = now()
            where id = %s::uuid
            """,
            (
                phone,
                details.get("website"),
                geometry.get("lat"),
                geometry.get("lng"),
                place_id,
                details.get("url"),
                details.get("business_status"),
                Json(hours),
                Json(photos),
                notary.id,
            ),
        )
        cur.execute(
            """
            update notai.notary_enrichments
            set status = 'completed', source_url = %s, payload = %s,
                error = null, updated_at = now()
            where id = (
                select id from notai.notary_enrichments
                where notary_id = %s::uuid and source = %s
                order by updated_at desc limit 1
            )
            """,
            (details.get("url"), Json(payload), notary.id, SOURCE),
        )
        if cur.rowcount == 0:
            cur.execute(
                """
                insert into notai.notary_enrichments
                    (notary_id, source, status, source_url, payload)
                values (%s::uuid, %s, 'completed', %s, %s)
                """,
                (notary.id, SOURCE, details.get("url"), Json(payload)),
            )

        if not skip_reviews:
            for review in reviews:
                published_at = (
                    dt.datetime.fromtimestamp(int(review["time"]), tz=dt.timezone.utc)
                    if review.get("time")
                    else None
                )
                cur.execute(
                    """
                    insert into notai.notary_reviews (
                        notary_id, source, source_review_id, author_name, rating,
                        text, language, published_at, payload
                    )
                    values (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
                    on conflict (
                        notary_id, source, coalesce(source_review_id, ''),
                        coalesce(author_name, ''), coalesce(published_at, 'epoch'::timestamptz)
                    )
                    do update set rating = excluded.rating, text = excluded.text,
                                  payload = excluded.payload, updated_at = now()
                    """,
                    (
                        notary.id,
                        SOURCE,
                        review["_id"],
                        review.get("author_name"),
                        review.get("rating"),
                        review.get("text"),
                        review.get("language") or "it",
                        published_at,
                        Json(
                            {
                                "author_url": review.get("author_url"),
                                "profile_photo_url": review.get("profile_photo_url"),
                                "relative_time_description": review.get("relative_time_description"),
                            }
                        ),
                    ),
                )

        cur.execute(
            """
            insert into notai.notary_review_summaries (
                notary_id, source, rating_avg, review_count, sentiment_label,
                sentiment_score, strengths, concerns, summary, payload, updated_at
            )
            values (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            on conflict (notary_id, source)
            do update set rating_avg = excluded.rating_avg,
                          review_count = excluded.review_count,
                          sentiment_label = excluded.sentiment_label,
                          sentiment_score = excluded.sentiment_score,
                          strengths = excluded.strengths,
                          concerns = excluded.concerns,
                          summary = excluded.summary,
                          payload = excluded.payload,
                          updated_at = now()
            """,
            (
                notary.id,
                SOURCE,
                details.get("rating"),
                int(details.get("user_ratings_total") or 0),
                sentiment["label"],
                sentiment["score"],
                Json(sentiment["strengths"]),
                Json(sentiment["concerns"]),
                sentiment["summary"],
                Json(
                    {
                        "axes": sentiment["axes"],
                        "sample_count": sentiment["sample_count"],
                        "sample_is_partial": sentiment["sample_is_partial"],
                        "method": sentiment["method"],
                        "google_maps_url": details.get("url"),
                        "expires_at": expires_at.isoformat(),
                    }
                ),
            ),
        )
    return {
        "place_id": place_id,
        "rating": details.get("rating"),
        "review_count": details.get("user_ratings_total"),
        "reviews_sample": len(reviews),
        "photos": len(photos),
        "sentiment": sentiment,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--notary-id")
    parser.add_argument("--slug")
    parser.add_argument("--place-id", default="")
    parser.add_argument("--include-checked", action="store_true")
    parser.add_argument("--max-age-days", type=int, default=DEFAULT_TTL_DAYS)
    parser.add_argument("--min-match-score", type=int, default=70)
    parser.add_argument("--max-cost-usd", type=float, default=5.0)
    parser.add_argument("--skip-reviews", action="store_true")
    parser.add_argument("--delay", type=float, default=0.25)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report-json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    database_url = os.getenv("DATABASE_URL", "").strip()
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    missing = [name for name, value in [("DATABASE_URL", database_url), ("GOOGLE_MAPS_API_KEY", api_key)] if not value]
    if missing:
        raise SystemExit(f"Variabili mancanti: {', '.join(missing)}")

    budget = CostGuard(args.max_cost_usd)
    client = GooglePlaces(api_key, budget)
    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    report: list[dict[str, Any]] = []
    try:
        notaries = fetch_notaries(conn, args)
        logger.info("Notai selezionati: %d · modalità: %s", len(notaries), "APPLY" if args.apply else "DRY-RUN")
        for index, notary in enumerate(notaries, 1):
            row: dict[str, Any] = {
                "notary_id": notary.id,
                "slug": notary.slug,
                "name": notary.name,
            }
            logger.info("[%d/%d] %s · %s", index, len(notaries), notary.name, notary.comune)
            try:
                candidate, match_meta = find_match(
                    conn,
                    client,
                    notary,
                    args.min_match_score,
                    args.place_id if len(notaries) == 1 else "",
                )
                row["match"] = match_meta
                if not candidate:
                    row["status"] = "no_match"
                    logger.warning("Nessun match affidabile: score=%s", match_meta.get("score"))
                    write_no_match(conn, notary, match_meta, args.apply)
                else:
                    details = client.details(str(candidate["place_id"]))
                    if not details:
                        row["status"] = "details_missing"
                    else:
                        final_score, final_reasons = match_candidate(notary, details)
                        if match_meta.get("method") not in {"manual", "refresh"} and final_score < args.min_match_score:
                            row["status"] = "rejected_after_details"
                            row["final_match"] = {"score": final_score, "reasons": final_reasons}
                            write_no_match(conn, notary, row["final_match"], args.apply)
                        else:
                            match_meta["final_score"] = final_score
                            match_meta["final_reasons"] = final_reasons
                            row["status"] = "completed"
                            row["result"] = write_details(
                                conn,
                                notary,
                                details,
                                match_meta,
                                args.apply,
                                args.skip_reviews,
                            )
                if args.apply:
                    conn.commit()
                else:
                    conn.rollback()
            except Exception as exc:
                conn.rollback()
                row["status"] = "error"
                row["error"] = str(exc)
                logger.exception("Errore su %s", notary.name)
                if "Budget API esaurito" in str(exc):
                    report.append(row)
                    break
            report.append(row)
            if args.delay > 0:
                time.sleep(args.delay)
    finally:
        conn.close()

    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "processed": len(report),
        "completed": sum(item.get("status") == "completed" for item in report),
        "no_match": sum(item.get("status") in {"no_match", "rejected_after_details"} for item in report),
        "errors": sum(item.get("status") == "error" for item in report),
        "cost": budget.as_dict(),
    }
    output = {"summary": summary, "rows": report}
    if args.report_json:
        Path(args.report_json).write_text(
            json.dumps(output, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if summary["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
