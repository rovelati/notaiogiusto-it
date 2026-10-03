#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

LIMIT="${LIMIT:-80}"
COMUNE="${COMUNE:-Milano}"
CANDIDATE_LIMIT="${CANDIDATE_LIMIT:-25}"
THRESHOLD="${THRESHOLD:-70}"
MIN_DELAY="${MIN_DELAY:-4}"
MAX_DELAY="${MAX_DELAY:-9}"
STATE_FILE="${STATE_FILE:-state/virgilio_batch_${COMUNE// /_}.json}"
LOG_DIR="logs"
STATE_DIR="state"
mkdir -p "$LOG_DIR" "$STATE_DIR"

python3 - <<PY
from enrich_virgilio_notai import discover_from_search

comune = "${COMUNE}"
urls = discover_from_search(comune, 5)
if not urls:
    raise SystemExit(f"PRECHECK_FAILED: nessuna scheda Virgilio trovata per {comune}")
print(f"PRECHECK_OK: {len(urls)} schede candidate per {comune}")
PY

LOG="$LOG_DIR/virgilio_batch_$(date +%Y%m%d_%H%M%S).log"
CMD=(
  python3 run_virgilio_notai_batch.py
  --limit "$LIMIT"
  --candidate-limit "$CANDIDATE_LIMIT"
  --threshold "$THRESHOLD"
  --apply
  --min-delay "$MIN_DELAY"
  --max-delay "$MAX_DELAY"
  --state-file "$STATE_FILE"
)
if [[ -n "$COMUNE" ]]; then
  CMD+=(--comune "$COMUNE")
fi

nohup "${CMD[@]}" > "$LOG" 2>&1 &

PID="$!"
echo "$PID" > "$STATE_DIR/virgilio_batch.pid"
echo "$LOG" > "$STATE_DIR/virgilio_batch.logpath"
echo "PID=$PID"
echo "LOG=$LOG"
echo "COMUNE=$COMUNE"
echo "STATE_FILE=$STATE_FILE"
