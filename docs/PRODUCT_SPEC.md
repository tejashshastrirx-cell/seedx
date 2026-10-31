# SEED X - Product spec (implemented scope)

**SEED X - Better Farming Starts with Better Connections. From Farm to Future.** Created & Developed by Tejash Shastri and Shaurya.
Roles: farmer, buyer, seed seller, logistics partner, landowner, support, admin. Team: Tejash Shastri (Founder, Creator & Product Lead), Shaurya (Co-developer & Technical Collaborator), Dhruv (fictional farmer guide).

| Module | Status |
| --- | --- |
| Auth: signup, email verification, login, reset, PKCE callback, TOTP MFA | Built; live email depends on SMTP (owner action) |
| Roles & onboarding | Built + tested |
| Harvest listings (private pickup, photos, status machine) | Built + tested |
| Buyer requirements, offers, counter-offers, acceptance | Built + E2E tested |
| Orders: timeline, logistics assignment, pickup/transit/receipt, cancel | Built + E2E tested |
| ClusterCart engine + Edge Function + send offers | Built + unit + E2E tested |
| NetBack (waterfall + line items + mandi benchmark) | Built + unit tested |
| Seed store, seller stock, seed orders | Built + pgTAP covered |
| Mandi price explorer (type, unit conversion, freshness, URL filters, mobile sheet) | Built; data = labelled SAMPLE + MSP pending PIB check until OGD key |
| Government schemes (official links, verification status, saved) | Built |
| Landowner workspace (enquiries; no legal e-signing) | Built |
| Admin (MFA): roles, moderation, seed certification check, scheme review, CSV price import, audit log | Built |
| Homepage: photoreal hero + Canvas weather, live ClusterCart 3D, trust & sources | Built + browser QA |
| Crop catalogue: 5 categories + fibre/spice/other, 46 crops incl. "Other" per category, 10-language names, admin management | Built + pgTAP + E2E |
| Marketplace filters: category, crop, state, grade, min quantity, price range, harvest date, hide demo, sort, pagination, saved searches, on-device recent searches | Built + E2E |
| My Clients (farmer) / My Suppliers (buyer): derived stages lead/saved/enquiry/active/existing/repeat, favourites, private notes | Built + pgTAP + E2E |
| Notifications: categories, unread/archived views, pagination, archive/delete, preferences, dedupe, delivery records | Built + pgTAP + E2E (email channel = not configured) |
| Command centres: farmer, buyer, seed seller, logistics, admin entry | Built (real counts only) |
| Ten languages (en, hi, bn, te, mr, ta, gu, kn, ml, pa) | Built; core journeys 100% in every language, remaining screens fall back to English; native review pending |
| Payments | Not integrated - orders state "not tracked by SEED X"; seed orders are pay-on-delivery |
| Live mandi feed (data.gov.in), SMS, email delivery | Not built - needs owner API keys/providers/SMTP |

## Status mapping (no risky state-machine rewrite)
Listing `withdrawn` = cancelled by the farmer; `expired` set by the expiry job. Order `in_transit` = collected/picked up; `disputed` = delivery issue or failed delivery (raised by either party from in_transit/delivered); every transition is recorded in `order_events`.
