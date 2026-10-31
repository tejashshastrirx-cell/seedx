-- pgTAP security + integrity suite. Runs inside one transaction and rolls back.
-- Users: FA/FB farmers, BA/BB buyers, LG logistics, AD admin, UV unverified, SS seed seller.
begin;
set search_path = public, extensions;
select plan(68);

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

-- ---------------------------------------------------------------- fixtures (as owner)
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-0000-4000-8000-0000000000fa', 'fa@test.example', now()),
  ('11111111-0000-4000-8000-0000000000fb', 'fb@test.example', now()),
  ('11111111-0000-4000-8000-0000000000ba', 'ba@test.example', now()),
  ('11111111-0000-4000-8000-0000000000bb', 'bb@test.example', now()),
  ('11111111-0000-4000-8000-00000000001a', 'lg@test.example', now()),
  ('11111111-0000-4000-8000-0000000000ad', 'ad@test.example', now()),
  ('11111111-0000-4000-8000-0000000000ee', 'uv@test.example', null),
  ('11111111-0000-4000-8000-0000000000cc', 'ss@test.example', now());
insert into public.user_roles (user_id, role, status) values
  ('11111111-0000-4000-8000-0000000000fa', 'farmer', 'active'),
  ('11111111-0000-4000-8000-0000000000fb', 'farmer', 'active'),
  ('11111111-0000-4000-8000-0000000000ba', 'buyer', 'active'),
  ('11111111-0000-4000-8000-0000000000bb', 'buyer', 'active'),
  ('11111111-0000-4000-8000-00000000001a', 'logistics', 'active'),
  ('11111111-0000-4000-8000-0000000000ad', 'admin', 'active'),
  ('11111111-0000-4000-8000-0000000000cc', 'seed_seller', 'active'),
  ('11111111-0000-4000-8000-0000000000ee', 'farmer', 'active');  -- role exists but email is unverified

select is((select count(*)::int from public.profiles where id in ('11111111-0000-4000-8000-0000000000fa', '11111111-0000-4000-8000-0000000000ee')), 2,
  'auth signup trigger creates profiles');

-- ---------------------------------------------------------------- identity & roles
select tests.as_user('11111111-0000-4000-8000-0000000000ba');
select throws_ok($$ insert into public.user_roles (user_id, role, status) values ('11111111-0000-4000-8000-0000000000ba', 'admin', 'active') $$,
  '42501', null, 'user cannot insert a role grant directly');
select throws_ok($$ update public.user_roles set status = 'active', role = 'admin' where user_id = '11111111-0000-4000-8000-0000000000ba' $$,
  '42501', null, 'user cannot update own role row');
select throws_like($$ select public.request_role('admin') $$, '%cannot be requested%', 'admin role is not requestable');
select throws_like($$ select public.request_role('support') $$, '%cannot be requested%', 'support role is not requestable');
select is((public.request_role('seed_seller')).status, 'requested', 'seed_seller request waits for admin review');
select is((public.request_role('farmer')).status, 'active', 'farmer role is self-service once verified');
select lives_ok($$ update public.profiles set display_name = 'hacked' where id = '11111111-0000-4000-8000-0000000000fa' $$,
  'update on another profile is silently filtered by RLS');
select tests.as_owner();
select isnt((select display_name from public.profiles where id = '11111111-0000-4000-8000-0000000000fa'), 'hacked', 'other profile unchanged');

select tests.as_user('11111111-0000-4000-8000-0000000000ee');
select throws_like($$ select public.request_role('buyer') $$, '%email verification required%', 'unverified user cannot request roles');
select throws_ok($$ insert into public.harvest_listings (farmer_id, commodity_id, title, unit, total_quantity, available_until, state, district, status)
  values ('11111111-0000-4000-8000-0000000000ee', 1, 'Unverified listing', 'quintal', 5, current_date + 5, 'MP', 'Bhopal', 'published') $$,
  '42501', null, 'unverified user cannot create a listing even with a farmer role');

select tests.as_user('11111111-0000-4000-8000-0000000000fa');
select is_empty($$ select * from public.profile_private where id <> '11111111-0000-4000-8000-0000000000fa' $$, 'user sees only own private profile');

