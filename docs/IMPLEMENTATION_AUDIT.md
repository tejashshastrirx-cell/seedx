# SEED X - Implementation audit (One-Shot directive)

Audit date 2026-10-31 · repository `/home/user/SEED-X` · Supabase `jssvwvhqlmijxujquksw` (khetsetu-dev, ap-south-1; ref verified with `list_projects` before every remote change) · unrelated `ucjoivgcljvilstqqiyl` (sales_os) untouched.

Legend: **CV** complete and verified · **IV** implemented, not verified · **P** partial · **M** missing · **OA** blocked - owner action required. Skipped tests are not counted as passed.

## Verification commands (this release, actual results; logs in `qa/logs/`, not committed)
| Command | Result |
| --- | --- |
| `npx tsc -b` | pass (`TSC_OK`) |
| `npx oxlint src tests scripts supabase/functions` | 0 errors, 16 warnings (react-refresh export hints; ternary statements) |
| `npm test` (Vitest) | 72 passed / 0 failed / 0 skipped |
| `./scripts/db-local.sh --test` (pgTAP) | 141 passed / 0 failed (01: 68, 02: 73) |
| `npm run build` | pass |
| `node scripts/csp-check.mjs` | "CSP: no violations or console errors" |
| `npx playwright test` (live dev project) | 14 passed / 0 failed / 0 skipped |
| Remote schema fingerprint vs local rebuild | policies `199752300f71…`, grants `609b7538…`, catalogue `73702bc9…` identical; all new function hashes identical; 4 older functions differ only in comments |
| `get_advisors(security)` | only intentional authenticated-executable definer RPCs + leaked-password protection disabled (owner) |

