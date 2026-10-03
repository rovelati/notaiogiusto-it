#!/usr/bin/env python3
"""Esegue il piccolo batch Google Places quotidiano e invia il report via Brevo."""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import smtplib
import subprocess
import sys
from email.message import EmailMessage
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent.parent
STATE_DIR = SCRIPT_DIR / "state"
PUBLIC_BASE_URL = "https://www.notaiogiusto.it/notai"


def load_env_file(path: Path) -> None:
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


def load_environment() -> None:
    for path in (
        PROJECT_DIR / ".env",
        PROJECT_DIR / "google-places.env",
        PROJECT_DIR / "smtp-brevo.env",
        SCRIPT_DIR / ".env",
    ):
        load_env_file(path)


def run_enrichment(limit: int, max_cost_usd: float, report_path: Path) -> tuple[int, dict[str, Any], str]:
    command = [
        sys.executable,
        str(SCRIPT_DIR / "enrich_google_places_notai.py"),
        "--limit",
        str(limit),
        "--max-cost-usd",
        str(max_cost_usd),
        "--apply",
        "--report-json",
        str(report_path),
    ]
    completed = subprocess.run(
        command,
        cwd=PROJECT_DIR,
        env=os.environ.copy(),
        text=True,
        capture_output=True,
        check=False,
        timeout=900,
    )
    output = "\n".join(part.strip() for part in (completed.stdout, completed.stderr) if part.strip())
    if report_path.exists():
        report = json.loads(report_path.read_text(encoding="utf-8"))
    else:
        report = {
            "summary": {
                "mode": "apply",
                "processed": 0,
                "completed": 0,
                "no_match": 0,
                "errors": 1,
                "cost": {},
            },
            "rows": [{"status": "error", "error": output or f"Processo terminato con codice {completed.returncode}"}],
        }
    return completed.returncode, report, output


def status_label(status: str) -> str:
    return {
        "completed": "Arricchito",
        "no_match": "Nessun match affidabile",
        "rejected_after_details": "Match rifiutato dopo verifica",
        "details_missing": "Dettagli Google non disponibili",
        "error": "Errore",
    }.get(status, status or "Sconosciuto")


