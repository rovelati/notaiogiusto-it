#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"

PASS_FILE="/Users/romolovelati/Desktop/PRONTOFARMACIE/.new-server-passwd"
REMOTE="root@37.60.255.18"
REMOTE_DIR="/var/www/notaiogiusto-it/SCRIPT/DB"
LOCAL_DIR="/Users/romolovelati/Desktop/NOTAI/SCRIPT/DB"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=30"

python3 - <<'PY' > /tmp/notai-server.env
from urllib.parse import urlparse, urlunparse
import re
raw = open("/Users/romolovelati/Desktop/NOTAI/.env").read()
m = re.search(r"^DATABASE_URL=(.*)$", raw, re.M)
url = m.group(1).strip().strip('"').strip("'")
p = urlparse(url)
netloc = f"{p.username}:{p.password}@127.0.0.1:5432"
print(f"DATABASE_URL={urlunparse((p.scheme, netloc, p.path, '', '', ''))}")
PY

chmod +x "$LOCAL_DIR/run_nominatim_full_background.sh"

sshpass -f "$PASS_FILE" ssh $SSH_OPTS "$REMOTE" "mkdir -p $REMOTE_DIR/logs $REMOTE_DIR/state /var/www/notaiogiusto-it"

sshpass -f "$PASS_FILE" rsync -avz -e "ssh $SSH_OPTS" \
  "$LOCAL_DIR/geocode_nominatim_notai.py" \
  "$LOCAL_DIR/run_nominatim_full_background.sh" \
  "$LOCAL_DIR/README_NOMINATIM_NOTAI.md" \
  "$REMOTE:$REMOTE_DIR/"

if [[ -f "$LOCAL_DIR/state/nominatim_geocode_cache.json" ]]; then
  sshpass -f "$PASS_FILE" rsync -avz -e "ssh $SSH_OPTS" \
    "$LOCAL_DIR/state/nominatim_geocode_cache.json" \
    "$REMOTE:$REMOTE_DIR/state/"
fi

sshpass -f "$PASS_FILE" scp $SSH_OPTS /tmp/notai-server.env "$REMOTE:$REMOTE_DIR/.env"
rm -f /tmp/notai-server.env

sshpass -f "$PASS_FILE" ssh $SSH_OPTS "$REMOTE" bash -s <<'REMOTE'
set -euo pipefail
python3 -m pip install --quiet psycopg2-binary requests >/dev/null 2>&1 || pip3 install --quiet psycopg2-binary requests >/dev/null 2>&1
python3 -c 'import psycopg2,requests; print("deps_ok")'
cd /var/www/notaiogiusto-it/SCRIPT/DB
chmod +x run_nominatim_full_background.sh
./run_nominatim_full_background.sh
sleep 3
PID=$(cat state/nominatim_full.pid)
LOG=$(cat state/nominatim_full.logpath)
echo "REMOTE_PID=$PID"
echo "REMOTE_LOG=$LOG"
ps -p "$PID" -o pid,etime,cmd || ps -p "$PID" -o pid,etime,command || true
head -n 8 "$LOG" || true
REMOTE
