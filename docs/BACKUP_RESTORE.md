# SEED X - Backup & restore

## Current state (verified)
- The Supabase organisation is on the **Free plan**: no automated daily backups and no point-in-time recovery. This is an owner decision (billable upgrade); nothing in this release changes it.
- Schema is fully reproducible from `supabase/migrations/` (verified: a throwaway database is rebuilt from scratch on every `npm run db:test`, and remote policy/grant/catalogue fingerprints match the local rebuild).
- Data (users, listings, orders) is **not** reproducible from git and needs backups.

## Recommended (owner)
1. Upgrade to Supabase Pro for daily backups; add the PITR add-on if order data becomes business-critical.
2. Until then, run `scripts/backup.sh` on a schedule from a trusted machine:
   ```bash
   SUPABASE_DB_URL='postgresql://…' ./scripts/backup.sh   # writes backups/seedx-<UTC>.dump (git-ignored)
   ```
   Keep dumps encrypted and off the laptop (the URL contains the DB password - never commit it).
3. Storage buckets (`harvest-images`, `private-user-documents`) are not in `pg_dump`; copy them separately with the Supabase CLI.

## Restore drill (do this once per quarter)
1. Create a scratch Postgres (or a Supabase branch/new project - billable).
2. `pg_restore --no-owner -d <scratch-url> backups/seedx-<ts>.dump`
3. Run `supabase/tests/database/*.sql` against the scratch DB (they run in a rolled-back transaction).
4. Point a local build at the scratch project and run the E2E smoke tests.

## Rollback rules
- Schema: never edit an applied migration; ship a forward fix migration.
- Data: restore into a scratch DB first, then copy back only the affected rows.
- Frontend (Cloudflare Pages): promote the previous deployment.