def build_email(report: dict[str, Any], run_output: str = "", test: bool = False) -> tuple[str, str, str]:
    now = dt.datetime.now().astimezone()
    summary = report.get("summary") or {}
    rows = report.get("rows") or []
    completed = int(summary.get("completed") or 0)
    errors = int(summary.get("errors") or 0)
    prefix = "[TEST] " if test else ""
    subject = (
        f"{prefix}NotaioGiusto · {completed} notai arricchiti"
        + (f" · {errors} errori" if errors else "")
    )

    text_lines = [
        f"Report arricchimento NotaioGiusto.it · {now:%d/%m/%Y %H:%M %Z}",
        "",
        f"Processati: {summary.get('processed', 0)}",
        f"Arricchiti: {completed}",
        f"Senza match: {summary.get('no_match', 0)}",
        f"Errori: {errors}",
        f"Costo API stimato: ${float((summary.get('cost') or {}).get('estimated_usd') or 0):.3f}",
        "",
    ]
    html_parts = [
        '<html><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5">',
        '<h1 style="font-size:22px;margin:0 0 6px">Report arricchimento NotaioGiusto.it</h1>',
        f'<p style="margin:0 0 18px;color:#667085">{html.escape(now.strftime("%d/%m/%Y %H:%M %Z"))}</p>',
        (
            "<p>"
            f"<strong>Processati:</strong> {summary.get('processed', 0)} · "
            f"<strong>Arricchiti:</strong> {completed} · "
            f"<strong>Senza match:</strong> {summary.get('no_match', 0)} · "
            f"<strong>Errori:</strong> {errors}<br>"
            f"<strong>Costo API stimato:</strong> ${float((summary.get('cost') or {}).get('estimated_usd') or 0):.3f}"
            "</p>"
        ),
    ]

    if not rows:
        text_lines.append("Nessun notaio da processare.")
        html_parts.append("<p>Nessun notaio da processare.</p>")
    else:
        html_parts.append('<ol style="padding-left:22px">')
        for row in rows:
            name = str(row.get("name") or "Notaio non identificato")
            slug = str(row.get("slug") or "")
            status = str(row.get("status") or "")
            match = row.get("match") or row.get("final_match") or {}
            result = row.get("result") or {}
            public_url = f"{PUBLIC_BASE_URL}/{slug}" if slug else ""
            score = match.get("final_score", match.get("score"))
            candidate = match.get("candidate_name")
            rating = result.get("rating")
            review_count = result.get("review_count")
            photos = result.get("photos")
            error = row.get("error")

            text_lines.extend(
                [
                    f"- {name}: {status_label(status)}",
                    f"  Scheda: {public_url or '-'}",
                    f"  Match: {candidate or '-'}; punteggio: {score if score is not None else '-'}",
                    f"  Google: rating {rating if rating is not None else '-'}; recensioni {review_count if review_count is not None else '-'}; foto {photos if photos is not None else '-'}",
                    *( [f"  Errore: {error}"] if error else [] ),
                    "",
                ]
            )
            html_parts.append('<li style="margin:0 0 18px">')
            html_parts.append(
                f'<h2 style="font-size:18px;margin:0 0 5px">{html.escape(name)} '
                f'<span style="font-size:14px;color:#667085">· {html.escape(status_label(status))}</span></h2>'
            )
            if public_url:
                html_parts.append(
                    f'<p style="margin:0 0 7px"><a href="{html.escape(public_url)}">{html.escape(public_url)}</a></p>'
                )
            html_parts.append('<ul style="padding-left:18px;margin:0">')
            html_parts.append(
                f"<li><strong>Match:</strong> {html.escape(str(candidate or '-'))}; "
                f"<strong>punteggio:</strong> {html.escape(str(score if score is not None else '-'))}</li>"
            )
            html_parts.append(
                f"<li><strong>Rating:</strong> {html.escape(str(rating if rating is not None else '-'))}; "
                f"<strong>recensioni:</strong> {html.escape(str(review_count if review_count is not None else '-'))}; "
                f"<strong>foto:</strong> {html.escape(str(photos if photos is not None else '-'))}</li>"
            )
            if error:
                html_parts.append(f'<li style="color:#b42318"><strong>Errore:</strong> {html.escape(str(error))}</li>')
            html_parts.append("</ul></li>")
        html_parts.append("</ol>")

    if run_output and errors:
        text_lines.extend(["Dettaglio esecuzione:", run_output[-2000:]])
        html_parts.append(
            f"<details><summary>Dettaglio esecuzione</summary><pre>{html.escape(run_output[-2000:])}</pre></details>"
        )
    html_parts.append("</body></html>")
    return subject, "\n".join(text_lines), "\n".join(html_parts)


def send_email(to_email: str, subject: str, text: str, html_body: str) -> None:
    host = os.getenv("SMTP_HOST", "smtp-relay.brevo.com").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    user = (os.getenv("SMTP_USER") or os.getenv("BREVO_SMTP_LOGIN") or "").strip()
    password = (os.getenv("SMTP_PASS") or os.getenv("BREVO_SMTP_KEY") or "").strip()
    from_value = os.getenv("MAIL_FROM", "NotaioGiusto <preventivi@notaiogiusto.it>").strip()
    secure = os.getenv("SMTP_SECURE", "").strip().lower() == "true"
    if not user or not password:
        raise RuntimeError("Credenziali SMTP Brevo mancanti")

    message = EmailMessage()
    message["From"] = from_value
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text)
    message.add_alternative(html_body, subtype="html")

    smtp_class = smtplib.SMTP_SSL if secure else smtplib.SMTP
    with smtp_class(host, port, timeout=30) as smtp:
        if not secure:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
        smtp.login(user, password)
        smtp.send_message(message)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--max-cost-usd", type=float, default=0.65)
    parser.add_argument("--email-to", default="romolo.velati@gmail.com")
    parser.add_argument("--test-email", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_environment()
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    if args.test_email:
        report = {
            "summary": {
                "processed": 0,
                "completed": 0,
                "no_match": 0,
                "errors": 0,
                "cost": {"estimated_usd": 0},
            },
            "rows": [],
        }
        subject, text, html_body = build_email(report, test=True)
        send_email(args.email_to, subject, text, html_body)
        print(f"Email di test inviata a {args.email_to}")
        return 0

    stamp = dt.datetime.now().astimezone().strftime("%Y%m%d")
    report_path = STATE_DIR / f"google-places-daily-{stamp}.json"
    return_code, report, output = run_enrichment(args.limit, args.max_cost_usd, report_path)
    subject, text, html_body = build_email(report, output)
    send_email(args.email_to, subject, text, html_body)
    print(json.dumps(report.get("summary") or {}, ensure_ascii=False))
    print(f"Report: {report_path}")
    print(f"Email inviata a {args.email_to}")
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
