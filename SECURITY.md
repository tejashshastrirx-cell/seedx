# SEED X - Security

Layered controls, each tested. SEED X is not "unhackable"; this file lists what is enforced and what remains open.

## Enforced in the database (Supabase Postgres)
- **RLS on every table** with per-operation policies and explicit grants; anon/authenticated start from `revoke all`.
- **Column-level grants**: owners cannot write inventory (`available/reserved/sold_quantity`), status of role grants, verification flags or audit rows.
- **Roles are trusted records**: never taken from signup metadata. Farmer/buyer self-activate after email verification; seller/logistics/landowner need admin review; admin/support only via an owner-only function (`app_private.owner_grant_staff_role`, not callable from the API).
- **Admin = role + MFA**: every admin RPC and admin policy requires `aal2` in the JWT.
- **Email verification** is checked server-side (`auth.users.email_confirmed_at`) before listings, offers, orders, role requests.
- **Atomic, idempotent money paths**: `accept_offer`, `place_seed_order` lock rows, reserve stock with conditional updates, snapshot accepted terms and store an idempotency response (reuse with a different payload is rejected).
- **State machines** for listings, demand, offers, orders, seed orders - illegal transitions raise errors.
- **Privacy**: public coordinates are coarsened to ~1 km; exact pickup/delivery details are visible only to order parties and the assigned transporter while the job is active.
- **Append-only audit log** (admin-readable only) for role, offer, order, moderation and admin actions.
- `SECURITY DEFINER` functions use `search_path = ''`, schema-qualified names and explicit `EXECUTE` grants.

## Edge Function `run-clustercart`
JWT required (platform `verify_jwt` + `auth.getUser()`), verified email + active buyer role, exact-origin CORS allowlist (`ALLOWED_ORIGINS` secret), 2 KB body limit, UUID validation, 6 runs/min per user, inputs read under the caller's RLS; only the final insert uses the service role through the service-role-only `record_match_run`.

## Browser
Strict CSP and security headers in `public/_headers` (no inline scripts, no third-party scripts, `frame-ancestors 'none'`), verified with `scripts/csp-check.mjs` (0 violations). Only the publishable key is shipped; `.env*` is git-ignored.

## Evidence
- `supabase/tests/database/01_security_and_transactions.test.sql` - 68 pgTAP assertions (role escalation, cross-account reads, unverified users, wrong actor, oversell, replay, logistics data minimisation, admin MFA, storage paths).
- `tests/e2e/integrity-security.spec.ts` - live API: simultaneous acceptance race (exactly one winner, no oversell), idempotent replay, and denied probes (anon reads, self-promotion, admin without MFA, inventory tampering, below-floor price, Edge Function without token / from an untrusted origin).

## Open items (owner actions)
1. Supabase Auth: enable **leaked-password protection**, set Site URL + exact redirect URLs, configure **custom SMTP** (the built-in sender is rate-limited and not for production), consider CAPTCHA (Turnstile).
2. Set `ALLOWED_ORIGINS` for `run-clustercart` to the production domain.
3. **Backups**: the org is on the Free plan (no automated backups/PITR). Upgrade to Pro for daily backups/PITR, or run `scripts/backup.sh` on a schedule. Storage objects need a separate backup.
4. Grant the first admin with `select app_private.owner_grant_staff_role('you@domain', 'admin');` in the SQL editor, then enrol TOTP in Settings.
5. Rotate the demo-account password before any public demo; demo accounts use `@seedx.example`.
