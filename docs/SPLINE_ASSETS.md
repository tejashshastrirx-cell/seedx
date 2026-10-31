# SEED X - Spline assets

Status: **no Spline scenes are published for SEED X**, so every slot renders its built-in fallback. No Spline connector exists in this environment and no URL has been invented.

| Slot (`src/scenes/manifest.ts`) | Env var | Page | Fallback today |
| --- | --- | --- | --- |
| SEEDX_HERO_FARM | `VITE_SPLINE_HERO_FARM_URL` | Home hero | Photoreal hero image + Canvas 2D weather |
| SEEDX_CHARACTER_TRIO | `VITE_SPLINE_CHARACTER_TRIO_URL` | About | Team cards |
| SEEDX_FARMER_GUIDE | `VITE_SPLINE_FARMER_GUIDE_URL` | Home journey | Dhruv avatar |
| SEEDX_HARVEST_JOURNEY | `VITE_SPLINE_HARVEST_JOURNEY_URL` | Home journey | Journey steps |

Rules
- Only `https://prod.spline.design/<id>/scene.splinecode` URLs are accepted (regex-validated); anything else is ignored.
- Publish the scene in Spline, set the env var in Cloudflare Pages, redeploy. Add `https://prod.spline.design` to CSP `connect-src`/`script-src` as needed and re-run `scripts/csp-check.mjs`.
- Founder artwork must preserve Tejash's real identity; no generated lookalike may be presented as the real person. No portrait has been supplied, so team cards use initials.
- Three.js remains reserved for data visualisation (ClusterCart).
