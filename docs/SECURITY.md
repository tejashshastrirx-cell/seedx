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

- **Private relationship data**: `trade_contacts` rows and notes are owner-only (RLS + owner forced by trigger); `list_trade_contacts` reads only the caller's own offers/orders and never returns the counterparty's notes.
- **Notifications** can only be created server-side (`app_private.notify`); recipients may read, archive and delete their own rows only; duplicate events are dropped by `(recipient_id, dedupe_key)`.
- **Catalogue** is read-only to the API except `admin_upsert_commodity` (MFA admin, validated name maps, audited).
- **Saved searches** are private, size/shape-checked jsonb (≤ 2 KB object), capped at 25 per user.

## Edge Function `run-clustercart`
JWT required (platform `verify_jwt` + `auth.getUser()`), verified email + active buyer role, exact-origin CORS allowlist (`ALLOWED_ORIGINS` secret), 2 KB body limit, UUID validation, 6 runs/min per user, inputs read under the caller's RLS; only the final insert uses the service role through the service-role-only `record_match_run`.

## Browser
Strict CSP and security headers in `public/_headers` (no inline scripts, no third-party scripts, `frame-ancestors 'none'`), verified with `scripts/csp-check.mjs` (0 violations). Only the publishable key is shipped; `.env*` is git-ignored.

## Evidence
- `supabase/tests/database/01_security_and_transactions.test.sql` - 68 pgTAP assertions (role escalation, cross-account reads, unverified users, wrong actor, oversell, replay, logistics data minimisation, admin MFA, storage paths).
- `supabase/tests/database/02_catalogue_relationships_notifications.test.sql` - 73 pgTAP assertions (seller A cannot change seller B stock/price/orders or create products in their name, buyers cannot act for sellers, seed orders never touch harvest inventory, catalogue admin without MFA / non-admin / anon denied, invalid translations rejected, inactive crop blocked, unsupported language rejected, contact owner spoofing denied, other users cannot read/modify private notes, anon denied, forged notification inserts denied, notification content immutable, cross-user archive no-op, saved-search privacy/size, private expiry job not API-callable).
- Remote check (2026-10-31): 40 public tables, RLS enabled on all; remote policy, grant and catalogue fingerprints identical to the locally tested schema; Supabase security advisor shows only intentional authenticated-executable definer RPCs (each enforces its own checks) and leaked-password protection disabled (owner setting).

### Directive security cases 1-18 → evidence
| # | Case | Evidence |
| --- | --- | --- |
| 1 | Anon cannot read private data | pgTAP 01 (profile_private, orders, audit_logs), 02 (trade_contacts, list_trade_contacts); E2E probes |
| 2 | Farmer A vs Farmer B private records/clients | pgTAP 01 (listing update filtered), 02 (notes, derived clients) |
| 3 | Buyer A vs Buyer B orders/suppliers | pgTAP 01 (order visibility), 02 (contacts privacy); E2E supplier-notes test |
| 4 | Buyer cannot edit farmer inventory | pgTAP 01 (column grants); E2E inventory tamper probe |
| 5 | Seller cannot modify another seller | pgTAP 02 (stock, price, impersonated insert, seed-order transitions) |
| 6 | Logistics sees only assigned jobs | pgTAP 01 logistics data minimisation |
| 7 | No self-promotion to admin | pgTAP 01; E2E probe |
| 8 | Admin ops require MFA | pgTAP 01/02 (aal1 denied); E2E catalogue test (UI + API) |
| 9 | Unverified users blocked | pgTAP 01 |
| 10 | Forged notification recipient | pgTAP 02 (direct insert denied, cross-user archive = 0) |
| 11 | Guessed private Storage path | pgTAP 01 storage tests |
| 12 | Tampered price/quantity/unit | pgTAP 01 (below floor, exceeds available); E2E below-floor probe |
| 13 | Oversell / concurrency | E2E simultaneous acceptance race; pgTAP 01 |
| 14 | Replay does not duplicate | pgTAP 01 idempotent replay; E2E replay; pgTAP 02 notification dedupe |
| 15 | Unauthorised status transition | pgTAP 01 (orders, logistics self-delivery), 02 (seed orders) |
| 16 | Invalid upload | live bucket limits (5 MB JPEG/PNG/WebP; 10 MB PDF/JPEG/PNG) verified by query; E2E `storage rejects disallowed file types…` (text upload, foreign folder, guessed private path all denied); owner-path policies (pgTAP 01) |
| 17 | Search/filter reveals nothing private | filters run through RLS (anon REST reads only public listing columns); saved searches private (pgTAP 02) |
| 18 | CORS / redirect origins | E2E Edge Function untrusted-origin probe; Auth redirect allow-list is an owner setting |
- `tests/e2e/integrity-security.spec.ts` - live API: simultaneous acceptance race (exactly one winner, no oversell), idempotent replay, and denied probes (anon reads, self-promotion, admin without MFA, inventory tampering, below-floor price, Edge Function without token / from an untrusted origin).

## Open items (owner actions)
1. Supabase Auth: enable **leaked-password protection**, set Site URL + exact redirect URLs, configure **custom SMTP** (the built-in sender is rate-limited and not for production), consider CAPTCHA (Turnstile).
2. Set `ALLOWED_ORIGINS` for `run-clustercart` to the production domain once the Cloudflare URL exists.
6. Native-speaker review of the nine non-English languages (see `docs/LANGUAGES.md`).
3. **Backups**: the org is on the Free plan (no automated backups/PITR). Upgrade to Pro for daily backups/PITR, or run `scripts/backup.sh` on a schedule. Storage objects need a separate backup.
4. Grant the first admin with `select app_private.owner_grant_staff_role('you@domain', 'admin');` in the SQL editor, then enrol TOTP in Settings.
5. Rotate the demo-account password before any public demo; demo accounts use `@seedx.example`.
