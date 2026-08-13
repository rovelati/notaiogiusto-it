#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import time
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
LOG_DIR = SCRIPT_DIR / "logs"
STATE_DIR = SCRIPT_DIR / "state"
STATUS_FILE = STATE_DIR / "all_enrichments_status.json"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def write_status(status: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATUS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(status, ensure_ascii=False, indent=2, default=str))
    tmp.replace(STATUS_FILE)


def append_log(path: Path, payload: dict) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with path.open("a") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")


def run_step(name: str, command: list[str], log_path: Path, status: dict) -> int:
    started_at = now_iso()
    step = {
        "name": name,
        "command": " ".join(shlex.quote(part) for part in command),
        "started_at": started_at,
        "status": "running",
    }
    status["steps"].append(step)
    status["updated_at"] = started_at
    write_status(status)
    append_log(log_path, {"event": "step_start", **step})

    env = os.environ.copy()
    process = subprocess.Popen(
        command,
        cwd=SCRIPT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
    )
    assert process.stdout is not None
    for line in process.stdout:
        line = line.rstrip()
        if line:
            append_log(log_path, {"event": "step_output", "step": name, "line": line})
    return_code = process.wait()
    finished_at = now_iso()
    step["finished_at"] = finished_at
    step["return_code"] = return_code
    step["status"] = "completed" if return_code == 0 else "failed"
    status["updated_at"] = finished_at
    write_status(status)
    append_log(log_path, {"event": "step_done", **step})
    return return_code


def main() -> int:
    parser = argparse.ArgumentParser(description="Orchestratore arricchimenti NOTAI.")
    parser.add_argument("--notaioa-limit", type=int, default=6500)
    parser.add_argument("--virgilio-limit", type=int, default=500)
    parser.add_argument("--virgilio-candidate-limit", type=int, default=8)
    parser.add_argument("--virgilio-min-delay", type=float, default=6.0)
    parser.add_argument("--virgilio-max-delay", type=float, default=14.0)
    parser.add_argument("--include-paginegialle", action="store_true")
    parser.add_argument("--paginegialle-limit", type=int, default=50)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    load_dotenv(SCRIPT_DIR / ".env")
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL non configurato in ambiente o .env")

    run_id = time.strftime("%Y%m%d_%H%M%S")
    log_path = LOG_DIR / f"all_enrichments_{run_id}.jsonl"
    status = {
        "run_id": run_id,
        "started_at": now_iso(),
        "updated_at": now_iso(),
        "status": "running",
        "apply": args.apply,
        "log": str(log_path),
        "steps": [],
    }
    write_status(status)

    steps: list[tuple[str, list[str]]] = [
        (
            "schema_marketplace",
            ["psql", database_url, "-f", str(SCRIPT_DIR / "schema_marketplace.sql")],
        ),
        (
            "notaioa_services",
            ["python3", "enrich_notaioa_notai.py", "--import-services", *(["--apply"] if args.apply else [])],
        ),
        (
            "notaioa_sitemap",
            [
                "python3",
                "run_notaioa_notai_batch.py",
                "--limit",
                str(args.notaioa_limit),
                "--threshold",
                "80",
                "--min-delay",
                "1.2",
                "--max-delay",
                "2.8",
                *(["--apply"] if args.apply else []),
            ],
        ),
        (
            "virgilio_batch",
            [
                "python3",
                "run_virgilio_notai_batch.py",
                "--limit",
                str(args.virgilio_limit),
                "--candidate-limit",
                str(args.virgilio_candidate_limit),
                "--threshold",
                "70",
                "--min-delay",
                str(args.virgilio_min_delay),
                "--max-delay",
                str(args.virgilio_max_delay),
                *(["--apply"] if args.apply else []),
            ],
        ),
    ]

    if args.include_paginegialle:
        steps.append(
            (
                "paginegialle_batch",
                [
                    "python3",
                    "run_paginegialle_notai_batch.py",
                    "--limit",
                    str(args.paginegialle_limit),
                    "--candidate-limit",
                    "3",
                    "--threshold",
                    "70",
                    "--min-delay",
                    "60",
                    "--max-delay",
                    "120",
                    *(["--apply"] if args.apply else []),
                ],
            )
        )

    for name, command in steps:
        return_code = run_step(name, command, log_path, status)
        if return_code != 0:
            status["status"] = "failed"
            status["finished_at"] = now_iso()
            write_status(status)
            return return_code

    status["status"] = "completed"
    status["finished_at"] = now_iso()
    status["updated_at"] = status["finished_at"]
    write_status(status)
    append_log(log_path, {"event": "all_done", "status": status})
    print(json.dumps(status, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
