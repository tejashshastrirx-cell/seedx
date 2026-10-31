#!/usr/bin/env bash
# Rebuild a throwaway local database from the migrations and run the pgTAP suite.
# Uses a plain PostgreSQL server + supabase/tests/local/00_supabase_shim.sql when the
# Docker-based `supabase start` stack is unavailable. Never point this at a hosted project.
set -euo pipefail
cd "$(dirname "$0")/.."
PGHOST="${LOCAL_PGHOST:-/tmp}"; PGPORT="${LOCAL_PGPORT:-54329}"; PGUSER="${LOCAL_PGUSER:-postgres}"; DB="${LOCAL_DB:-seedx_test}"
case "$PGHOST" in /*|localhost|127.0.0.1) ;; *) echo "refusing non-local host $PGHOST"; exit 2;; esac
PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f supabase/tests/local/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do echo "apply $f"; "${PSQL[@]}" -d "$DB" -f "$f"; done
if [ "${1:-}" != "--no-seed" ] && [ -f supabase/seed.sql ]; then
  DEMO_PW="${E2E_DEMO_PASSWORD:-$(grep -s '^E2E_DEMO_PASSWORD=' .env.local | cut -d= -f2-)}"
  echo "apply seed"; PGOPTIONS="-c seedx.demo_password=${DEMO_PW}" "${PSQL[@]}" -d "$DB" -f supabase/seed.sql
fi
if [ "${1:-}" = "--test" ] || [ "${2:-}" = "--test" ]; then
  status=0
  for t in supabase/tests/database/*.sql; do
    out=$("${PSQL[@]}" -d "$DB" -At -f "$t" 2>&1) || status=1
    echo "$out" | grep -E "^(not ok|# )" || true
    printf '%s: %s passed, %s failed\n' "$t" "$(echo "$out" | grep -c '^ok')" "$(echo "$out" | grep -c '^not ok')"
    echo "$out" | grep -q '^not ok' && status=1
  done
  exit $status
fi
