# SEED X - Deployment

## Supabase (`jssvwvhqlmijxujquksw`, ap-south-1)
Migrations 01-07 (incl. `20261031130000_catalogue_relationships_notifications`, applied 2026-10-31 via the Supabase MCP after verifying the project ref) and the demo seed are applied; `run-clustercart` is deployed (verify_jwt on).
New migration: add `supabase/migrations/<timestamp>_name.sql`, test with `./scripts/db-local.sh --test`, then `npx supabase db push --project-ref jssvwvhqlmijxujquksw` (review the diff first). Regenerate types after schema changes.
Edge Function: `npx supabase functions deploy run-clustercart --project-ref jssvwvhqlmijxujquksw`; set `npx supabase secrets set ALLOWED_ORIGINS=https://your-domain`.

## Cloudflare Pages
**Status 2026-10-31: not deployed.** The Cloudflare connector attached to this workspace is the deprecated *Workers Bindings* server (it can list Workers and manage D1/KV/R2 but cannot upload a Pages or Workers deployment), no Cloudflare API token is available to the build environment, and the GitHub repository does not exist yet. Owner chose: private GitHub repo + Pages Git integration.

1. Push the repo to GitHub (private). 2. Pages → Create project → connect repo. 3. Build `npm run build`, output `dist`, Node 22.
4. Public build config is committed in `.env.production` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` - both browser-safe). Dashboard build variables are optional overrides. Never add secret keys there.
5. `public/_headers` (CSP/security headers) ships automatically. SPA routing: `wrangler.jsonc` (`not_found_handling: single-page-application`) for Workers; Pages treats a project without `404.html` as an SPA. Do not add `_redirects` - Workers rejects `/* /index.html 200` as an infinite loop.
6. Supabase Auth → URL configuration: Site URL = production domain; redirect `https://your-domain/auth/callback` (+ preview domain).

## Verify after deploy
`npx playwright test` against the deployed URL (set `baseURL`), check deep-link refresh (e.g. `/marketplace/<id>`), headers via `curl -I`.

## Rollback
Pages: promote the previous deployment. Database: forward-fix migration; restore from backup if data is affected (see `BACKUP_RESTORE.md`).
