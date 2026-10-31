#!/usr/bin/env bash
# Logical backup of the SEED X database (Free plan has no automated backups). Requires SUPABASE_DB_URL
# (Dashboard -> Project Settings -> Database -> connection string). Store the output somewhere private and encrypted.
set -euo pipefail
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL}"
out="backups/seedx-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p backups
pg_dump "$SUPABASE_DB_URL" --schema=public --schema=app_private --no-owner --format=custom --file "$out.dump"
echo "wrote $out.dump - restore drill: pg_restore --no-owner -d <scratch-db-url> $out.dump"
echo "Storage objects are NOT included; back up buckets separately (e.g. supabase storage cp -r)."
