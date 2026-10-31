# SEED X - Deployment

## Supabase (`jssvwvhqlmijxujquksw`, ap-south-1)
Migrations 01-06 and the demo seed are applied; `run-clustercart` is deployed (verify_jwt on).
New migration: add `supabase/migrations/<timestamp>_name.sql`, test with `./scripts/db-local.sh --test`, then `npx supabase db push --project-ref jssvwvhqlmijxujquksw` (review the diff first). Regenerate types after schema changes.
Edge Function: `npx supabase functions deploy run-clustercart --project-ref jssvwvhqlmijxujquksw`; set `npx supabase secrets set ALLOWED_ORIGINS=https://your-domain`.

## Cloudflare Pages
1. Push the repo to GitHub (private). 2. Pages → Create project → connect repo. 3. Build `npm run build`, output `dist`, Node 22.
4. Env vars (Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` only.
5. `public/_headers` (CSP/security headers) and `public/_redirects` (SPA fallback) ship automatically.
6. Supabase Auth → URL configuration: Site URL = production domain; redirect `https://your-domain/auth/callback` (+ preview domain).

## Verify after deploy
`npx playwright test` against the deployed URL (set `baseURL`), check deep-link refresh (e.g. `/marketplace/<id>`), headers via `curl -I`.

## Rollback
Pages: promote the previous deployment. Database: forward-fix migration; restore from backup if data is affected (see SECURITY.md → backups).
