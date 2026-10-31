# SEED X - Database schema

Supabase project `jssvwvhqlmijxujquksw` (ap-south-1, Postgres 17). Source of truth: `supabase/migrations/` (forward-only; an applied migration is never edited).
Generated client types: `src/types/database.ts` (`python3 scripts/gen-types.py > src/types/database.ts`).

## Migrations
| File | Contents |
| --- | --- |
| `20261031120000_foundation_identity_roles` | profiles (public-safe), profile_private, user_roles + guard trigger, `app_private` helpers (has_role, is_email_verified, is_admin = role + AAL2), audit_logs, notifications, idempotency_keys, signup trigger, role request/review RPCs |
| `20261031120100_marketplace` | commodities, crop_varieties, harvest_listings (+ private pickup, media), demand_requests, offers/offer_events, orders/order_events/order_cost_lines/order_delivery_details, RPCs `submit_offer`, `counter_offer`, `respond_offer`, `accept_offer` (atomic + idempotent), `transition_order`, `assign_logistics`, `logistics_jobs` |
| `20261031120200_clustercart_seeds_data_ops` | match_runs/allocations, `record_match_run` (service role only), `send_match_offers`; seed products/inventory/orders; data sources, ingestion runs, market price observations; schemes + reviews + saved; land listings/enquiries; reports, support tickets; admin RPCs; Storage buckets + policies; Realtime |
| `20261031120300_reference_data` | 21 commodities, varieties, data sources, MSP rows (verification pending), 6 official schemes |
| `20261031120400_brand_seed_x` | SEED X naming in defaults and order numbers (`SX-`) |
| `20261031120500_fk_indexes` | 40 covering indexes for foreign keys |
| `20261031130000_catalogue_relationships_notifications` | see below |

### 20261031130000 (this release)
- **Languages**: `app_private.supported_languages()` = en, hi, bn, te, mr, ta, gu, kn, ml, pa; `profiles.preferred_language` check widened; signup trigger accepts any supported code and falls back to `en`.
- **Crop catalogue v2**: `crop_categories(code, names jsonb, sort_order, is_active)`; `commodities` gains `names jsonb` (10-language map validated by `app_private.valid_name_map`), `is_active`, `is_other`, `sort_order`, `updated_at`; category is now a FK to `crop_categories`. 25 crops added (46 total) including an "Other" crop per category. Inactive crops are rejected for new listings/demand (`require_active_commodity` trigger). `admin_upsert_commodity` (MFA admin, audited) adds/edits/deactivates; codes are immutable.
- **Listing expiry**: `app_private.expire_stale_listings_job()` (no API grant; schedule with pg_cron) + `public.expire_stale_listings()` (MFA admin). Listings with reservations are never expired.
- **Trade relationships**: `trade_contacts(owner_id, counterparty_id, kind client|supplier, manual_stage lead|saved, is_favourite, private_note ≤ 2000)`, owner-only RLS, owner forced by trigger, 500/owner cap. `list_trade_contacts(kind)` derives the stage from the caller's own offers/orders: repeat_client (≥2 completed) > existing_client (1) > active (live order) > enquiry (offer) > saved/lead.
- **Notifications**: `notifications.category` (generated from type), `archived_at`, `dedupe_key` (unique per recipient); `notification_preferences` (optional categories only - orders/account/security are always delivered); `notification_deliveries` (in_app delivered; email recorded as `not_configured` until custom SMTP + a mail worker exist); `archive_notifications(ids, archive)`; recipients may delete their own notifications.
- **Saved searches**: `saved_searches(owner_id, scope, name, filters jsonb ≤ 2 KB)`, owner-only, 25/owner cap. Recent search terms stay on the device (localStorage), never on the server.

## Tables (40, all with RLS enabled)
audit_logs, commodities, crop_categories, crop_varieties, data_sources, demand_requests, government_schemes, harvest_listings, harvest_media, harvest_pickup_locations, idempotency_keys, ingestion_runs, land_enquiries, land_listings, market_price_observations, match_allocations, match_runs, notification_deliveries, notification_preferences, notifications, offer_events, offers, order_cost_lines, order_delivery_details, order_events, orders, profile_private, profiles, reports, saved_schemes, saved_searches, scheme_reviews, seed_inventory, seed_order_events, seed_order_items, seed_orders, seed_products, support_tickets, trade_contacts, user_roles.

## Public RPCs (26)
accept_offer, admin_import_prices, admin_list_users, admin_moderate, admin_overview, admin_review_role, admin_review_scheme, admin_upsert_commodity, admin_verify_seed_certification, archive_notifications, assign_logistics, counter_offer, expire_stale_listings, list_logistics_providers, list_trade_contacts, logistics_jobs, mark_notifications_read, place_seed_order, record_match_run (service role only), request_role, respond_offer, send_match_offers, set_seed_stock, submit_offer, transition_order, transition_seed_order.

## Conventions
- Money: integer paise (`bigint`). Quantities: `numeric(14,3)` + explicit unit (kg/quintal/tonne); convert only via `UNIT_TO_KG`.
- Status vocabularies: listing `draft → published ⇄ paused → partially_reserved/reserved → sold`, closed states `withdrawn` (shown as "cancelled/withdrawn") and `expired`. Order `confirmed → pickup_scheduled → in_transit (collected) → delivered → completed`, side exits `cancelled`, `disputed` (delivery issue / failed delivery).
- Every `SECURITY DEFINER` function sets `search_path = ''` and has explicit `EXECUTE` grants.
