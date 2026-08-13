#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

LIMIT="${LIMIT:-50}"
CANDIDATE_LIMIT="${CANDIDATE_LIMIT:-4}"
THRESHOLD="${THRESHOLD:-70}"
MIN_DELAY="${MIN_DELAY:-60}"
MAX_DELAY="${MAX_DELAY:-120}"
SEARCH_MODE="${SEARCH_MODE:-name}"
LOG_DIR="logs"
STATE_DIR="state"
mkdir -p "$LOG_DIR" "$STATE_DIR"

PREFLIGHT_URL="https://www.paginegialle.it/ricerca/notai/Milano"

python3 - <<'PY'
from enrich_paginegialle_notai import fetch_pg_html

url = "https://www.paginegialle.it/ricerca/notai/Milano"
html = fetch_pg_html(url)
low = html[:5000].lower()
if "awswaf" in low or "challenge-container" in low or "verify that you're not a robot" in low or len(html) < 10000:
    raise SystemExit("PRECHECK_FAILED: PagineGialle sta restituendo AWS WAF/challenge anche via browser fallback.")
print(f"PRECHECK_OK: {len(html)} byte")
PY

LOG="$LOG_DIR/paginegialle_batch_$(date +%Y%m%d_%H%M%S).log"
nohup python3 run_paginegialle_notai_batch.py \
  --limit "$LIMIT" \
  --candidate-limit "$CANDIDATE_LIMIT" \
  --threshold "$THRESHOLD" \
  --apply \
  --search-mode "$SEARCH_MODE" \
  --min-delay "$MIN_DELAY" \
  --max-delay "$MAX_DELAY" \
  > "$LOG" 2>&1 &

PID="$!"
echo "$PID" > "$STATE_DIR/paginegialle_batch.pid"
echo "PID=$PID"
echo "LOG=$LOG"
