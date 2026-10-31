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
| Live mandi feed (data.gov.in), payments, SMS | Not built - needs owner API keys/providers |
