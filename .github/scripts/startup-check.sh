#!/usr/bin/env bash
# Starts the production images with Postgres and Redis and checks they serve
# requests: migrations apply, the backend health endpoint answers 200, each
# probed API path answers one of its expected statuses (never a 5xx), and the
# frontend serves its index page and a client-side route.
#
# Usage: BACKEND_IMAGE=... FRONTEND_IMAGE=... startup-check.sh PATH=CODES ...
#   e.g. startup-check.sh /api/v1/users/whoami=200 /api/v1/cases/list=401,403
set -uo pipefail

compose=(docker compose -f "$(dirname "$0")/../startup-check/compose.yml")
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
failed=0

status() {
  # Status code without following redirects; 000 when nothing answers.
  curl -s -o /dev/null -w '%{http_code}' -H 'Host: localhost' --max-time 10 "$1" || true
}

wait_for_200() {
  local url=$1 code=000
  for _ in $(seq 1 60); do
    code=$(status "$url")
    [ "$code" = "200" ] && break
    sleep 2
  done
  echo "$code"
}

record() {
  echo "$1"
  echo "- \`$1\`" >> "$summary"
  case "$1" in FAIL*) failed=1 ;; esac
}

cleanup() {
  if [ "$failed" -ne 0 ]; then
    "${compose[@]}" logs --no-color --tail 200
  fi
  "${compose[@]}" down -v --remove-orphans > /dev/null 2>&1
}
trap cleanup EXIT

echo "## Startup check" >> "$summary"
echo "Backend: \`${BACKEND_IMAGE}\`, frontend: \`${FRONTEND_IMAGE}\`" >> "$summary"

"${compose[@]}" up -d --wait db redis || { record "FAIL database and cache did not start"; exit 1; }

if "${compose[@]}" run --rm --no-deps backend python manage.py migrate --noinput; then
  record "ok   migrations applied"
else
  record "FAIL migrations failed"
  exit 1
fi

"${compose[@]}" up -d backend frontend || { record "FAIL app containers did not start"; exit 1; }

code=$(wait_for_200 "http://127.0.0.1:8000/health/")
if [ "$code" = "200" ]; then
  record "ok   backend /health/ 200"
else
  record "FAIL backend /health/ returned $code"
fi

for probe in "$@"; do
  path=${probe%%=*}
  expected=${probe#*=}
  code=$(status "http://127.0.0.1:8000${path}")
  if [[ ",${expected}," == *",${code},"* ]]; then
    record "ok   backend ${path} ${code}"
  else
    record "FAIL backend ${path} returned ${code} (expected ${expected})"
  fi
done

code=$(wait_for_200 "http://127.0.0.1:3000/")
if [ "$code" = "200" ]; then
  record "ok   frontend / 200"
else
  record "FAIL frontend / returned $code"
fi
code=$(status "http://127.0.0.1:3000/a/client/side/route")
if [ "$code" = "200" ]; then
  record "ok   frontend /a/client/side/route 200"
else
  record "FAIL frontend /a/client/side/route returned $code"
fi

exit "$failed"
