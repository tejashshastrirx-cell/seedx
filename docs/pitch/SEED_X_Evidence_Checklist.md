# SEED X: pitch evidence checklist

Deck: `SEED_X_Hackathon_Presentation.pptx` (11 slides, 16:9, no speaker notes) and its PDF export.
Live app: https://seedxsss.tejash-shastri-rx.workers.dev/ · Code: github.com/tejashshastrirx-cell/seedx.
Evidence gathered 31 Oct 2026 with a real Chromium browser (Playwright) against the live site and live Supabase database, using synthetic `@seedx.example` demo accounts. Credentials are not shown anywhere in the deck.

## Feature verification matrix

| Feature | Status | Evidence |
| --- | --- | --- |
| Harvest listings, marketplace, filters, sort | Working, browser-tested | Live screenshots; Playwright `marketplace … filters query live data` |
| Offers, acceptance, orders, delivery timeline | Working, browser-tested | Playwright `buyer requirement to delivered order, through the UI` |
| Atomic stock reservation / no oversell, idempotent replay | Working, tested | Playwright race test (exactly one winner), pgTAP replay tests |
| ClusterCart engine | Working (in-browser engine on live site) | Live run 31 Oct 2026: wheat requirement 35 q, separate ₹5,364 vs pooled ₹6,365, so it recommended separate trips (pooling +18.7%). The server-side run needs `ALLOWED_ORIGINS` set; until then the app shows "Preview (not saved)" |
| NetBack (farmer net / buyer landed) | Working, browser-tested | Live: 300 kg tomato at ₹22/kg, seller pays transport: est. farmer net ₹6,300, buyer landed ₹6,600 |
| My Clients / My Suppliers | Working, tested | pgTAP stages and privacy; Playwright private-notes test |
| Notifications (real-time, archive, preferences) | Working, tested | Playwright archive/restore; pgTAP dedupe and preferences |
| Farmer Command Centre / role dashboards | Working | Live screenshot (demo farmer: 2 listings, 3 active orders, 1 client) |
| Crop catalogue (46 crops, 10-language names) | Working, tested | pgTAP + REST check |
| Ten languages | Working, partial coverage | Core journeys 100% in all 10; Hindi ≈94%, others ≈44% of all strings; machine-assisted, native review pending |
| Seed store, mandi prices, schemes | Working; data partial | Prices are labelled SAMPLE until a data.gov.in key is added; schemes "source check pending" |
| Security controls on slide 9 | Working, tested | pgTAP 141/141, Playwright 14/14 incl. axe accessibility, storage rejection test |
| Email verification links to live site | External setup required | Supabase Auth URL configuration (owner) |
| Email delivery at scale | External setup required | Custom SMTP (owner) |
| Payments, SMS, voice assistant, live weather | Not implemented | Not claimed in the deck |
| Spline 3D | Not used | Not claimed |

## Numbers in the deck and where they come from
| Slide | Number | Type | Source |
| --- | --- | --- | --- |
| 2 | 33% / 36% / 37% farmer share (tomato/onion/potato) | Cited estimate | RBI Working Paper 08/2024 (3 Oct 2024); also cited in a Rajya Sabha answer (29 Nov 2024). The brief cited a Lok Sabha answer of 10 Dec 2024; that document could not be confirmed, so the deck cites the confirmed sources |
| 3 | 54 crops | Cited | PIB / MoFPI summary of NABCONS post-harvest loss study (1 Aug 2025), as given in the brief |
| 5 | 80+60+100 kg, 70+90+80 kg | Illustrative | Labelled "Illustrative scenario" |
| 5 | +18.7% pooled cost, separate trips | Live app output | Demo data, estimated costs |
| 6 | ₹2,500 − ₹200 − ₹50 = ₹2,250 | Illustrative | Labelled |
| 6 | ₹6,300 / ₹6,600 | Live app output | Demo data, estimated costs |
| 8 | 870 million / 98% | Cited | IAMAI–Kantar Internet in India 2024 (all internet users, not farmer-specific) |
| 9 | 141/141, 14/14 | Test results | Project test suites, 31 Oct 2026 |
| 11 | Business model | Proposed | Marked "Proposed, not yet validated" |

## Corrections made to the brief (based on the actual product)
- Hosting is **Cloudflare Workers** (auto-deploy from GitHub), not Cloudflare Pages.
- Spline is not used; Three.js is used only for the ClusterCart data visual.
- No voice assistance exists, so it is omitted.
- The ten languages are live (not "planned"), with native review still pending.
- The QR code was regenerated (`assets/seedx_qr_verified.png`) for the exact live URL.

## Files
- `SEED_X_Hackathon_Presentation.pptx`, `.pdf`
- `SEED_X_Demo_Backup.mp4` (79 s, 1280×720, H.264): home → vegetable marketplace → buyer login → tomato listing with NetBack → ClusterCart run → My Suppliers → dashboard → Hindi switch
- `shots/`: full-resolution live screenshots used in the deck
- `build_deck.cjs`: deck generator

## Before presenting (owner)
1. Set Supabase Edge Function secret `ALLOWED_ORIGINS` so ClusterCart runs server-side (removes the "Preview" banner).
2. Set the Supabase Auth Site URL to the live site.
3. Rehearse with the offline mp4 in case the venue internet fails.