select tests.as_anon();
select throws_ok($$ select * from public.profile_private $$, '42501', null, 'anon has no grant on private profiles');
select throws_ok($$ select * from public.orders $$, '42501', null, 'anon has no grant on orders');
select throws_ok($$ select * from public.audit_logs $$, '42501', null, 'anon has no grant on audit logs');
select isnt_empty($$ select * from public.commodities $$, 'anon can read the commodity catalogue');

-- ---------------------------------------------------------------- listings
select tests.as_user('11111111-0000-4000-8000-0000000000fa');
insert into public.harvest_listings (id, farmer_id, commodity_id, title, grade, unit, total_quantity, min_price_paise_per_unit,
  available_until, state, district, approx_lat, approx_lng, status, seller_handling_paise_per_unit)
values ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000fa', (select id from public.commodities where code = 'wheat'),
  'Test wheat', 'A', 'quintal', 30, 250000, current_date + 20, 'MP', 'Sehore', 23.123456, 77.087654, 'published', 1000);
select is((select available_quantity from public.harvest_listings where id = '22222222-0000-4000-8000-000000000001'), 30.000::numeric(14,3),
  'available quantity is server-initialised from total');
select is((select approx_lat from public.harvest_listings where id = '22222222-0000-4000-8000-000000000001'), 23.120::numeric(6,3),
  'public coordinates are coarsened');
select throws_ok($$ update public.harvest_listings set available_quantity = 999 where id = '22222222-0000-4000-8000-000000000001' $$,
  '42501', null, 'owner cannot write inventory columns directly');
select throws_ok($$ insert into public.harvest_listings (farmer_id, commodity_id, title, unit, total_quantity, available_until, state, district)
  values ('11111111-0000-4000-8000-0000000000fb', 1, 'Spoofed owner', 'quintal', 5, current_date + 5, 'MP', 'Bhopal') $$,
  '42501', null, 'cannot create a listing for another farmer');
insert into public.harvest_pickup_locations (listing_id, farmer_id, address_line, lat, lng) values
  ('22222222-0000-4000-8000-000000000001', '11111111-0000-4000-8000-0000000000fa', 'Private gate 7', 23.1234, 77.0876);

select tests.as_user('11111111-0000-4000-8000-0000000000fb');
update public.harvest_listings set title = 'stolen' where id = '22222222-0000-4000-8000-000000000001';
select tests.as_owner();
select is((select title from public.harvest_listings where id = '22222222-0000-4000-8000-000000000001'), 'Test wheat',
  'another farmer cannot edit the listing (RLS filters the update)');

select tests.as_user('11111111-0000-4000-8000-0000000000ba');
select is_empty($$ select * from public.harvest_pickup_locations $$, 'buyer without an order cannot see exact pickup location');
select isnt_empty($$ select * from public.harvest_listings where id = '22222222-0000-4000-8000-000000000001' $$, 'published listing is public');

-- ---------------------------------------------------------------- offers
select tests.as_user('11111111-0000-4000-8000-0000000000fa');
select throws_like($$ select public.submit_offer('22222222-0000-4000-8000-000000000001', 1, 260000) $$, '%role buyer required%',
  'a farmer without buyer role cannot submit offers');

select tests.as_user('11111111-0000-4000-8000-0000000000ba');
select throws_like($$ select public.submit_offer('22222222-0000-4000-8000-000000000001', 1, 100000) $$, '%below the farmer%',
  'offer below the price floor is rejected');
select throws_like($$ select public.submit_offer('22222222-0000-4000-8000-000000000001', 31, 260000) $$, '%exceeds available%',
  'offer above available stock is rejected');
create temp table t_offers (k text primary key, id uuid) on commit drop;
grant all on t_offers to authenticated;
insert into t_offers values ('ba1', (public.submit_offer('22222222-0000-4000-8000-000000000001', 20, 260000, 'buyer_pays_transport', 'BA first', null, 72, 150000, 'test estimate')).id);
select tests.as_user('11111111-0000-4000-8000-0000000000bb');
insert into t_offers values ('bb1', (public.submit_offer('22222222-0000-4000-8000-000000000001', 20, 265000)).id);
select is((select count(*)::int from public.offers), 1, 'buyer B sees only their own offer');

