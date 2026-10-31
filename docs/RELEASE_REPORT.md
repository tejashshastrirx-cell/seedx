# SEED X - Release report (2026-10-31, One-Shot directive)

Branch `release/2026-10-31-one-shot` (local git; no remote yet). Previous release commit `2c30f2d`.

## 1. What was found
- Existing SEED X repo at `/home/user/SEED-X` (React 19 + Vite + Supabase), 6 migrations applied to the dedicated project `jssvwvhqlmijxujquksw` (khetsetu-dev, ap-south-1, Free plan). Remote schema matched the repo. `sales_os` (`ucjoivgcljvilstqqiyl`) was not touched.
- Gaps against the directive: crop catalogue limited to 21 crops without categories/translations or admin management; only English + Hindi; no client/supplier relationships; notifications without categories/preferences/archive/dedupe; basic marketplace filters; generic dashboard; docs not under `docs/`; no GitHub remote; no Cloudflare deployment.

## 2. What changed
- **Database** (forward migration `20261031130000_catalogue_relationships_notifications`, applied locally and remotely): crop categories + 25 new crops (46 total, "Other" per category) with names in ten languages, inactive-crop guard, `admin_upsert_commodity`; ten-language `preferred_language`; `trade_contacts` + `list_trade_contacts`; notification `category`/`archived_at`/`dedupe_key`, `notification_preferences`, `notification_deliveries`, `archive_notifications`, delete policy; `saved_searches`; `expire_stale_listings` (+ private job).
- **UI**: grouped, localised crop pickers everywhere; `/admin/catalogue`; `/farmer/clients`, `/buyer/suppliers` (+ "save as client/supplier" on orders); notification centre with categories, unread/archived, pagination, archive/restore/delete and preferences; marketplace category, quantity, price range, harvest date, hide-demo, sort, saved searches and on-device recent searches; Farmer/Buyer/Seed-seller/Logistics command centres; honest payment labelling on orders.
- **Languages**: en, hi, bn, te, mr, ta, gu, kn, ml, pa; native-name picker; device + profile persistence; browser-language detection; per-script Noto fonts (lazy via unicode-range); localised dates with Latin digits.
- **Accessibility fixes** from axe: eyebrow text contrast, footer link underline, NetBack figure contrast.
- **Docs**: all under `docs/` + README + CLAUDE.md.

## 3. Works end-to-end (demonstrated by passing tests)
Buyer requirement → farmer listing → offer → acceptance → logistics → delivery → completion (UI); simultaneous acceptance cannot oversell and replay returns the same order; ten languages render and persist across reload; marketplace filters change database results; saved searches persist per user; private supplier notes invisible to the counterparty; notification archive/restore; catalogue admin blocked without MFA in UI and API; storage rejects wrong file types, foreign folders and guessed private paths.

## 4. Database
7 migrations applied remotely; 40 public tables, RLS enabled on all; 26 public RPCs. pgTAP 141/141 (`01` 68, `02` 73). Remote policy/grant/catalogue fingerprints identical to the local rebuild.

## 5. Security (actual results)
pgTAP 141 passed, 0 failed; Playwright security probes, race/replay, storage and MFA tests passed. Directive cases 1-18 mapped to tests in `docs/SECURITY.md`. Supabase advisor: intentional definer-RPC warnings + leaked-password protection disabled (owner setting).

## 6. Languages
Core journeys (navigation, common UI, errors, home, auth, onboarding, dashboard/centres, notifications, clients/suppliers, marketplace filters, footer, 404) are 100% translated in all ten languages (unit-tested). Overall key coverage: en 100%, hi 93.5%, other eight 43.8% each - the rest falls back to English (`docs/i18n-coverage.md`). All non-English text is machine-assisted and **needs native-speaker review**.

## 7. Design / 3D
Unchanged from the previous release: photoreal hero + Canvas weather (Auto/Clear/Dust/Rain, reduced-motion aware), Three.js only for ClusterCart data. Spline: no published scenes, fallbacks render (`docs/SPLINE_ASSETS.md`).

## 8. Tests (commands and counts)
`npx tsc -b` pass · oxlint 0 errors / 16 warnings · Vitest 72/72 · pgTAP 141/141 · `npm run build` pass · CSP check 0 violations · Playwright 14/14 (0 skipped). Logs were written to `qa/logs/` (local, git-ignored).

## 9. Cloudflare - OWNER ACTION REQUIRED
Not deployed. The connected Cloudflare connector is the deprecated Workers-Bindings server: it lists Workers (account has campuspulse-school, campuspulse, commandops-3d, cold-king-0f2c) and manages D1/KV/R2, but has no tool to upload a Pages/Workers deployment, and no Cloudflare API token is available. Agreed route: Pages Git integration once the GitHub repo exists (build `npm run build`, output `dist`, env `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Alternative: connect the newer Cloudflare API connector.

## 10. GitHub - OWNER ACTION REQUIRED
No repository attached to this session and the environment's `GH_TOKEN` is invalid. Owner is creating a private repo and installing the Claude GitHub App; then the branch is pushed (no force-push, history preserved).

## 11. Owner actions
1. Private GitHub repo + Claude GitHub App (connect at claude.ai/connect-github) → tell Claude `owner/repo`.
2. Cloudflare Pages: connect that repo (or attach the Cloudflare API connector).
3. After the Pages URL exists: Supabase Auth Site URL + redirect URLs; `ALLOWED_ORIGINS` secret for `run-clustercart`.
4. Custom SMTP (dashboard) - required for real signup/reset emails; enable leaked-password protection.
5. Backups: upgrade to Pro (daily backups/PITR) or schedule `scripts/backup.sh`; back up Storage separately.
6. First real admin via `app_private.owner_grant_staff_role`, then TOTP enrolment.
7. data.gov.in API key for live mandi prices; native-speaker translation review; Tejash portrait if founder artwork is wanted.

## 12. Known limitations
- No separate `cancelled`/`failed_delivery` status values (mapped to `withdrawn`/`disputed`).
- No seller-verification filter (no verification model yet).
- Email notifications are recorded but not sent (no SMTP); notification titles are stored in English.
- Mobile layouts were checked by screenshot, not by an automated mobile E2E suite. Price-explorer and scheme pages were not re-tested in this release.
- Large JS chunks (Three.js/Spline runtime are lazy; main bundle ~730 kB minified) - code-splitting can be improved.

## 13. Next priority
GitHub push → Cloudflare Pages deployment → production auth URLs + SMTP → live-URL smoke tests (deep links, headers, login).