## Requirements
| § | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Continue existing repo, no duplicate project, no data deletion, forward-only migrations | CV | new `20261031130000_*` migration only; applied migrations untouched; `list_migrations` shows 7 |
| 2 | `docs/IMPLEMENTATION_AUDIT.md` | CV | this file |
| 3 | SEED X identity, tagline, credits, Dhruv | CV | `src/i18n/*` brand keys in all 10 languages; footer/about |
| 4 | Roles: farmer, buyer, seed seller, logistics, admin (+MFA) | CV | pgTAP 01 role tests; `request_role`, `admin_review_role` |
| 5 | Catalogue: Vegetables/Fruits/Grains/Pulses/Oilseeds incl. all named crops + "Other" | CV | pgTAP 02 "catalogue contains every required crop including Other options" (43 codes); E2E `catalogue lists every required crop…` |
| 5 | Catalogue DB-driven, admin-manageable, translated | CV | `admin_upsert_commodity` (pgTAP 02: MFA, validation, audit); `/admin/catalogue`; 10-language `names` (pgTAP 02 + E2E REST) |
| 5 | Listing workflow (crop, variety, qty+unit, grade, dates, min price, private pickup, images, draft/publish) | CV | existing `HarvestForm`; core-journey E2E; pgTAP 01 listing tests |
| 5 | Inventory invariants (available+reserved+sold = total; server-only) | CV | DB constraint + column grants; pgTAP 01; E2E oversell race |
| 5 | Listing statuses incl. cancelled/expired | P | `withdrawn` (= cancelled) and `expired` exist; `expire_stale_listings` added (pgTAP 02); no separate `cancelled` value (documented mapping) |
| 6.1 | Marketplace filters (crop, category, location, quantity, price range, harvest date, grade, demo), sort, pagination | CV | `Marketplace.tsx`; E2E `marketplace category, sort and demo filters query live data` (results change in DB query) |
| 6.1 | Saved searches + search history | CV | `saved_searches` (pgTAP 02 privacy/size); E2E saved searches; recent searches on-device (`searchHistory.ts`, unit tests) |
| 6.1 | Verification filter on sellers | M | no seller-verification data model exists yet |
| 6.2/6.3 | My Clients / My Suppliers, stages lead/saved/enquiry/active/existing/repeat, favourites, private notes | CV | `trade_contacts`, `list_trade_contacts`; pgTAP 02 (stages, privacy); E2E private notes |
| 7 | Offers, counter-offers, accept/reject, versioning | CV | pgTAP 01; core-journey E2E |
| 7 | Orders lifecycle incl. collected/transit/delivered/completed/cancelled/disputed | P | states exist and enforced (pgTAP 01); "collected" = in_transit, "delivery issue/failed delivery" = disputed (documented); no separate pending/failed_delivery states |
| 7 | Payments labelled honestly | CV | order detail "Payment status: not tracked by SEED X…"; seeds pay-on-delivery note; no gateway claimed |
| 7 | Idempotency (acceptance, seed orders, notifications) | CV | pgTAP 01 replay; pgTAP 02 notification dedupe; E2E replay |
| 8 | ClusterCart (constraints, allocation, pooled vs separate, explain, persist, revalidate) | CV | unit tests (engine); Edge Function E2E (previous release); `record_match_run`; acceptance re-checks stock |
| 8 | NetBack | CV | unit tests; `NetBackChart` |
| 9 | Seed marketplace + seller stock + seed orders, isolation | CV | pgTAP 02 seed section (other seller denied, buyer cannot act for seller, dispatch flow, harvest inventory untouched) |
| 10 | Price explorer with source/date/unit/freshness, sample labelled | IV | built previously; sample/MSP rows labelled; live feed **OA** (data.gov.in key) |
| 11 | Schemes with official links + verification state | IV | built previously; `last_verified_at` null until admin review (shown as "Source check pending") |
| 12 | Notifications: DB-backed, categories, unread/read/all-read, archive, delete, pagination, preferences, dedupe, delivery records, realtime | CV | `Notifications.tsx`; pgTAP 02 (prefs, dedupe, deliveries, archive, delete, forged insert); E2E archive/restore; bell uses Realtime + polling |
| 12 | Email channel | OA | recorded as `not_configured` until custom SMTP + mail worker |
| 13 | Ten languages, native scripts, fonts, stored preference (device + profile), fallback, Intl | CV (core) / P (all screens) | unit `i18n.test.ts` (10 langs × 4 checks + fallback); E2E ten-language render + reload; axe in hi/ta; coverage report `docs/i18n-coverage.md` (core journeys 100%; bn–pa ≈44% of all keys, Hindi ≈94%) |
| 13 | Human translation QA | OA | all non-English text machine-assisted; native review required (`docs/LANGUAGES.md`) |
| 14 | Farmer Command Centre, Buyer Procurement Centre, Seed Seller Centre, Logistics, Admin | CV | `Centres.tsx` on `/dashboard`; real RLS counts (verified in browser: 2 listings, 2 active orders, 1 client for demo farmer) |
| 15 | Cinematic hero, Canvas weather, Three.js only for data, mobile/no-WebGL fallback | CV | previous release QA; unchanged |
| 15 | Spline scenes | OA | no published SEED X scenes / no connector; fallbacks render (`docs/SPLINE_ASSETS.md`) |
| 16 | Supabase schema/RLS/RPCs/migrations | CV | 40 tables, RLS on all (remote query); `docs/DATABASE_SCHEMA.md` |
| 17.10 | Security cases 1-18 | CV | mapping table in `docs/SECURITY.md` (pgTAP 01/02, E2E probes, storage E2E) |
| 17.1 | Leaked-password protection, CAPTCHA | OA | dashboard settings (advisor flags it) |
| 17.9 | Backups / PITR | OA | Free plan; `docs/BACKUP_RESTORE.md`, `scripts/backup.sh` |
| 18 | Custom SMTP | OA | built-in sender rate-limited (observed HTTP 429); owner configures in dashboard - never paste credentials in chat |
| 19 | Acceptance A (signup + verify email) | OA | needs custom SMTP or a registered test domain; signup UI built, server rejects unverified trading (pgTAP 01) |
| 19 | B-C (listings persisted, stock changes) | CV | core-journey E2E + pgTAP 01 |
| 19 | D-I (search/filter, offer, notification, order history, inventory, concurrency, replay) | CV | core-journey + features + integrity E2E; pgTAP 01 |
| 19 | J (pickup → transit → delivered → completed; dispute) | CV | core-journey E2E; pgTAP 01 transitions |
| 19 | K-M (clients/suppliers, privacy) | CV | pgTAP 02; E2E private notes |
| 19 | N-O (seed seller stock + order, no harvest mutation) | CV | pgTAP 02 seed section |
| 19 | P (unread/mark-read persists) | CV | pgTAP 01 notifications; `mark_notifications_read`; E2E archive/restore |
| 19 | Q (ten languages on critical workflows) | CV (core) | see §13 |
| 19 | R (filters change DB results) | CV | E2E marketplace filters (demo toggle empties results) |
| 19 | S (logout/login keeps data) | CV | data server-side; E2E logins across tests |
| 19 | T (mobile widths, 3D disabled) | IV | mobile screenshot (bn, 390 px) this release; full mobile E2E not automated |
| 19 | U (invalid/unauthorised rejected) | CV | pgTAP 01/02; E2E probes |
| 19 | V-W (prices/schemes provenance) | IV | built previously; no new automated test |
| 20 | Accessibility | CV | axe WCAG 2.1 A/AA: 0 serious/critical on 9 routes (en) + 3 (hi, ta) after fixing eyebrow contrast, footer link underline, NetBack contrast |
| 21 | GitHub private repo push | OA | no repo attached; `GH_TOKEN` invalid; owner creating private repo + Claude GitHub App |
| 22 | Cloudflare Pages deployment | OA | attached Cloudflare connector is the deprecated Workers-Bindings server (no deploy tool); no API token in environment; plan: Pages Git integration after GitHub push |
| 23 | Operations / backup docs | CV | `docs/OPERATIONS.md`, `docs/BACKUP_RESTORE.md` |
| 25 | Docs set | CV | `docs/` (13 files) + README + CLAUDE.md |
| - | Clean source ZIP | CV | see `docs/RELEASE_REPORT.md` |
