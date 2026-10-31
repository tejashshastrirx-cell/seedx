-- SEED X synthetic DEMO data. Every record here is illustrative (is_demo = true / is_sample = true),
-- uses reserved example.com addresses and must never be presented as real traction.
-- The demo password is NOT stored in Git: set it for the session before running, e.g.
--   set seedx.demo_password = '<value from .env.local E2E_DEMO_PASSWORD>';
-- If it is not set, demo accounts are skipped.

do $$
declare
  v_pw text := nullif(current_setting('seedx.demo_password', true), '');
  u record;
begin
  if v_pw is null then
    raise notice 'seedx.demo_password not set - skipping demo accounts and demo records';
    return;
  end if;
  for u in select * from (values
    ('d0000000-0000-4000-8000-000000000001'::uuid, 'dhruv.farmer@seedx.example', 'Dhruv (demo farmer)', 'hi', 'Madhya Pradesh', 'Sehore', array['farmer']),
    ('d0000000-0000-4000-8000-000000000002'::uuid, 'kavita.farmer@seedx.example', 'Kavita (demo farmer)', 'hi', 'Madhya Pradesh', 'Vidisha', array['farmer']),
    ('d0000000-0000-4000-8000-000000000003'::uuid, 'raghav.farmer@seedx.example', 'Raghav (demo farmer)', 'en', 'Madhya Pradesh', 'Raisen', array['farmer']),
    ('d0000000-0000-4000-8000-000000000004'::uuid, 'hostel.buyer@seedx.example', 'Annapurna Hostel Mess (demo)', 'en', 'Madhya Pradesh', 'Bhopal', array['buyer']),
    ('d0000000-0000-4000-8000-000000000005'::uuid, 'restaurant.buyer@seedx.example', 'Green Leaf Restaurant (demo)', 'en', 'Madhya Pradesh', 'Bhopal', array['buyer']),
    ('d0000000-0000-4000-8000-000000000006'::uuid, 'seeds.seller@seedx.example', 'Kisan Beej Bhandar (demo)', 'hi', 'Madhya Pradesh', 'Bhopal', array['seed_seller', 'farmer']),
    ('d0000000-0000-4000-8000-000000000007'::uuid, 'transport.partner@seedx.example', 'Narmada Transport (demo)', 'en', 'Madhya Pradesh', 'Bhopal', array['logistics']),
    ('d0000000-0000-4000-8000-000000000008'::uuid, 'admin.demo@seedx.example', 'Demo Admin', 'en', 'Madhya Pradesh', 'Bhopal', array['admin'])
  ) as t(id, email, name, lang, state, district, roles)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, extensions.crypt(v_pw, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.name, 'preferred_language', u.lang),
      now(), now(), '', '', '', '')
    on conflict (id) do nothing;
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (u.id, u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now())
    on conflict do nothing;
    update public.profiles set state = u.state, district = u.district, onboarding_completed = true, is_demo = true where id = u.id;
    insert into public.user_roles (user_id, role, status, reviewed_at, review_note)
    select u.id, r, 'active', now(), 'demo seed' from unnest(u.roles) r
    on conflict (user_id, role) do nothing;
  end loop;

  -- Harvest listings (Bhopal region). Approximate public coordinates only.
  insert into public.harvest_listings (id, farmer_id, commodity_id, variety_id, title, grade, quality_notes, unit, total_quantity,
    min_price_paise_per_unit, asking_price_paise_per_unit, seller_handling_paise_per_unit, harvest_date, available_from, available_until,
    state, district, locality, approx_lat, approx_lng, status, is_demo)
  select x.id, x.farmer, c.id, (select v.id from public.crop_varieties v where v.commodity_id = c.id and v.name_en = x.variety),
         x.title, x.grade, x.notes, x.unit, x.qty, x.min_p, x.ask_p, x.handling, current_date - (case when x.code = 'tomato' then 1 else 10 end), current_date, current_date + x.days,
         'Madhya Pradesh', x.district, x.locality, x.lat, x.lng, 'published', true
    from (values
      ('a0000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'wheat', 'Sharbati', 'Sharbati wheat, cleaned and bagged', 'A', 'Moisture under 12%, 50 kg bags', 'quintal', 30.0, 260000::bigint, 285000::bigint, 2000::bigint, 30, 'Sehore', 'Ashta road', 23.20, 77.08),
      ('a0000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'wheat', 'Sharbati', 'Sharbati wheat - Vidisha', 'A', 'Sun-dried, graded', 'quintal', 22.0, 255000::bigint, 280000::bigint, 2000::bigint, 30, 'Vidisha', 'Gyaraspur', 23.52, 77.81),
      ('a0000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'wheat', 'Sharbati', 'Sharbati wheat - Raisen', 'B', 'Minor broken grains', 'quintal', 15.0, 245000::bigint, 270000::bigint, 0::bigint, 30, 'Raisen', 'Obaidullaganj', 23.33, 77.79),
      ('a0000000-0000-4000-8000-000000000004'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid, 'tomato', 'Hybrid', 'Fresh hybrid tomatoes', 'A', 'Picked at turning stage, 25 kg crates', 'kg', 900.0, 1800::bigint, 2200::bigint, 100::bigint, 4, 'Sehore', 'Ichhawar', 23.02, 77.02),
      ('a0000000-0000-4000-8000-000000000005'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid, 'gram', 'Desi', 'Desi chana', 'A', 'Cleaned', 'quintal', 18.0, 580000::bigint, 610000::bigint, 0::bigint, 45, 'Vidisha', 'Basoda', 23.85, 77.93),
      ('a0000000-0000-4000-8000-000000000006'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid, 'onion', 'Red (Nashik)', 'Red onion', 'B', 'Medium size', 'quintal', 40.0, 140000::bigint, 165000::bigint, 0::bigint, 20, 'Raisen', 'Bareli', 22.99, 78.23)
    ) as x(id, farmer, code, variety, title, grade, notes, unit, qty, min_p, ask_p, handling, days, district, locality, lat, lng)
    join public.commodities c on c.code = x.code
  on conflict (id) do nothing;

  insert into public.harvest_pickup_locations (listing_id, farmer_id, address_line, lat, lng, contact_phone) values
    ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Demo farm gate, Ashta road, Sehore (synthetic)', 23.1987, 77.0812, '+91 90000 00001'),
    ('a0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'Demo farm, Gyaraspur, Vidisha (synthetic)', 23.5174, 77.8093, '+91 90000 00002'),
    ('a0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'Demo farm, Obaidullaganj, Raisen (synthetic)', 23.3301, 77.7912, '+91 90000 00003')
  on conflict (listing_id) do nothing;

  insert into public.demand_requests (id, buyer_id, commodity_id, variety_id, title, min_grade, quantity, unit, max_price_paise_per_unit,
    delivery_from, delivery_until, delivery_state, delivery_district, delivery_locality, approx_lat, approx_lng, max_transit_hours, buyer_type,
    visibility, status, notes, is_demo)
  select x.id, x.buyer, c.id, (select v.id from public.crop_varieties v where v.commodity_id = c.id and v.name_en = x.variety), x.title, x.grade,
         x.qty, x.unit, x.max_p, current_date + 2, current_date + x.days, 'Madhya Pradesh', 'Bhopal', x.locality, 23.26, 77.41, x.transit, x.btype,
         'public', 'open', x.notes, true
    from (values
      ('b0000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000004'::uuid, 'wheat', 'Sharbati', 'Monthly wheat for hostel mess', 'B', 35.0, 'quintal', 290000::bigint, 14, 'Kolar road', 48, 'hostel', 'Need Sharbati grade B or better, delivered to the mess store.'),
      ('b0000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000005'::uuid, 'tomato', null, 'Daily tomatoes for restaurant', 'A', 3.0, 'quintal', 250000::bigint, 5, 'MP Nagar', 12, 'restaurant', '300 kg per week, firm and ripe.')
    ) as x(id, buyer, code, variety, title, grade, qty, unit, max_p, days, locality, transit, btype, notes)
    join public.commodities c on c.code = x.code
  on conflict (id) do nothing;

  insert into public.seed_products (id, seller_id, commodity_id, variety_name, brand, pack_size, pack_unit, price_paise, season, lot_number,
    germination_percent, expiry_date, certification_ref, description, delivery_states, shipping_paise, status, is_demo)
  select x.id, 'd0000000-0000-4000-8000-000000000006', c.id, x.variety, x.brand, x.size, x.punit, x.price, x.season, x.lot, x.germ,
         current_date + 300, x.cert, x.descr, array['Madhya Pradesh'], x.ship, 'active', true
    from (values
      ('c0000000-0000-4000-8000-000000000001'::uuid, 'wheat', 'HD-2967', 'Demo Seeds Co.', 40.0, 'kg', 160000::bigint, 'rabi', 'LOT-DEMO-001', 85.0, 'DEMO-CERT-001', 'Bread wheat variety for irrigated timely sown conditions. Synthetic demo product.', 5000::bigint),
      ('c0000000-0000-4000-8000-000000000002'::uuid, 'gram', 'JG-14 (Desi)', 'Demo Seeds Co.', 20.0, 'kg', 190000::bigint, 'rabi', 'LOT-DEMO-002', 85.0, null, 'Desi chickpea. Synthetic demo product without certification reference.', 5000::bigint),
      ('c0000000-0000-4000-8000-000000000003'::uuid, 'tomato', 'Hybrid F1', 'Demo Hortiseeds', 10.0, 'g', 45000::bigint, 'all', 'LOT-DEMO-003', 90.0, 'DEMO-CERT-003', 'Hybrid tomato for nursery raising. Synthetic demo product.', 3000::bigint),
      ('c0000000-0000-4000-8000-000000000004'::uuid, 'soybean', 'JS-9560', 'Demo Seeds Co.', 30.0, 'kg', 270000::bigint, 'kharif', 'LOT-DEMO-004', 70.0, null, 'Early maturing soybean. Synthetic demo product.', 5000::bigint)
    ) as x(id, code, variety, brand, size, punit, price, season, lot, germ, cert, descr, ship)
    join public.commodities c on c.code = x.code
  on conflict (id) do nothing;
  update public.seed_inventory set available_packs = 25 where product_id in (
    'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000004')
    and available_packs = 0;

  insert into public.land_listings (owner_id, title, state, district, locality, area, area_unit, arrangement, permitted_use, water_source,
    available_from, status, is_demo)
  select 'd0000000-0000-4000-8000-000000000006', 'Irrigated plot available for rabi lease (demo)', 'Madhya Pradesh', 'Sehore', 'Ashta', 4.5, 'acre',
         'lease', 'Field crops only; no construction', 'Tube well', current_date + 7, 'published', true
   where not exists (select 1 from public.land_listings where is_demo);
end $$;

-- Clearly labelled SAMPLE mandi prices (not real market data) so the explorer can be demonstrated
-- before the OGD/AGMARKNET feed is connected with a project-owned API key.
with src as (select id from public.data_sources where code = 'seedx_sample'),
days as (select generate_series(0, 13) as d),
base as (select * from (values
  ('wheat', 'Sharbati', 'Sehore', 'Sehore', 2780), ('wheat', 'Sharbati', 'Bhopal', 'Bhopal', 2850), ('wheat', 'Lokwan', 'Vidisha', 'Vidisha', 2620),
  ('gram', 'Desi', 'Vidisha', 'Ganj Basoda', 5900), ('onion', 'Red (Nashik)', 'Bhopal', 'Bhopal', 1550), ('tomato', 'Hybrid', 'Bhopal', 'Bhopal', 1900),
  ('soybean', 'JS-9560', 'Sehore', 'Ashta', 4500)
) as b(code, variety, district, market, modal))
insert into public.market_price_observations (source_id, source_record_key, price_type, commodity_id, variety, state, district, market, observed_on,
  min_paise, max_paise, modal_paise, unit, is_sample, verification_status)
select src.id, 'sample|' || b.code || '|' || b.market || '|' || (current_date - days.d), 'mandi_wholesale', c.id, b.variety, 'Madhya Pradesh', b.district,
       b.market, current_date - days.d,
       (b.modal - 120 + ((days.d * 37) % 60)) * 100, (b.modal + 140 + ((days.d * 23) % 50)) * 100, (b.modal + ((days.d * 53) % 90) - 45) * 100,
       'quintal', true, 'verified'
  from src, days, base b join public.commodities c on c.code = b.code
on conflict (source_id, source_record_key) do nothing;
