#!/usr/bin/env bash
# Avvia geocoding Nominatim di tutti i notai senza coordinate (background sul server).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs state

if [[ ! -f .env && -f ../../.env ]]; then
  # shellcheck disable=SC1091
  set -a
  source ../../.env
  set +a
elif [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL mancante"
  exit 1
fi

# stop previous if still running
if [[ -f state/nominatim_full.pid ]]; then
  old="$(cat state/nominatim_full.pid || true)"
  if [[ -n "${old}" ]] && kill -0 "${old}" 2>/dev/null; then
    echo "already_running pid=${old}"
    exit 0
  fi
fi

LOG="logs/nominatim_full_$(date +%Y%m%d_%H%M%S).log"
nohup python3 -u geocode_nominatim_notai.py --limit 0 --apply --delay 1.2 >"$LOG" 2>&1 &
PID=$!
echo "$PID" > state/nominatim_full.pid
echo "$LOG" > state/nominatim_full.logpath
echo "PID=$PID"
echo "LOG=$LOG"
