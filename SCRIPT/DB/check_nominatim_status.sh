#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"
PASS_FILE="/Users/romolovelati/Desktop/PRONTOFARMACIE/.new-server-passwd"

if ! lsof -nP -iTCP:15432 -sTCP:LISTEN >/dev/null 2>&1; then
  sshpass -f "$PASS_FILE" ssh -f -N -o ExitOnForwardFailure=yes -o ConnectTimeout=15 -L 15432:127.0.0.1:5432 root@37.60.255.18
  sleep 1
fi

sshpass -f "$PASS_FILE" ssh -o ConnectTimeout=20 root@37.60.255.18 bash -s <<'REMOTE'
set -euo pipefail
cd /var/www/notaiogiusto-it/SCRIPT/DB
PID="$(cat state/nominatim_full.pid 2>/dev/null || true)"
LOG="$(cat state/nominatim_full.logpath 2>/dev/null || true)"
if [[ -z "$LOG" ]]; then
  LOG="$(ls -t logs/nominatim_full_*.log 2>/dev/null | head -n1 || true)"
fi
echo "LOG=$LOG"
if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
  echo "STATUS=running"
  echo "PID=$PID"
  ps -p "$PID" -o etime=
else
  echo "STATUS=stopped"
  echo "PID=$PID"
fi
python3 - <<'PY'
import json
from pathlib import Path
logp = Path("state/nominatim_full.logpath")
if logp.exists():
    p = Path(logp.read_text().strip())
else:
    files = sorted(Path("logs").glob("nominatim_full_*.log"))
    p = files[-1]
text = p.read_text(errors="ignore")
starts = dones = ok = empty = errors = 0
batch = None
for line in text.splitlines():
    s = line.strip()
    if not s.startswith("{"):
        continue
    try:
        o = json.loads(s)
    except Exception:
        continue
    ev = o.get("event")
    if ev == "notary_start":
        starts += 1
    elif ev == "notary_done":
        dones += 1
        if o.get("ok"):
            ok += 1
        else:
            empty += 1
    elif ev == "notary_error":
        errors += 1
    elif ev == "batch_done":
        batch = o.get("stats")
print({"starts": starts, "dones": dones, "ok": ok, "empty": empty, "errors": errors, "batch_done": batch})
print("---TAIL---")
print("\n".join(text.splitlines()[-8:]))
PY
REMOTE

cd /Users/romolovelati/Desktop/NOTAI
node --input-type=module <<'EOF'
import fs from 'node:fs';
import pg from 'pg';
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1)];
  }),
);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 8000 });
const r = await pool.query(
  `select count(*)::int as total,
          count(*) filter (where lat is not null and lng is not null)::int as with_coords,
          count(*) filter (where raw_import ? $1)::int as nominatim
   from notai.notaries`,
  ['nominatim'],
);
const left = await pool.query(
  `select count(*)::int as remaining
   from notai.notaries n
   where (lat is null or lng is null)
     and coalesce(nullif(trim(address), ''), null) is not null
     and coalesce(nullif(trim(comune), ''), null) is not null
     and not exists (
       select 1 from notai.notary_enrichments e
       where e.notary_id = n.id and e.source = 'nominatim' and e.status in ('completed', 'empty')
     )`,
);
console.log(JSON.stringify({ coords: r.rows[0], remaining_to_geocode: left.rows[0].remaining }, null, 2));
await pool.end();
EOF
