# SEED X - Operations runbook

## Health checks
- App: open `/`, `/marketplace`, `/prices`; the home page shows live counts read from the database.
- API: `GET https://jssvwvhqlmijxujquksw.supabase.co/rest/v1/commodities?select=code&limit=1` with the publishable key → 200.
- Security advisors: Supabase dashboard → Advisors (or MCP `get_advisors`). Expected: intentional "authenticated can execute SECURITY DEFINER" warnings (each RPC enforces its own checks) and "leaked password protection disabled" until enabled.

## Routine tasks
| Task | How |
| --- | --- |
| Expire stale listings | MFA admin calls `expire_stale_listings()`, or schedule `select app_private.expire_stale_listings_job()` with pg_cron (owner) |
| Manage crops / translations | `/admin/catalogue` (MFA admin) |
| Approve roles, moderate, verify seed certificates, review schemes | `/admin/*` (MFA admin) |
| Import mandi prices | `/admin` CSV import (`admin_import_prices`) until a data.gov.in key exists |
| First admin | SQL editor: `select app_private.owner_grant_staff_role('you@domain', 'admin');` then enrol TOTP in Settings |
| Rotate demo password | Supabase Auth → Users (demo accounts end in `@seedx.example`) |

## Incidents
1. Contain: pause the affected feature (e.g. revoke an RPC grant in a forward migration) or roll back Pages.
2. Check `audit_logs` (admin-readable) and Supabase logs (API, Auth, Postgres).
3. Fix forward with a migration + pgTAP test; record the change in `docs/RELEASE_REPORT.md`.

## Limits to watch
- Built-in Supabase email sender is rate-limited (observed HTTP 429 `over_email_send_rate_limit`); production needs custom SMTP.
- Free plan: no backups (see `BACKUP_RESTORE.md`), project pauses after inactivity.
- Edge Function `run-clustercart`: 6 runs/min/user; `ALLOWED_ORIGINS` must include the production domain.
