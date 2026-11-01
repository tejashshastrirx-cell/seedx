# SEED X: feature verification for the demo videos (1 Nov 2026)

**Method:** real Chromium (Playwright, headed on Xvfb, recorded with ffmpeg x11grab) against the live site https://seedxsss.tejash-shastri-rx.workers.dev/ and the live Supabase project (`jssvwvhqlmijxujquksw`).
**Accounts:** the synthetic demo accounts `dhruv.farmer@seedx.example` and `hostel.buyer@seedx.example`. A selector dry run was done before recording; backend rows were checked with read-only SQL afterwards.

| Feature | Opens | Works | Saves to backend | Persists after refresh | Correct role | In stage video |
|---|---|---|---|---|---|---|
| Home page, hero, CTAs, language picker | ✅ | ✅ | n/a | n/a | public | ✅ |
| Sign-up form | ✅ | ✅ accepts input | **not submitted** (see notes) | n/a | public | ✅ as a guided preview |
| Login (demo farmer / demo buyer) | ✅ | ✅ | session | ✅ | ✅ | ✅ |
| Role setup ("Farmer – sell my harvest: Active") | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Farmer Command Centre | ✅ | ✅ | read | ✅ | farmer | ✅ |
| My harvest (900 kg tomato listing) | ✅ | ✅ | read | ✅ | farmer | ✅ (unchanged: 900/0/0 kg) |
| New harvest listing → Publish | ✅ | ✅ | ✅ "Demo lot – tomatoes (video demo)", 500 kg, min ₹18, ask ₹22 | ✅ | farmer | ✅ |
| Buyer Procurement Centre, Requirements | ✅ | ✅ | read | ✅ | buyer | ✅ |
| Marketplace search / filters | ✅ | ✅ | recent search saved | ✅ | any | ✅ |
| Offer (300 kg × ₹22, seller pays transport) | ✅ | ✅ | ✅ offer row (accepted) | ✅ | buyer | ✅ |
| NetBack | ✅ | ✅ ₹6,300 farmer net / ₹6,600 buyer landed | computed | ✅ | both | ✅ |
| Offers inbox: Accept / Counter / Reject | ✅ | ✅ (Accept used; Counter/Reject shown) | ✅ | ✅ | farmer | ✅ |
| Stock reservation | ✅ | ✅ | ✅ 500 → 200 available, 300 sold after delivery | ✅ | n/a | ✅ |
| Order SX-2611-1015: pickup → in transit → delivered | ✅ | ✅ | ✅ status `delivered` | ✅ | farmer / buyer | ✅ |
| Notifications bell | ✅ | ✅ | ✅ | ✅ | both | full video only |
| ClusterCart run (wheat, 35 q) | ✅ | ✅ separate ₹5,364 vs pooled ₹6,365 → separate trips | **not saved** (Preview mode) | n/a | buyer | ✅ labelled as a separate scenario |
| My Clients / My Suppliers | ✅ | ✅ | ✅ | ✅ | farmer / buyer | ✅ |
| Hindi language switch | ✅ | ✅ | preference saved | ✅ | any | ✅ |
| Seeds, mandi prices, schemes | ✅ | ✅ | read | ✅ | public | not in the video (time) |
| Payments, SMS | not implemented | – | – | – | – | not shown or claimed |

## Notes
- **Registration was not completed.** A real sign-up sends a verification email, and production email still needs owner setup (custom SMTP, plus the Auth Site URL set to the live site). The video shows the real form filled with synthetic details, a banner saying verification is required, and then a login with the approved demo account. No account was created and no email was sent.
- **ClusterCart shows "Preview (not saved)".** The `run-clustercart` Edge Function rejects the live origin until the owner sets the `ALLOWED_ORIGINS` secret. The app falls back to the same engine in the browser and says so on screen. The result was not altered.
- **The mandi benchmark is SAMPLE data**, as labelled in the app.
- **Hindi coverage is ≈94% of strings.** Seen in English while in Hindi mode:
  - user-entered listing titles (expected; they are data)
  - the search placeholder "Sharbati…"
  - the recent-search chip "tomato"
  All navigation, buttons, dashboard labels and crop names were in Hindi.
- **Extra demo records from aborted takes.** Two earlier takes were aborted: one had browser-chrome cropping and a district typo, the other a Chrome password bubble. Their demo lots were tidied through normal app actions: renamed "…(video demo, take 1/2)", orders SX-2611-1013/1014 completed to *delivered*, lots *withdrawn*. Nothing was deleted. They show as withdrawn lots in Dhruv's My harvest, and that is visible briefly in the video.
- **"E2E private note …" text** appears on the My suppliers cards. These are notes left by the automated test suite on demo accounts; they contain no personal data.
- **No secrets on screen.** No passwords (only masked dots), tokens, API keys or private addresses appear. Only `@seedx.example` / `@example.test` addresses are shown.
- **Production code was not changed. No payments were made.**

## Video QA
| File | Duration | Format | Audio | Size |
|---|---|---|---|---|
| SEED_X_STAGE_DEMO_1080P.mp4 | 2:57.8 | H.264 High, 1920×1080, 30 fps, yuv420p, faststart | silent AAC track (max −91 dB) | 30 MB |
| SEED_X_FULL_GUIDED_WALKTHROUGH.mp4 | 5:27.5 | same | silent | 50 MB |

Both files decode end to end without errors. Frames were reviewed every 3 s (stage) and every 6 s (full) for:
- cursor and click targets
- readability
- overlays not covering key numbers
- no PII

Nothing in the videos is sped up. Shortening was done only with cuts between real actions.

Scripts: `record_demo.cjs` (recorder), `cleanup_take.cjs` (tidies aborted takes via the UI), `edit/edit.py` (cutting, overlays, subtitles, encoding), `edit/cards.cjs` (title and end cards).
