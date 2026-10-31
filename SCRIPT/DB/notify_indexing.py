#!/usr/bin/env python3
"""Notifica a IndexNow le schede aggiornate da un report di arricchimento."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SITE_ORIGIN = "https://www.notaiogiusto.it"
NOTARY_BASE_URL = f"{SITE_ORIGIN}/notai"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
GOOGLE_SITEMAP_URL = f"{SITE_ORIGIN}/sitemap-notai.xml"
MAX_URLS = 10_000


def completed_urls(report: dict[str, Any]) -> list[str]:
    urls = {
        f"{NOTARY_BASE_URL}/{str(row.get('slug')).strip().lower()}"
        for row in report.get("rows") or []
        if row.get("status") == "completed" and str(row.get("slug") or "").strip()
    }
    return sorted(urls)[:MAX_URLS]


def submit_indexnow(urls: list[str], key: str, timeout: int = 30) -> dict[str, Any]:
    result: dict[str, Any] = {
        "provider": "IndexNow",
        "submitted": len(urls),
        "status": "skipped",
        "http_status": None,
        "error": None,
    }
    if not urls:
        result["reason"] = "Nessuna scheda arricchita"
        return result
    if not key:
        result["reason"] = "INDEXNOW_KEY non configurata"
        return result

    payload = json.dumps(
        {
            "host": "www.notaiogiusto.it",
            "key": key,
            "keyLocation": f"{SITE_ORIGIN}/{key}.txt",
            "urlList": urls,
        }
    ).encode("utf-8")
    request = Request(
        INDEXNOW_ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            result["http_status"] = response.status
            result["status"] = "submitted" if response.status in {200, 202} else "error"
    except HTTPError as exc:
        result["http_status"] = exc.code
        result["status"] = "error"
        result["error"] = exc.read().decode("utf-8", errors="replace")[:500] or str(exc)
    except (URLError, TimeoutError, OSError) as exc:
        result["status"] = "error"
        result["error"] = str(exc)
    return result


def notify_from_report(report: dict[str, Any], key: str | None = None) -> dict[str, Any]:
    urls = completed_urls(report)
    indexnow = submit_indexnow(urls, (key or os.getenv("INDEXNOW_KEY") or "").strip())
    return {
        "urls": urls,
        "indexnow": indexnow,
        "google": {
            "status": "sitemap_lastmod",
            "submitted": len(urls),
            "sitemap": GOOGLE_SITEMAP_URL,
            "note": "Le modifiche aggiornano lastmod; Google scopre le URL dalla sitemap.",
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-json", type=Path, required=True)
    parser.add_argument("--key", default=None, help="Override di INDEXNOW_KEY")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = json.loads(args.report_json.read_text(encoding="utf-8"))
    if args.dry_run:
        urls = completed_urls(report)
        result = {
            "urls": urls,
            "indexnow": {"status": "dry_run", "submitted": len(urls)},
            "google": {
                "status": "sitemap_lastmod",
                "submitted": len(urls),
                "sitemap": GOOGLE_SITEMAP_URL,
            },
        }
    else:
        result = notify_from_report(report, args.key)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result["indexnow"]["status"] == "error" else 0


if __name__ == "__main__":
    sys.exit(main())
