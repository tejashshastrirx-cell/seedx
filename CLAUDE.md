# SEED X - notes for Claude Code
- Product name is **SEED X** (never the retired working name in UI). Palette: #174B35 / #E5A63B / #F5F0E4 / #FFFFFF / #E6F1E7.
- Money is integer paise; quantities carry an explicit unit; convert only via `UNIT_TO_KG`.
- Never trust the client for owner ids, prices, totals, inventory or roles - add/extend an RPC and a pgTAP test instead.
- Every schema change: new migration + `./scripts/db-local.sh --test` + `python3 scripts/gen-types.py > src/types/database.ts`.
- Do not fabricate prices, weather, counts, savings or routes; label sample data. Transport costs are estimates.
- Checks: `npx tsc -b`, `npm test`, `npm run db:test`, `npm run build`, `npx playwright test` (live dev project, synthetic accounts).
- Three.js only for data visualisation; hero weather is Canvas 2D (`src/features/hero/weather.ts`).
