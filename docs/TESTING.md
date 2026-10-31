# SEED X - Testing

| Layer | Command | Count (this release) | Covers |
| --- | --- | --- | --- |
| Type check | `npx tsc -b` | - | whole app, strict mode |
| Unit (Vitest) | `npm test` | 72 tests / 4 files | ClusterCart engine, NetBack, units/money, weather modes, **10-language integrity** (core-journey coverage, no stray keys, placeholder parity, native-script check per language, English fallback, browser-language matching), catalogue name fallback, on-device search history |
| Database (pgTAP) | `npm run db:test` (`./scripts/db-local.sh --test`) | 141 assertions / 2 files (68 + 73) | RLS, grants, role escalation, MFA-gated admin, atomic/idempotent acceptance, oversell, state machines, privacy, storage paths; **new**: catalogue admin (MFA, validation, audit), inactive crops, 10-language profile/signup, trade contacts (owner forcing, privacy, derived stages), notification preferences/dedupe/deliveries/archive/delete, saved searches (privacy, size/shape), listing expiry, seed-seller isolation (stock, price, impersonation, seed-order actions) and seed orders never touching harvest inventory |
| E2E (Playwright, live dev project) | `NODE_PATH=/opt/node-tools/node_modules npx playwright test` | 14 tests / 4 files | full buyer→farmer→transport→delivery journey; simultaneous-accept race + replay; live security probes; **ten languages render + persist**; marketplace category/sort/demo filters; saved searches; private supplier notes vs counterparty; notification archive/restore; catalogue admin blocked without MFA (UI + API); catalogue translations via REST; storage rejects wrong file type / foreign folder / guessed private path |
| Accessibility | `tests/e2e/a11y.spec.ts` (axe-core, WCAG 2.1 A/AA) | 9 public routes (en) + 3 (hi, ta) | zero serious/critical violations required |
| Lint | `npx oxlint src tests scripts supabase/functions` | 0 errors, 16 warnings | warnings: react-refresh export hints (dev HMR only) and ternary statements |
| i18n coverage | `npx tsx scripts/i18n-coverage.ts` | writes `docs/i18n-coverage.md` | per-language key coverage, missing keys by namespace |
| Headers/CSP | `node scripts/csp-check.mjs` | 0 violations (previous release) | CSP compliance of built app |

`db-local.sh` fails the run on any SQL error or pgTAP plan mismatch (not only on `not ok`).

## Notes
- E2E runs against the dev Supabase project with synthetic `@seedx.example` accounts; tests clean up rows they create (saved searches) or restore state (archived notifications).
- The local DB runner uses plain PostgreSQL 16 + `supabase/tests/local/00_supabase_shim.sql` because Docker is unavailable in the build container; `npx supabase test db` works where Docker is available.
- Not automated yet: email delivery (needs custom SMTP), payments (not built), real TOTP enrolment of the demo admin (MFA gating is verified negatively; positive admin paths are verified in pgTAP with `aal2` claims).
