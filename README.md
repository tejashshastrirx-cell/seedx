# SEED X

**Better Farming Starts with Better Connections.** · *From Farm to Future.*

Farmer-first agricultural commerce: harvest listings, buyer demand, server-validated offers and orders,
**ClusterCart** pooled-logistics engine, **NetBack** price intelligence, seed store, dated mandi prices and
official government schemes - in ten Indian languages (English, हिन्दी, বাংলা, తెలుగు, मराठी, தமிழ், ગુજરાતી, ಕನ್ನಡ, മലയാളം, ਪੰਜਾਬੀ).

Created & Developed by Tejash Shastri and Shaurya.

## Stack
Vite + React 19 + TypeScript · Tailwind v4 · React Router · TanStack Query · React Hook Form + Zod · i18next ·
Motion · React Three Fiber / drei · Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions).

## Run locally
Requires Node 20.19+ or 22.12+.

```bash
npm install
cp .env.example .env.local   # skip if your archive already contains .env.local
npm run dev                  # http://localhost:5173
```

`.env.local` needs only browser-safe values:

```
VITE_SUPABASE_URL=https://jssvwvhqlmijxujquksw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key from Supabase dashboard → Project Settings → API>
E2E_DEMO_PASSWORD=<demo account password - local only>
```

Never put a service-role/secret key, DB password or SMTP password in a `VITE_` variable.

## Scripts
| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `preview` | Vite dev server, production build, preview the build |
| `npm run typecheck` | TypeScript project check |
| `npm test` | Vitest unit tests (ClusterCart engine, NetBack, unit conversion, money, weather modes, 10-language integrity, catalogue/search helpers) - 72 tests |
| `npx playwright test` | Live E2E (14 tests): full UI journey, oversell race + replay, security probes, ten languages, marketplace filters + saved searches, private supplier notes, notifications, MFA-gated catalogue admin, storage rejections, axe accessibility (en/hi/ta) |
| `npx tsx scripts/i18n-coverage.ts` | Regenerates `docs/i18n-coverage.md` |
| `npm run db:test` | Rebuilds a throwaway local Postgres from `supabase/migrations` and runs the pgTAP security suite - 141 assertions (needs a local PostgreSQL 16+ with pgTAP on port 54329; see `scripts/db-local.sh`) |

With Docker available you can instead use the Supabase CLI: `npx supabase start`, `npx supabase db reset`, `npx supabase test db`.

## Backend (Supabase project `jssvwvhqlmijxujquksw`, region ap-south-1)
- Migrations: `supabase/migrations/` (identity & roles, marketplace & atomic offer acceptance, ClusterCart/seeds/prices/schemes/storage, reference data, brand migration, FK indexes, crop catalogue v2 + 10 languages + client/supplier relationships + notification preferences + saved searches). All 7 applied to the dev project.
- Demo data: `supabase/seed.sql` (synthetic, `@seedx.example` accounts, labelled "Demo"/"SAMPLE").
- Edge Function: `supabase/functions/run-clustercart` - deployed and E2E-tested (server-side engine, persisted runs, send offers).
- Security: RLS on every table, column-level grants, role grants only via trusted RPCs, admin actions require MFA (AAL2), idempotent atomic stock reservation. `supabase/tests/database/` - 141 pgTAP assertions.

## Demo accounts (synthetic)
`dhruv.farmer@seedx.example`, `kavita.farmer@seedx.example`, `raghav.farmer@seedx.example`, `hostel.buyer@seedx.example`,
`restaurant.buyer@seedx.example`, `seeds.seller@seedx.example`, `transport.partner@seedx.example`, `admin.demo@seedx.example`
(admin needs TOTP MFA set up in Settings before admin pages open). Password = `E2E_DEMO_PASSWORD` in `.env.local`.

## Owner actions still open
1. Supabase Auth → URL configuration: set Site URL and redirect URLs (`http://localhost:5173/auth/callback`, your production domain).
2. Custom SMTP before real users (built-in sender is limited and not for production); enable leaked-password protection.
3. Rename the Supabase project display name `khetsetu-dev` → `seedx-dev` in the dashboard if you like (the ref does not change).
4. data.gov.in API key for live mandi prices (currently clearly labelled SAMPLE rows).
5. Create the private GitHub repo (install the Claude GitHub App on it) and connect it to Cloudflare Pages (build `npm run build`, output `dist`) - see `docs/DEPLOYMENT.md`.
6. Native-speaker review of the nine non-English languages (`docs/LANGUAGES.md`).
7. Backups: Free plan has none - upgrade or schedule `scripts/backup.sh` (`docs/BACKUP_RESTORE.md`).

## Docs
`docs/`: IMPLEMENTATION_AUDIT · RELEASE_REPORT · PRODUCT_SPEC · ARCHITECTURE · DATABASE_SCHEMA · SECURITY · TESTING · LANGUAGES · i18n-coverage · DEPLOYMENT · BACKUP_RESTORE · OPERATIONS · SPLINE_ASSETS. Contributor notes: `CLAUDE.md`.

## Homepage visuals
Approved photoreal hero (`public/assets/seedx/`, responsive WebP/JPEG + mobile focal crops) with a Canvas 2D weather layer
(Auto/Clear/Dust/Rain - visual ambience only; Auto uses a documented default because no weather service is connected).
Three.js is used only for the data-driven ClusterCart table.
