#!/usr/bin/env python3
"""Genera contenuti editoriali HTML + immagine per servizi notarili (stile veterinari.org).

Usa:
  - DeepSeek chat per HTML/SEO/FAQ/documenti
  - Runware per immagine hero 16:9

Esempi:
  python3 generate_service_content.py --slug dichiarazione-sostitutiva-atto-notorieta
  python3 generate_service_content.py --limit 5
  python3 generate_service_content.py --slug ... --skip-image
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

import psycopg2
import psycopg2.extras

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "public" / "images" / "services"
DEEPSEEK_ENDPOINT = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"
RUNWARE_ENDPOINT = "https://api.runware.ai/v1"


def load_env() -> None:
    candidates = [
        Path(__file__).resolve().parent / ".env",
        ROOT / ".env",
        Path("/Users/romolovelati/Desktop/HORIZON-VET/codebase/SPIDER/.env"),
    ]
    for path in candidates:
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :]
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def deepseek_chat(messages: list[dict[str, str]], temperature: float = 0.55) -> str:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY mancante")
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }
    req = Request(
        DEEPSEEK_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    content = data["choices"][0]["message"]["content"]
    return content


def runware_image(prompt: str, width: int = 1280, height: int = 704) -> str | None:
    api_key = os.environ.get("RUNWARE_API_KEY", "").strip() or "hNdCU6kyGmC3OfY2UAKpDjapbsDxnnoX"
    model = os.environ.get("RUNWARE_MODEL", "runware:101@1")
    task_uuid = str(uuid.uuid4())
    payload = [
        {"taskType": "authentication", "apiKey": api_key},
        {
            "taskType": "imageInference",
            "taskUUID": task_uuid,
            "positivePrompt": prompt,
            "model": model,
            "width": width,
            "height": height,
            "numberResults": 1,
            "outputType": "URL",
        },
    ]
    req = Request(
        RUNWARE_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    items = data.get("data") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return None
    for item in items:
        if not isinstance(item, dict):
            continue
        url = item.get("imageURL") or item.get("imageUrl")
        if url:
            return str(url)
    return None


def download_image(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = Request(url, headers={"User-Agent": "NotaioGiustoContentBot/1.0"})
    with urlopen(req, timeout=120) as resp:
        blob = resp.read()
        ctype = (resp.headers.get("Content-Type") or "").lower()
    ext = ".jpg"
    if "png" in ctype or url.lower().endswith(".png"):
        ext = ".png"
    elif "webp" in ctype or url.lower().endswith(".webp"):
        ext = ".webp"
    out = dest.with_suffix(ext)
    out.write_bytes(blob)
    return out


def build_prompt(service: dict[str, Any]) -> list[dict[str, str]]:
    name = service.get("plain_language_name") or service["name"]
    price_min = (service.get("price_min_cents") or 0) / 100
    price_avg = (service.get("price_avg_cents") or 0) / 100
    price_max = (service.get("price_max_cents") or 0) / 100
    price_line = (
        f"Range indicativo nazionale: {price_min:.0f}–{price_max:.0f} €"
        f" (media circa {price_avg:.0f} €)."
        if price_avg
        else "Prezzo su preventivo."
    )
    system = (
        "Sei un redattore senior SEO per NotaioGiusto.it, portale italiano indipendente su notai, "
        "costi e preventivi. Scrivi in italiano corretto, chiaro, utile e professionale. "
        "Tono umano e pratico come le guide di veterinari.org, ma senza fingere di essere un notaio. "
        "Non inventare norme inesistenti e non dare consulenza legale personalizzata: "
        "spiega la pratica come guida orientativa. Rispondi SOLO con JSON valido."
    )
    user = f"""
Crea una guida editoriale BELLA e UTILE per la pagina quanto-costa della pratica notarile.

Nome ufficiale: {service['name']}
Nome plain language: {name}
Categoria: {service.get('category') or 'Pratiche notarili'}
Slug: {service['slug']}
Complessità: {service.get('complexity') or 'media'}
{price_line}
Intent utente: {service.get('user_intent') or 'capire costo, documenti e come chiedere preventivo'}

OBIETTIVO LETTORE:
- capire cos'è in 30 secondi
- sapere quando serve davvero
- arrivare preparato dal notaio
- capire cosa fa variare il prezzo
- poter confrontare preventivi

Restituisci JSON con queste chiavi:
- seo_title (max 65 caratteri, attraente e chiaro)
- seo_description (max 155 caratteri, con beneficio concreto)
- description (2-3 frasi, abstract breve)
- html_content (HTML semantico di qualità alta:
  - un solo h1 con il nome plain language della pratica
  - subito dopo 2 paragrafi introduttivi ricchi e leggibili (no elenco)
  - poi queste sezioni H2 obbligatorie, in ordine:
    1) Cos'è e a cosa serve
    2) Quando serve davvero
    3) Come funziona dal notaio
    4) Documenti da preparare
    5) Quanto costa e cosa fa variare il prezzo
    6) Errori da evitare
    7) Come chiedere un preventivo utile
  - usa p, ul, li, strong; niente markdown; niente html/head/body/script
  - almeno 3500 caratteri di HTML
  - elenca documenti in lista puntata
  - nella sezione costi cita esplicitamente il range indicato sopra
  - chiudi con consigli pratici concreti, non generici)