select tests.as_user('11111111-0000-4000-8000-0000000000ba');
select throws_like(format($$ select public.accept_offer(%L, 'key-ba-self-accept') $$, (select id from t_offers where k = 'ba1')),
  '%proposer cannot accept%', 'buyer cannot accept their own offer');
select tests.as_user('11111111-0000-4000-8000-0000000000fb');
select throws_like(format($$ select public.accept_offer(%L, 'key-fb-foreign-xx') $$, (select id from t_offers where k = 'ba1')),
  '%not a party%', 'another farmer cannot accept the offer');
select tests.as_user('11111111-0000-4000-8000-0000000000ee');
select throws_like(format($$ select public.accept_offer(%L, 'key-unverified-1') $$, (select id from t_offers where k = 'ba1')),
  '%email verification required%', 'unverified user cannot accept');

-- ---------------------------------------------------------------- atomic acceptance + idempotency + oversell
select tests.as_user('11111111-0000-4000-8000-0000000000fa');
create temp table t_res (k text primary key, r jsonb) on commit drop;
grant all on t_res to authenticated;
insert into t_res values ('first', public.accept_offer((select id from t_offers where k = 'ba1'), 'accept-ba1-key-0001'));
select is((select (r ->> 'ok')::boolean from t_res where k = 'first'), true, 'farmer accepts offer');
select is((select available_quantity from public.harvest_listings where id = '22222222-0000-4000-8000-000000000001'), 10.000::numeric(14,3),
  'stock moved from available to reserved');
select is((select reserved_quantity from public.harvest_listings where id = '22222222-0000-4000-8000-000000000001'), 20.000::numeric(14,3),
  'reserved quantity recorded');
select is((select status from public.harvest_listings where id = '22222222-0000-4000-8000-000000000001'), 'partially_reserved',
  'listing status derived from inventory');
insert into t_res values ('replay', public.accept_offer((select id from t_offers where k = 'ba1'), 'accept-ba1-key-0001'));
select is((select r ->> 'order_id' from t_res where k = 'replay'), (select r ->> 'order_id' from t_res where k = 'first'),
  'replaying the idempotency key returns the original order');
select is((select (r ->> 'replayed')::boolean from t_res where k = 'replay'), true, 'replay is flagged');
select is((select count(*)::int from public.orders where listing_id = '22222222-0000-4000-8000-000000000001'), 1, 'replay created no duplicate order');
select throws_like(format($$ select public.accept_offer(%L, 'accept-ba1-key-0001') $$, (select id from t_offers where k = 'bb1')),
  '%idempotency key reused%', 'reusing a key with a different payload is rejected');
select is((select status from public.offers where id = (select id from t_offers where k = 'bb1')), 'rejected',
  'competing offer that no longer fits stock was closed automatically');
select throws_like(format($$ select public.accept_offer(%L, 'accept-bb1-key-0002') $$, (select id from t_offers where k = 'bb1')),
  '%offer is rejected%', 'second buyer cannot oversell the reserved stock');
select is((select sum(amount_paise)::bigint from public.order_cost_lines where payer = 'farmer'), 20000::bigint,
  'seller handling cost line = 20 q x Rs 10 = Rs 200');
select is((select gross_paise from public.orders where listing_id = '22222222-0000-4000-8000-000000000001'), 5200000::bigint,
  'server-calculated gross = 20 q x Rs 2,600 = Rs 52,000');

-- ---------------------------------------------------------------- order visibility & transitions
select tests.as_user('11111111-0000-4000-8000-0000000000bb');
select is_empty($$ select * from public.orders $$, 'unrelated buyer cannot see the order');
select tests.as_user('11111111-0000-4000-8000-00000000001a');
select is_empty($$ select * from public.orders $$, 'unassigned logistics user cannot read orders');
select is_empty($$ select * from public.logistics_jobs() $$, 'unassigned logistics user has no jobs');

select tests.as_user('11111111-0000-4000-8000-0000000000ba');
select isnt_empty($$ select * from public.harvest_pickup_locations where listing_id = '22222222-0000-4000-8000-000000000001' $$,
  'buyer with a confirmed order can see the pickup location');
select throws_like(format($$ select public.transition_order(%L, 'pickup_scheduled', null, current_date + 1) $$, (select r ->> 'order_id' from t_res where k = 'first')),
  '%illegal transition%', 'buyer cannot schedule pickup');

