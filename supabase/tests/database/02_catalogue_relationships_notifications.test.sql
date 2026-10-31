-- pgTAP suite 2: crop catalogue, ten-language preference, trade relationships,
-- notification preferences/archive/dedupe/deliveries, saved searches, listing expiry,
-- plus extra negative authorisation checks. Runs in one transaction and rolls back.
begin;
set search_path = public, extensions;
select plan(73);

create schema if not exists tests;
create or replace function tests.as_user(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function tests.as_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('33333333-0000-4000-8000-0000000000fa', 'fa2@test.example', now(), '{}'),
  ('33333333-0000-4000-8000-0000000000fb', 'fb2@test.example', now(), '{}'),
  ('33333333-0000-4000-8000-0000000000ba', 'ba2@test.example', now(), '{}'),
  ('33333333-0000-4000-8000-0000000000bb', 'bb2@test.example', now(), '{}'),
  ('33333333-0000-4000-8000-0000000000ad', 'ad2@test.example', now(), '{}'),
  ('33333333-0000-4000-8000-00000000006c', 'ml@test.example', now(), '{"preferred_language":"ml"}'),
  ('33333333-0000-4000-8000-00000000007a', 'zz@test.example', now(), '{"preferred_language":"zz"}'),
  ('33333333-0000-4000-8000-0000000000ca', 'sa@test.example', now(), '{}'),
  ('33333333-0000-4000-8000-0000000000cb', 'sb@test.example', now(), '{}');
insert into public.user_roles (user_id, role, status) values
  ('33333333-0000-4000-8000-0000000000fa', 'farmer', 'active'),
  ('33333333-0000-4000-8000-0000000000fb', 'farmer', 'active'),
  ('33333333-0000-4000-8000-0000000000ba', 'buyer', 'active'),
  ('33333333-0000-4000-8000-0000000000bb', 'buyer', 'active'),
  ('33333333-0000-4000-8000-0000000000ad', 'admin', 'active'),
  ('33333333-0000-4000-8000-0000000000ca', 'seed_seller', 'active'),
  ('33333333-0000-4000-8000-0000000000cb', 'seed_seller', 'active');

-- ---------------------------------------------------------------- catalogue
select tests.as_anon();
select is((select count(*)::int from public.crop_categories where code in ('vegetable', 'fruit', 'cereal', 'pulse', 'oilseed')), 5,
  'anon can read the five core crop categories');
select is((select count(*)::int from public.commodities where code in (
  'tomato','potato','onion','cauliflower','cabbage','brinjal','okra','green_chilli','capsicum','cucumber','carrot','radish','spinach','peas','vegetable_other',
  'mango','banana','apple','guava','papaya','pomegranate','grapes','watermelon','fruit_other',
  'wheat','paddy','rice','maize','barley','millets','grain_other',
  'gram','lentil','tur','moong','urad','pulse_other',
  'mustard','groundnut','soybean','sesame','sunflower','oilseed_other')), 43, 'catalogue contains every required crop including Other options');
select is((select count(*)::int from public.commodities c
  where c.is_active and exists (select 1 from unnest(array['en','hi','bn','te','mr','ta','gu','kn','ml','pa']) l where not (c.names ? l))), 0,
  'every active commodity has a name in all ten languages');
select is((select count(*)::int from public.crop_categories c
  where exists (select 1 from unnest(array['en','hi','bn','te','mr','ta','gu','kn','ml','pa']) l where not (c.names ? l))), 0,
  'every category has a name in all ten languages');
select throws_ok($$ insert into public.commodities (code, name_en, name_hi, category, default_unit, shelf_life_days, names)
  values ('hack', 'Hack', 'Hack', 'other', 'kg', 1, '{"en":"Hack"}') $$, '42501', null, 'anon cannot insert commodities');
select throws_ok($$ select public.admin_upsert_commodity('x_crop', 'other', '{"en":"X"}', 'kg', 10) $$, '42501', null,
  'anon cannot execute admin_upsert_commodity');

select tests.as_user('33333333-0000-4000-8000-0000000000fa');
select throws_ok($$ update public.commodities set is_active = false where code = 'wheat' $$, '42501', null,
  'authenticated user cannot update the catalogue directly');
select throws_ok($$ select public.admin_upsert_commodity('x_crop', 'other', '{"en":"X"}', 'kg', 10) $$, '42501', null,
  'farmer cannot manage the catalogue');
select tests.as_user('33333333-0000-4000-8000-0000000000ad', 'aal1');
select throws_ok($$ select public.admin_upsert_commodity('x_crop', 'other', '{"en":"X"}', 'kg', 10) $$, '42501', null,
  'admin without MFA (aal1) cannot manage the catalogue');
select tests.as_user('33333333-0000-4000-8000-0000000000ad', 'aal2');
select throws_ok($$ select public.admin_upsert_commodity('x_crop', 'other', '{"hi":"एक्स"}', 'kg', 10) $$, '22023', null,
  'names without English are rejected');
select throws_ok($$ select public.admin_upsert_commodity('x_crop', 'other', '{"en":"X","fr":"X"}', 'kg', 10) $$, '22023', null,
  'unsupported language keys are rejected');
select throws_ok($$ select public.admin_upsert_commodity('X-Crop!', 'other', '{"en":"X"}', 'kg', 10) $$, '22023', null,
  'invalid commodity codes are rejected');
select throws_ok($$ select public.admin_upsert_commodity('x_crop', 'nope', '{"en":"X"}', 'kg', 10) $$, '22023', null,
  'unknown categories are rejected');
select isnt((select public.admin_upsert_commodity('test_crop', 'vegetable', '{"en":"Test crop","ta":"சோதனை"}', 'kg', 5, true)), null,
  'MFA admin can add a crop with translations');
select lives_ok($$ select public.admin_upsert_commodity('test_crop', 'vegetable', '{"en":"Test crop"}', 'kg', 5, false) $$,
  'MFA admin can deactivate a crop');
select tests.as_owner();
select is((select count(*)::int from public.audit_logs where action = 'commodity.upsert'), 2, 'catalogue changes are audited');

select tests.as_user('33333333-0000-4000-8000-0000000000fa');
select throws_like($$ insert into public.harvest_listings (farmer_id, commodity_id, title, unit, total_quantity, min_price_paise_per_unit, available_until, state, district, status)
  values ('33333333-0000-4000-8000-0000000000fa', (select id from public.commodities where code = 'test_crop'), 'Inactive crop', 'kg', 10, 1000, current_date + 5, 'MP', 'Sehore', 'published') $$,
  '%not active%', 'listings cannot use an inactive commodity');

-- ---------------------------------------------------------------- ten languages
select lives_ok($$ update public.profiles set preferred_language = 'ta' where id = '33333333-0000-4000-8000-0000000000fa' $$,
  'user can choose Tamil');
select is((select preferred_language from public.profiles where id = '33333333-0000-4000-8000-0000000000fa'), 'ta', 'Tamil preference is stored');
select throws_ok($$ update public.profiles set preferred_language = 'xx' where id = '33333333-0000-4000-8000-0000000000fa' $$,
  '23514', null, 'unsupported language codes are rejected');
select tests.as_owner();
select is((select preferred_language from public.profiles where id = '33333333-0000-4000-8000-00000000006c'), 'ml',
  'signup metadata language (Malayalam) is honoured');
select is((select preferred_language from public.profiles where id = '33333333-0000-4000-8000-00000000007a'), 'en',
  'unknown signup language falls back to English');

-- ---------------------------------------------------------------- trade relationships
select tests.as_user('33333333-0000-4000-8000-0000000000fa');
select throws_ok($$ insert into public.trade_contacts (owner_id, counterparty_id, kind) values ('33333333-0000-4000-8000-0000000000fb', '33333333-0000-4000-8000-0000000000ba', 'client') $$,
  '42501', null, 'owner_id cannot be supplied by the client');
select lives_ok($$ insert into public.trade_contacts (counterparty_id, kind, private_note, is_favourite) values ('33333333-0000-4000-8000-0000000000ba', 'client', 'Pays on time', true) $$,
  'farmer can save a buyer as a client');
select is((select owner_id from public.trade_contacts where counterparty_id = '33333333-0000-4000-8000-0000000000ba'), '33333333-0000-4000-8000-0000000000fa'::uuid,
  'owner_id is forced to the caller');
select throws_ok($$ insert into public.trade_contacts (counterparty_id, kind) values ('33333333-0000-4000-8000-0000000000fa', 'client') $$,
  '23514', null, 'cannot save yourself as a contact');
select throws_ok($$ insert into public.trade_contacts (counterparty_id, kind, private_note) values ('33333333-0000-4000-8000-0000000000bb', 'client', repeat('x', 2001)) $$,
  '23514', null, 'private notes are length-limited');
select is((select stage from public.list_trade_contacts('client') where counterparty_id = '33333333-0000-4000-8000-0000000000ba'), 'saved',
  'saved contact without trading history has stage saved');
select throws_ok($$ select * from public.list_trade_contacts('everyone') $$, '22023', null, 'invalid relationship kind is rejected');

select tests.as_user('33333333-0000-4000-8000-0000000000fb');
select is_empty($$ select * from public.trade_contacts $$, 'another user cannot see private contacts or notes');
update public.trade_contacts set private_note = 'tampered';
select is_empty($$ select * from public.list_trade_contacts('client') $$, 'another farmer has no derived clients');
select tests.as_owner();
select is((select private_note from public.trade_contacts where counterparty_id = '33333333-0000-4000-8000-0000000000ba'), 'Pays on time',
  'another user cannot modify private notes');
select tests.as_anon();
select throws_ok($$ select * from public.trade_contacts $$, '42501', null, 'anon has no grant on trade contacts');
select throws_ok($$ select * from public.list_trade_contacts('client') $$, '42501', null, 'anon cannot list relationships');

-- listing + offer + order to drive derived stages and notifications
select tests.as_user('33333333-0000-4000-8000-0000000000fa');
insert into public.harvest_listings (id, farmer_id, commodity_id, title, grade, unit, total_quantity, min_price_paise_per_unit,
  available_until, state, district, approx_lat, approx_lng, status)
values ('44444444-0000-4000-8000-000000000001', '33333333-0000-4000-8000-0000000000fa', (select id from public.commodities where code = 'rice'),
  'Test rice', 'A', 'quintal', 40, 300000, current_date + 20, 'MP', 'Sehore', 23.1, 77.1, 'published');
insert into public.notification_preferences (in_app_offers, email_enabled) values (false, false);
select throws_ok($$ insert into public.notification_preferences (user_id, in_app_offers) values ('33333333-0000-4000-8000-0000000000fb', false) $$,
  '42501', null, 'cannot write notification preferences for another user');

create temp table t2 (k text primary key, id uuid) on commit drop;
grant all on t2 to authenticated;
select tests.as_user('33333333-0000-4000-8000-0000000000ba');
insert into t2 values ('ba', (public.submit_offer('44444444-0000-4000-8000-000000000001', 10, 310000)).id);
select tests.as_owner();
select is((select count(*)::int from public.notifications where recipient_id = '33333333-0000-4000-8000-0000000000fa' and type = 'offer_received'), 0,
  'disabled optional category (offers) suppresses the in-app notification');
update public.notification_preferences set in_app_offers = true, email_enabled = true where user_id = '33333333-0000-4000-8000-0000000000fa';

select tests.as_user('33333333-0000-4000-8000-0000000000bb');
insert into t2 values ('bb', (public.submit_offer('44444444-0000-4000-8000-000000000001', 5, 305000)).id);
select tests.as_owner();
select is((select count(*)::int from public.notifications where recipient_id = '33333333-0000-4000-8000-0000000000fa' and type = 'offer_received'), 1,
  're-enabled category delivers the notification');
select is((select category from public.notifications where recipient_id = '33333333-0000-4000-8000-0000000000fa' and type = 'offer_received'), 'offers',
  'notification category is derived server-side');
select is((select count(*)::int from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
  where n.recipient_id = '33333333-0000-4000-8000-0000000000fa' and d.channel = 'in_app' and d.status = 'delivered'), 1, 'in-app delivery is recorded');
select is((select d.status from public.notification_deliveries d join public.notifications n on n.id = d.notification_id
  where n.recipient_id = '33333333-0000-4000-8000-0000000000fa' and d.channel = 'email'), 'not_configured',
  'email opt-in is recorded honestly as not_configured until SMTP exists');
select app_private.notify('33333333-0000-4000-8000-0000000000fa', 'security', 'Same event', null, null, '{"dedupe_key":"evt-1"}');
select app_private.notify('33333333-0000-4000-8000-0000000000fa', 'security', 'Same event', null, null, '{"dedupe_key":"evt-1"}');
select is((select count(*)::int from public.notifications where recipient_id = '33333333-0000-4000-8000-0000000000fa' and dedupe_key = 'evt-1'), 1,
  'duplicate events with the same dedupe key create one notification');
update public.notification_preferences set in_app_offers = false where user_id = '33333333-0000-4000-8000-0000000000fa';
select app_private.notify('33333333-0000-4000-8000-0000000000fa', 'order_update', 'Order moved', null, null, '{}');
select is((select count(*)::int from public.notifications where recipient_id = '33333333-0000-4000-8000-0000000000fa' and type = 'order_update'), 1,
  'mandatory categories (orders) ignore optional preferences');

select tests.as_user('33333333-0000-4000-8000-0000000000fa');
select is((select stage from public.list_trade_contacts('client') where counterparty_id = '33333333-0000-4000-8000-0000000000bb'), 'enquiry',
  'buyer with an open offer becomes an enquiry');
insert into t2 values ('order', (public.accept_offer((select id from t2 where k = 'ba'), 'rel-accept-key-01') ->> 'order_id')::uuid);
select is((select stage from public.list_trade_contacts('client') where counterparty_id = '33333333-0000-4000-8000-0000000000ba'), 'active',
  'buyer with a live order becomes active');
select is((select is_favourite from public.list_trade_contacts('client') where counterparty_id = '33333333-0000-4000-8000-0000000000ba'), true,
  'favourite flag is preserved in the derived list');
select tests.as_user('33333333-0000-4000-8000-0000000000ba');
select is((select stage from public.list_trade_contacts('supplier') where counterparty_id = '33333333-0000-4000-8000-0000000000fa'), 'active',
  'buyer sees the farmer as an active supplier');
select is((select private_note from public.list_trade_contacts('supplier') where counterparty_id = '33333333-0000-4000-8000-0000000000fa'), null,
  'farmer private notes never leak to the counterparty');
select tests.as_owner();
update public.orders set status = 'completed' where id = (select id from t2 where k = 'order');
select tests.as_user('33333333-0000-4000-8000-0000000000fa');
select is((select stage from public.list_trade_contacts('client') where counterparty_id = '33333333-0000-4000-8000-0000000000ba'), 'existing_client',
  'one completed order makes an existing client');

-- ---------------------------------------------------------------- notification archive/delete
select throws_ok($$ update public.notifications set title = 'forged' $$, '42501', null, 'notification content cannot be edited by the recipient');
select throws_ok($$ insert into public.notifications (recipient_id, type, title) values ('33333333-0000-4000-8000-0000000000fa', 'security', 'fake') $$,
  '42501', null, 'users cannot create notifications directly');
insert into t2 select 'n1', id from public.notifications where dedupe_key = 'evt-1';
select tests.as_user('33333333-0000-4000-8000-0000000000fb');
select is(public.archive_notifications(array(select id from t2 where k = 'n1')), 0, 'another user cannot archive my notifications');
select tests.as_user('33333333-0000-4000-8000-0000000000fa');
select is(public.archive_notifications(array(select id from public.notifications where dedupe_key = 'evt-1')), 1, 'recipient can archive own notification');
select isnt((select archived_at from public.notifications where dedupe_key = 'evt-1'), null, 'archived_at is set');
select throws_ok($$ select public.archive_notifications('{}'::uuid[]) $$, '22023', null, 'archive requires at least one id');
select lives_ok($$ delete from public.notifications where dedupe_key = 'evt-1' $$, 'recipient can delete own notification');
select is((select count(*)::int from public.notifications where dedupe_key = 'evt-1'), 0, 'notification deleted');

-- ---------------------------------------------------------------- saved searches
select lives_ok($$ insert into public.saved_searches (scope, name, filters) values ('marketplace', 'Wheat near Sehore', '{"commodity":"wheat","district":"Sehore"}') $$,
  'user can save a marketplace search');
select throws_ok($$ insert into public.saved_searches (scope, name, filters) values ('marketplace', 'Bad', '[1,2]') $$, '23514', null,
  'filters must be a JSON object');
select throws_ok($$ insert into public.saved_searches (scope, name, filters) values ('marketplace', 'Huge', jsonb_build_object('q', repeat('x', 5000))) $$,
  '23514', null, 'oversized filters are rejected');
select throws_ok($$ insert into public.saved_searches (owner_id, scope, name, filters) values ('33333333-0000-4000-8000-0000000000fb', 'marketplace', 'x', '{}') $$,
  '42501', null, 'cannot save a search for someone else');
select tests.as_user('33333333-0000-4000-8000-0000000000fb');
select is_empty($$ select * from public.saved_searches $$, 'saved searches are private');

-- ---------------------------------------------------------------- listing expiry + private job
select throws_ok($$ select public.expire_stale_listings() $$, '42501', null, 'non-admin cannot run listing expiry');
select throws_ok($$ select app_private.expire_stale_listings_job() $$, '42501', null, 'private expiry job is not executable from the API');
select tests.as_user('33333333-0000-4000-8000-0000000000ad', 'aal2');
select lives_ok($$ select public.expire_stale_listings() $$, 'MFA admin can run listing expiry');

-- ---------------------------------------------------------------- seed sellers (directive cases 5, 15; acceptance N/O)
select tests.as_user('33333333-0000-4000-8000-0000000000ca');
insert into public.seed_products (seller_id, commodity_id, variety_name, brand, pack_size, pack_unit, price_paise, season, delivery_states, status)
values ('33333333-0000-4000-8000-0000000000ca', (select id from public.commodities where code = 'potato'),
  'Kufri Jyoti', 'Test Seeds', 25, 'kg', 120000, 'rabi', '{MP}', 'active');
select lives_ok($$ select public.set_seed_stock((select id from public.seed_products where brand = 'Test Seeds'), 50) $$, 'seller sets stock on own product');
select tests.as_user('33333333-0000-4000-8000-0000000000cb');
select throws_ok($$ select public.set_seed_stock((select id from public.seed_products where brand = 'Test Seeds'), 0) $$, 'P0002', null, 'another seller cannot change my stock');
update public.seed_products set price_paise = 1 where id = (select id from public.seed_products where brand = 'Test Seeds');
select throws_ok($$ insert into public.seed_products (seller_id, commodity_id, variety_name, brand, pack_size, pack_unit, price_paise, season)
  values ('33333333-0000-4000-8000-0000000000ca', 1, 'Fake', 'Fake', 1, 'kg', 100, 'all') $$, '42501', null, 'cannot create a product in another seller''s name');
select tests.as_owner();
select is((select price_paise from public.seed_products where id = (select id from public.seed_products where brand = 'Test Seeds')), 120000::bigint, 'another seller cannot edit my product price');
create temp table t3 (k text primary key, v jsonb) on commit drop;
grant all on t3 to authenticated;
insert into t3 select 'listing_before', to_jsonb(h) from public.harvest_listings h where id = '44444444-0000-4000-8000-000000000001';
select tests.as_user('33333333-0000-4000-8000-0000000000bb');
insert into t3 values ('order', public.place_seed_order((select id from public.seed_products where brand = 'Test Seeds'), 4, 'MP', 'Sehore', 'Test farm road', 'seed-order-key-001'));
select is((select available_packs from public.seed_inventory where product_id = (select id from public.seed_products where brand = 'Test Seeds')), 46, 'seed order reserves seed stock');
select tests.as_user('33333333-0000-4000-8000-0000000000cb');
select throws_ok(format($$ select public.transition_seed_order(%L, 'confirmed') $$, (select v ->> 'seed_order_id' from t3 where k = 'order')), '42501', null,
  'another seller cannot act on my seed order');
select tests.as_user('33333333-0000-4000-8000-0000000000bb');
select throws_like(format($$ select public.transition_seed_order(%L, 'confirmed') $$, (select v ->> 'seed_order_id' from t3 where k = 'order')), '%illegal transition%',
  'buyer cannot confirm on the seller''s behalf');
select tests.as_user('33333333-0000-4000-8000-0000000000ca');
select lives_ok(format($$ select public.transition_seed_order(%L, 'confirmed'); select public.transition_seed_order(%L, 'packed'); select public.transition_seed_order(%L, 'dispatched') $$,
  (select v ->> 'seed_order_id' from t3 where k = 'order'), (select v ->> 'seed_order_id' from t3 where k = 'order'), (select v ->> 'seed_order_id' from t3 where k = 'order')),
  'seller confirms, packs and dispatches');
select tests.as_owner();
select is((select to_jsonb(h) - 'updated_at' from public.harvest_listings h where id = '44444444-0000-4000-8000-000000000001'),
  (select v - 'updated_at' from t3 where k = 'listing_before'), 'seed orders never touch harvest inventory');

select * from finish();
rollback;
