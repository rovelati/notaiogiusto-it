#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules/playwright ]; then
  npm install
fi

if [ ! -d "$HOME/.cache/ms-playwright" ]; then
  npx playwright install chromium
fi

node paginegialle_cookie_refresh.mjs
LIMIT="${LIMIT:-50}" CANDIDATE_LIMIT="${CANDIDATE_LIMIT:-3}" MIN_DELAY="${MIN_DELAY:-60}" MAX_DELAY="${MAX_DELAY:-120}" ./run_paginegialle_background.sh