select tests.as_user('11111111-0000-4000-8000-0000000000fa');
select lives_ok(format($$ select public.assign_logistics(%L, '11111111-0000-4000-8000-00000000001a') $$, (select r ->> 'order_id' from t_res where k = 'first')),
  'farmer assigns approved logistics partner');
select throws_like(format($$ select public.assign_logistics(%L, '11111111-0000-4000-8000-0000000000bb') $$, (select r ->> 'order_id' from t_res where k = 'first')),
  '%not an approved logistics%', 'cannot assign a non-logistics user');

select tests.as_user('11111111-0000-4000-8000-00000000001a');
select is((select pickup_address from public.logistics_jobs() limit 1), null, 'exact address hidden before pickup is scheduled');
select is_empty($$ select * from public.orders $$, 'logistics still cannot read commercial order rows');
select lives_ok(format($$ select public.transition_order(%L, 'pickup_scheduled', 'Truck booked', current_date + 1) $$, (select r ->> 'order_id' from t_res where k = 'first')),
  'assigned logistics schedules pickup');
select is((select pickup_address from public.logistics_jobs() limit 1), 'Private gate 7', 'exact address revealed once the job is active');
select lives_ok(format($$ select public.transition_order(%L, 'in_transit') $$, (select r ->> 'order_id' from t_res where k = 'first')), 'logistics marks in transit');
select throws_like(format($$ select public.transition_order(%L, 'delivered') $$, (select r ->> 'order_id' from t_res where k = 'first')),
  '%illegal transition%', 'logistics cannot self-confirm delivery');
select tests.as_user('11111111-0000-4000-8000-0000000000ba');
select lives_ok(format($$ select public.transition_order(%L, 'delivered', 'Received in full') $$, (select r ->> 'order_id' from t_res where k = 'first')),
  'buyer confirms receipt');
select is((select sold_quantity from public.harvest_listings where id = '22222222-0000-4000-8000-000000000001'), 20.000::numeric(14,3),
  'delivery moves reserved stock to sold');
select is((select count(*)::int from public.order_events where order_id = (select (r ->> 'order_id')::uuid from t_res where k = 'first')), 5,
  'append-only order timeline recorded every step');
select throws_ok($$ delete from public.order_events $$, '42501', null, 'order history cannot be deleted by a party');

-- ---------------------------------------------------------------- notifications
select tests.as_user('11111111-0000-4000-8000-0000000000bb');
select is((select count(*)::int from public.notifications where recipient_id <> '11111111-0000-4000-8000-0000000000bb'), 0,
  'user B cannot read user A notifications');

-- ---------------------------------------------------------------- admin + MFA
select tests.as_user('11111111-0000-4000-8000-0000000000ba');
select is_empty($$ select * from public.audit_logs $$, 'normal user cannot read audit logs');
select throws_like($$ select public.admin_overview() $$, '%admin with MFA%', 'non-admin cannot call admin endpoint');
select tests.as_user('11111111-0000-4000-8000-0000000000ad', 'aal1');
select throws_like($$ select public.admin_overview() $$, '%admin with MFA%', 'admin without MFA (aal1) is denied');
select tests.as_user('11111111-0000-4000-8000-0000000000ad', 'aal2');
select isnt_empty($$ select public.admin_overview() $$, 'admin with aal2 can read the overview');
select isnt_empty($$ select * from public.audit_logs $$, 'admin with aal2 can read audit logs');

-- ---------------------------------------------------------------- storage paths
select tests.as_user('11111111-0000-4000-8000-0000000000fb');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('harvest-images', '11111111-0000-4000-8000-0000000000fa/22222222-0000-4000-8000-000000000001/x.jpg') $$,
  '42501', null, 'user cannot upload into another user''s folder');
select tests.as_user('11111111-0000-4000-8000-0000000000fa');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('private-user-documents', '11111111-0000-4000-8000-0000000000fa/doc/id.pdf') $$,
  'owner can upload a private document');
select tests.as_user('11111111-0000-4000-8000-0000000000fb');
select is_empty($$ select * from storage.objects where bucket_id = 'private-user-documents' $$, 'another user cannot list or read private documents');

select * from finish();
rollback;
