#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

LIMIT="${LIMIT:-50}"
CANDIDATE_LIMIT="${CANDIDATE_LIMIT:-10}"
THRESHOLD="${THRESHOLD:-70}"
MIN_DELAY="${MIN_DELAY:-6}"
MAX_DELAY="${MAX_DELAY:-14}"
LOG_DIR="logs"
STATE_DIR="state"
mkdir -p "$LOG_DIR" "$STATE_DIR"

python3 - <<'PY'
from enrich_virgilio_notai import discover_from_search

urls = discover_from_search("Milano", 5)
if not urls:
    raise SystemExit("PRECHECK_FAILED: nessuna scheda Virgilio trovata per Milano")
print(f"PRECHECK_OK: {len(urls)} schede candidate")
PY

LOG="$LOG_DIR/virgilio_batch_$(date +%Y%m%d_%H%M%S).log"
nohup python3 run_virgilio_notai_batch.py \
  --limit "$LIMIT" \
  --candidate-limit "$CANDIDATE_LIMIT" \
  --threshold "$THRESHOLD" \
  --apply \
  --min-delay "$MIN_DELAY" \
  --max-delay "$MAX_DELAY" \
  > "$LOG" 2>&1 &

PID="$!"
echo "$PID" > "$STATE_DIR/virgilio_batch.pid"
echo "PID=$PID"
echo "LOG=$LOG"