- faqs (array di ESATTAMENTE 6 oggetti {{question, answer}}
  Requisiti FAQ:
  - domande reali di chi cerca online
  - risposte di 2-4 frasi, utili e specifiche (non banali)
  - copri: differenza con pratiche simili, documenti, tempi, presenza in studio, cosa include il prezzo, errori frequenti)
- required_documents (array di 5-7 stringhe brevi e concrete)
- image_prompt (prompt in inglese, fotorealistico 16:9, elegant Italian notary office / documents /
  legal atmosphere, soft daylight, no text overlays, no logos, no watermarks)
"""
    return [{"role": "system", "content": system}, {"role": "user", "content": user.strip()}]


def parse_json_content(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Risposta DeepSeek non è un oggetto JSON")
    html = str(data.get("html_content") or "").strip()
    if len(html) < 2500:
        raise ValueError(f"html_content troppo corto ({len(html)})")
    faqs = data.get("faqs") or []
    if not isinstance(faqs, list) or len(faqs) < 5:
        raise ValueError(f"faqs insufficienti ({len(faqs) if isinstance(faqs, list) else 0})")
    cleaned_faqs = []
    for item in faqs[:6]:
        if not isinstance(item, dict):
            continue
        q = str(item.get("question") or "").strip()
        a = str(item.get("answer") or "").strip()
        if len(q) < 12 or len(a) < 80:
            continue
        cleaned_faqs.append({"question": q, "answer": a})
    if len(cleaned_faqs) < 5:
        raise ValueError("FAQ troppo corte o incomplete")
    data["faqs"] = cleaned_faqs
    data["html_content"] = html
    return data

def fetch_services(conn, slug: str | None, limit: int, only_missing: bool) -> list[dict[str, Any]]:
    where = ["true"]
    params: list[Any] = []
    if slug:
        where.append("st.slug = %s")
        params.append(slug)
    if only_missing:
        where.append("(st.html_content is null or length(trim(st.html_content)) < 200)")
    params.append(limit)
    sql = f"""
      select st.id, st.slug, st.name, st.category, st.plain_language_name, st.user_intent,
             st.complexity, st.seo_title, st.seo_description,
             spb.price_min_cents, spb.price_avg_cents, spb.price_max_cents
      from notai.services_taxonomy st
      left join lateral (
        select price_min_cents, price_avg_cents, price_max_cents
        from notai.service_price_benchmarks b
        where b.service_id = st.id and b.location_scope = 'national'
        order by b.confidence desc nulls last, b.updated_at desc
        limit 1
      ) spb on true
      where {' and '.join(where)}
      order by st.priority asc nulls last, st.name asc
      limit %s
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return list(cur.fetchall())


def save_service(conn, service_id: str, payload: dict[str, Any], image_url: str | None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update notai.services_taxonomy
            set seo_title = coalesce(%s, seo_title),
                seo_description = coalesce(%s, seo_description),
                description = coalesce(%s, description),
                html_content = %s,
                faqs = coalesce(%s::jsonb, faqs),
                required_documents = coalesce(%s::jsonb, required_documents),
                image_url = coalesce(%s, image_url),
                content_status = 'generated',
                content_generated_at = now(),
                content_updated_by = 'deepseek+runware',
                updated_at = now()
            where id = %s
            """,
            [
                payload.get("seo_title"),
                payload.get("seo_description"),
                payload.get("description"),
                payload.get("html_content"),
                json.dumps(payload.get("faqs") or [], ensure_ascii=False),
                json.dumps(payload.get("required_documents") or [], ensure_ascii=False),
                image_url,
                service_id,
            ],
        )
    conn.commit()


def process_one(conn, service: dict[str, Any], skip_image: bool) -> None:
    print(f"→ {service['slug']}")
    raw = deepseek_chat(build_prompt(service))
    payload = parse_json_content(raw)
    print(f"  html chars={len(payload['html_content'])}")

    image_public: str | None = None
    if not skip_image:
        prompt = str(payload.get("image_prompt") or "").strip()
        if not prompt:
            name = service.get("plain_language_name") or service["name"]
            prompt = (
                f"Elegant Italian notary office desk with documents and fountain pen, "
                f"soft natural light, photorealistic, no text, theme: {name}"
            )
        print("  generating image…")
        remote = runware_image(prompt)
        if remote:
            dest = download_image(remote, PUBLIC_DIR / service["slug"])
            image_public = f"/images/services/{dest.name}"
            print(f"  image={image_public}")
        else:
            print("  image skipped (runware empty)")

    save_service(conn, str(service["id"]), payload, image_public)
    print("  saved")


def main() -> int:
    load_env()
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug")
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--only-missing", action="store_true")
    parser.add_argument("--skip-image", action="store_true")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL mancante")

    # Ensure columns exist (best effort; owner may need to apply schema_service_content.sql)
    conn = psycopg2.connect(db_url)
    try:
        try:
            with conn.cursor() as cur:
                cur.execute(Path(__file__).with_name("schema_service_content.sql").read_text(encoding="utf-8"))
            conn.commit()
        except Exception as exc:
            conn.rollback()
            print(f"schema skip/warn: {exc}")

        services = fetch_services(conn, args.slug, args.limit, args.only_missing)
        if not services:
            print("Nessun servizio da processare")
            return 1
        for service in services:
            try:
                process_one(conn, service, args.skip_image)
            except Exception as exc:
                print(f"  ERROR {service['slug']}: {exc}", file=sys.stderr)
                conn.rollback()
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
