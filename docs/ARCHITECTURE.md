# SEED X - Architecture

```
Browser (Vite + React + TS)  --publishable key + user JWT-->  Supabase
  - React Router, TanStack Query, RHF + Zod, i18next (10 languages)     - Auth (email/password, email confirmation, TOTP MFA)
  - Tailwind design tokens, Motion                               - Postgres: RLS + RPCs (state machines, atomic accept_offer)
  - Hero: photoreal artwork + Canvas 2D weather                  - Storage: harvest-images (public, owner-path), private-user-documents
  - Three.js/R3F only for ClusterCart data visualisation         - Realtime: notifications (RLS-filtered)
                                                                 - Edge Function: run-clustercart (server engine, persisted runs)
Cloudflare Pages (static dist/, _headers CSP, _redirects SPA)
```

**Source of truth** is Postgres. The browser never sets owner ids, prices, totals or inventory directly; it calls RPCs that validate and record events.

| Area | Where |
| --- | --- |
| Schema, RLS, RPCs | `supabase/migrations/*` (01 identity/roles · 02 marketplace · 03 ClusterCart/seeds/prices/schemes/storage · 04 reference data · 05 brand · 06 FK indexes · 07 catalogue/relationships/notifications/saved searches) - see `docs/DATABASE_SCHEMA.md` |
| ClusterCart engine (shared browser/Deno) | `supabase/functions/_shared/clustercart.ts` (deployed copy: `run-clustercart/clustercart.ts`) |
| Edge Function | `supabase/functions/run-clustercart/index.ts` |
| Generated DB types | `src/types/database.ts` (`python3 scripts/gen-types.py`) |
| Pages | `src/features/*` · routes in `src/app/router.tsx` |
| Hero + weather | `src/features/hero/HeroSection.tsx`, `src/features/hero/weather.ts` |
| i18n | `src/i18n/` (10 locale files, `resources.ts`, `languages.ts`), picker + profile sync in `src/components/Layout.tsx`, see `docs/LANGUAGES.md` |
| Crop catalogue | `crop_categories` + `commodities.names`; `src/lib/catalog.ts`, `src/components/CommodityOptions.tsx`, admin `src/features/admin/Catalogue.tsx` |
| Relationships | `trade_contacts` + `list_trade_contacts`; `src/features/network/Network.tsx` (`/farmer/clients`, `/buyer/suppliers`) |
| Notifications | `src/features/notifications/Notifications.tsx` (centre + preferences), bell with Realtime + polling in `Layout.tsx` |
| Command centres | `src/features/dashboard/Centres.tsx` on `/dashboard` (RLS-scoped counts only) |
| ClusterCart 3D | `src/scenes/ClusterShowcase3D.tsx` (homepage, live engine on published listings), `src/scenes/ClusterNetwork3D.tsx` (matching page) |

**ClusterCart** (deterministic, not AI): hard constraints first (commodity, variety, grade, window, freshness, price floor, transit) with reason codes → candidate fill orders (cheapest-first + nearest-neighbour clusters) → separate vs pooled cost (straight-line × 1.3, default rate card, always labelled as estimates) → recommend pooling only if ≥5% cheaper and within transit limit → buyer sends offers, each farmer accepts separately (atomic reservation).

**NetBack**: farmer net = gross − seller-paid costs only; buyer landed = gross + buyer-paid costs. Integer paise everywhere.
