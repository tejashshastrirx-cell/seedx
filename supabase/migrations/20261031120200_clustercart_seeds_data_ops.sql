-- SEED X 03 - ClusterCart runs, seed commerce, price data provenance, schemes, landowner,
-- moderation/support, storage buckets and realtime.

-- ---------------------------------------------------------------------------
-- ClusterCart: immutable, server-computed match runs (written by the Edge Function via service role)
-- ---------------------------------------------------------------------------
create table public.match_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  demand_id uuid references public.demand_requests (id),
  algorithm_version text not null check (char_length(algorithm_version) <= 40),
  status text not null default 'completed' check (status in ('completed', 'no_feasible_supply', 'failed')),
  recommendation text check (recommendation in ('pooled', 'separate', 'none')),
  input_snapshot jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index match_runs_creator_idx on public.match_runs (created_by, created_at desc);

create table public.match_allocations (
  id uuid primary key default gen_random_uuid(),
  match_run_id uuid not null references public.match_runs (id) on delete cascade,
  listing_id uuid not null references public.harvest_listings (id),
  farmer_id uuid not null references public.profiles (id),
  demand_id uuid references public.demand_requests (id),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit text not null check (unit in ('kg', 'quintal', 'tonne')),
  price_paise_per_unit bigint not null check (price_paise_per_unit > 0),
  transport_share_paise bigint not null default 0 check (transport_share_paise >= 0),
  offer_id uuid references public.offers (id),
  created_at timestamptz not null default now()
);
create index match_allocations_run_idx on public.match_allocations (match_run_id);
alter table public.offers add constraint offers_match_run_fk foreign key (match_run_id) references public.match_runs (id);

-- Service-role-only writer. Validates that the creator owns the demand.
create or replace function public.record_match_run(p_created_by uuid, p_demand_id uuid, p_algorithm_version text, p_status text,
  p_recommendation text, p_input jsonb, p_result jsonb, p_allocations jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; a jsonb;
begin
  if p_demand_id is not null and not exists (select 1 from public.demand_requests d where d.id = p_demand_id and d.buyer_id = p_created_by) then
    raise exception 'demand does not belong to creator' using errcode = '42501';
  end if;
  insert into public.match_runs (created_by, demand_id, algorithm_version, status, recommendation, input_snapshot, result)
  values (p_created_by, p_demand_id, p_algorithm_version, p_status, p_recommendation, p_input, p_result) returning id into v_id;
  for a in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.match_allocations (match_run_id, listing_id, farmer_id, demand_id, quantity, unit, price_paise_per_unit, transport_share_paise)
    select v_id, l.id, l.farmer_id, p_demand_id, (a ->> 'quantity')::numeric, l.unit, (a ->> 'price_paise_per_unit')::bigint,
           coalesce((a ->> 'transport_share_paise')::bigint, 0)
      from public.harvest_listings l where l.id = (a ->> 'listing_id')::uuid;
  end loop;
  return v_id;
end $$;
revoke all on function public.record_match_run(uuid, uuid, text, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_match_run(uuid, uuid, text, text, text, jsonb, jsonb, jsonb) to service_role;

-- Buyer turns a stored allocation set into individual offers (each farmer still accepts separately).
create or replace function public.send_match_offers(p_match_run_id uuid, p_delivery_terms text default 'buyer_pays_transport', p_expires_in_hours integer default 72)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_run public.match_runs;
  a public.match_allocations;
  v_offer public.offers;
  v_count integer := 0;
begin
  perform app_private.require_verified_role('buyer');
  select * into v_run from public.match_runs where id = p_match_run_id;
  if not found or v_run.created_by <> auth.uid() then raise exception 'match run not found' using errcode = 'P0002'; end if;
  if v_run.created_at < now() - interval '24 hours' then
    raise exception 'match run is older than 24 hours; run ClusterCart again' using errcode = '55000', hint = 'STALE_RUN';
  end if;
  for a in select * from public.match_allocations where match_run_id = p_match_run_id and offer_id is null for update loop
    v_offer := public.submit_offer(a.listing_id, a.quantity, a.price_paise_per_unit, p_delivery_terms,
      'ClusterCart pooled proposal', v_run.demand_id, p_expires_in_hours, a.transport_share_paise,
      'ClusterCart ' || v_run.algorithm_version || ' estimate (run ' || left(v_run.id::text, 8) || ')', v_run.id);
    update public.match_allocations set offer_id = v_offer.id where id = a.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Seed commerce
-- ---------------------------------------------------------------------------
create table public.seed_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete restrict,
  commodity_id smallint not null references public.commodities (id),
  variety_name text not null check (char_length(variety_name) between 2 and 80),
  brand text not null check (char_length(brand) between 2 and 80),
  pack_size numeric(10, 3) not null check (pack_size > 0),
  pack_unit text not null check (pack_unit in ('g', 'kg')),
  price_paise bigint not null check (price_paise > 0),
  season text not null check (season in ('kharif', 'rabi', 'zaid', 'all')),
  lot_number text check (char_length(lot_number) <= 60),
  germination_percent numeric(5, 2) check (germination_percent between 0 and 100),
  expiry_date date,
  certification_ref text check (char_length(certification_ref) <= 120),
  certification_verified_at timestamptz,
  certification_verified_note text check (char_length(certification_verified_note) <= 300),
  description text check (char_length(description) <= 1000),
  delivery_states text[] not null default '{}',
  shipping_paise bigint not null default 0 check (shipping_paise >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'delisted')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seed_products_public_idx on public.seed_products (status, commodity_id, season);
create trigger seed_products_touch before update on public.seed_products for each row execute function app_private.touch_updated_at();

create table public.seed_inventory (
  product_id uuid primary key references public.seed_products (id) on delete cascade,
  available_packs integer not null default 0 check (available_packs >= 0),
  reserved_packs integer not null default 0 check (reserved_packs >= 0),
  updated_at timestamptz not null default now()
);

create table public.seed_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'completed', 'cancelled')),
  items_total_paise bigint not null check (items_total_paise > 0),
  shipping_paise bigint not null default 0,
  total_paise bigint not null check (total_paise > 0),
  payment_method text not null default 'pay_on_delivery' check (payment_method in ('pay_on_delivery')),
  delivery_state text not null,
  delivery_district text not null,
  delivery_address text not null check (char_length(delivery_address) between 5 and 300),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index seed_orders_buyer_idx on public.seed_orders (buyer_id, created_at desc);
create index seed_orders_seller_idx on public.seed_orders (seller_id, created_at desc);

create table public.seed_order_items (
  id uuid primary key default gen_random_uuid(),
  seed_order_id uuid not null references public.seed_orders (id) on delete restrict,
  product_id uuid not null references public.seed_products (id),
  packs integer not null check (packs between 1 and 1000),
  unit_price_paise bigint not null check (unit_price_paise > 0),
  product_snapshot jsonb not null
);

create table public.seed_order_events (
  id bigint generated always as identity primary key,
  seed_order_id uuid not null references public.seed_orders (id),
  from_status text, to_status text not null, actor_id uuid, note text, created_at timestamptz not null default now()
);

create sequence public.seed_order_number_seq start 501;

-- Seller-side guard: sellers cannot self-verify certification.
create or replace function app_private.seed_product_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('app.trusted_admin_write', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and (new.certification_ref is distinct from old.certification_ref) then
    new.certification_verified_at := null;
    new.certification_verified_note := null;
  elsif tg_op = 'INSERT' then
    new.certification_verified_at := null;
    new.certification_verified_note := null;
  end if;
  return new;
end $$;
create trigger seed_products_guard before insert or update on public.seed_products
  for each row execute function app_private.seed_product_guard();

create or replace function app_private.seed_inventory_init() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.seed_inventory (product_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger seed_products_inventory after insert on public.seed_products
  for each row execute function app_private.seed_inventory_init();

create or replace function public.set_seed_stock(p_product_id uuid, p_available_packs integer)
returns public.seed_inventory language plpgsql security definer set search_path = '' as $$
declare v public.seed_inventory;
begin
  perform app_private.require_verified_role('seed_seller');
  if p_available_packs < 0 or p_available_packs > 1000000 then raise exception 'invalid stock' using errcode = '22023'; end if;
  if not exists (select 1 from public.seed_products p where p.id = p_product_id and p.seller_id = auth.uid()) then
    raise exception 'product not found' using errcode = 'P0002';
  end if;
  update public.seed_inventory set available_packs = p_available_packs, updated_at = now()
   where product_id = p_product_id returning * into v;
  perform app_private.audit('seed.stock_set', 'seed_inventory', p_product_id::text, jsonb_build_object('available_packs', p_available_packs));
  return v;
end $$;

create or replace function public.place_seed_order(p_product_id uuid, p_packs integer, p_delivery_state text, p_delivery_district text,
  p_delivery_address text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request jsonb := jsonb_build_object('product_id', p_product_id, 'packs', p_packs, 'address', p_delivery_address);
  v_prior jsonb;
  v_product public.seed_products;
  v_order public.seed_orders;
  v_items bigint;
  v_response jsonb;
begin
  perform app_private.require_verified_role(null);
  v_prior := app_private.idem_lookup('place_seed_order', p_idempotency_key, v_request);
  if v_prior is not null then return v_prior; end if;
  if p_packs is null or p_packs < 1 or p_packs > 1000 then raise exception 'packs must be 1-1000' using errcode = '22023'; end if;
  if char_length(coalesce(p_delivery_address, '')) < 5 then raise exception 'delivery address required' using errcode = '22023'; end if;

  select * into v_product from public.seed_products where id = p_product_id and status = 'active';
  if not found then raise exception 'product not available' using errcode = '55000', hint = 'PRODUCT_NOT_AVAILABLE'; end if;
  if v_product.seller_id = auth.uid() then raise exception 'cannot order your own product' using errcode = '42501'; end if;
  if cardinality(v_product.delivery_states) > 0 and not (p_delivery_state = any (v_product.delivery_states)) then
    raise exception 'seller does not deliver to %', p_delivery_state using errcode = '55000', hint = 'OUTSIDE_DELIVERY_AREA';
  end if;
  update public.seed_inventory set available_packs = available_packs - p_packs, reserved_packs = reserved_packs + p_packs, updated_at = now()
   where product_id = p_product_id and available_packs >= p_packs;
  if not found then raise exception 'insufficient stock' using errcode = '23514', hint = 'INSUFFICIENT_STOCK'; end if;

  v_items := v_product.price_paise * p_packs;
  insert into public.seed_orders (order_number, buyer_id, seller_id, items_total_paise, shipping_paise, total_paise, delivery_state,
    delivery_district, delivery_address, is_demo)
  values ('SD-' || to_char(now(), 'YYMM') || '-' || nextval('public.seed_order_number_seq'), auth.uid(), v_product.seller_id, v_items,
    v_product.shipping_paise, v_items + v_product.shipping_paise, p_delivery_state, p_delivery_district, left(p_delivery_address, 300), v_product.is_demo)
  returning * into v_order;
  insert into public.seed_order_items (seed_order_id, product_id, packs, unit_price_paise, product_snapshot)
  values (v_order.id, v_product.id, p_packs, v_product.price_paise, jsonb_build_object(
    'brand', v_product.brand, 'variety_name', v_product.variety_name, 'pack_size', v_product.pack_size, 'pack_unit', v_product.pack_unit,
    'lot_number', v_product.lot_number, 'certification_ref', v_product.certification_ref,
    'certification_verified', v_product.certification_verified_at is not null));
  insert into public.seed_order_events (seed_order_id, from_status, to_status, actor_id) values (v_order.id, null, 'pending', auth.uid());
  perform app_private.notify(v_product.seller_id, 'seed_order_update', 'New seed order ' || v_order.order_number,
    p_packs || ' x ' || v_product.brand || ' ' || v_product.variety_name, '/seeds/orders');
  v_response := jsonb_build_object('ok', true, 'seed_order_id', v_order.id, 'order_number', v_order.order_number, 'total_paise', v_order.total_paise);
  perform app_private.idem_store('place_seed_order', p_idempotency_key, v_request, v_response);
  return v_response;
end $$;

create or replace function public.transition_seed_order(p_seed_order_id uuid, p_to_status text, p_note text default null)
returns public.seed_orders language plpgsql security definer set search_path = '' as $$
declare
  v public.seed_orders;
  v_actor text;
  v_from text;
  v_allowed boolean;
begin
  perform app_private.require_verified_role(null);
  select * into v from public.seed_orders where id = p_seed_order_id for update;
  if not found then raise exception 'seed order not found' using errcode = 'P0002'; end if;
  v_actor := case when auth.uid() = v.seller_id then 'seller' when auth.uid() = v.buyer_id then 'buyer' end;
  if v_actor is null then raise exception 'not a party' using errcode = '42501'; end if;
  v_allowed := case
      when v.status = 'pending' and p_to_status = 'confirmed' then v_actor = 'seller'
      when v.status = 'confirmed' and p_to_status = 'packed' then v_actor = 'seller'
      when v.status = 'packed' and p_to_status = 'dispatched' then v_actor = 'seller'
      when v.status = 'dispatched' and p_to_status = 'delivered' then v_actor = 'buyer'
      when v.status = 'delivered' and p_to_status = 'completed' then v_actor in ('buyer', 'seller')
      when v.status in ('pending', 'confirmed') and p_to_status = 'cancelled' then true
      else false end;
  if not v_allowed then
    raise exception 'illegal transition % -> % for %', v.status, p_to_status, v_actor using errcode = '55000', hint = 'ILLEGAL_TRANSITION';
  end if;
  if p_to_status = 'cancelled' then
    update public.seed_inventory i set available_packs = i.available_packs + it.packs, reserved_packs = i.reserved_packs - it.packs
      from public.seed_order_items it where it.seed_order_id = v.id and i.product_id = it.product_id;
  elsif p_to_status = 'dispatched' then
    update public.seed_inventory i set reserved_packs = i.reserved_packs - it.packs
      from public.seed_order_items it where it.seed_order_id = v.id and i.product_id = it.product_id;
  end if;
  v_from := v.status;
  update public.seed_orders set status = p_to_status, updated_at = now() where id = v.id returning * into v;
  insert into public.seed_order_events (seed_order_id, from_status, to_status, actor_id, note) values (v.id, v_from, p_to_status, auth.uid(), left(p_note, 300));
  perform app_private.notify(case when v_actor = 'seller' then v.buyer_id else v.seller_id end, 'seed_order_update',
    'Seed order ' || v.order_number || ': ' || p_to_status, left(p_note, 200), '/seeds/orders');
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Market prices with provenance
-- ---------------------------------------------------------------------------
create table public.data_sources (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  publisher text not null,
  official_url text not null check (official_url ~ '^https://'),
  dataset_id text,
  licence text,
  price_type text not null check (price_type in ('mandi_wholesale', 'msp_reference', 'retail_reference')),
  expected_cadence text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'pending_access')),
  notes text
);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id smallint not null references public.data_sources (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text not null default 'running' check (result in ('running', 'succeeded', 'partial', 'failed')),
  rows_received integer not null default 0,
  rows_upserted integer not null default 0,
  rows_rejected integer not null default 0,
  error_code text,
  triggered_by text not null check (triggered_by in ('admin_csv', 'scheduler', 'edge_function', 'migration_seed'))
);

create table public.market_price_observations (
  id bigint generated always as identity primary key,
  source_id smallint not null references public.data_sources (id),
  ingestion_run_id uuid references public.ingestion_runs (id),
  source_record_key text not null,
  price_type text not null check (price_type in ('mandi_wholesale', 'msp_reference', 'retail_reference')),
  commodity_id smallint not null references public.commodities (id),
  variety text not null default 'Other',
  state text,
  district text,
  market text,
  season text,
  observed_on date not null,
  min_paise bigint check (min_paise > 0),
  max_paise bigint check (max_paise > 0),
  modal_paise bigint not null check (modal_paise > 0),
  unit text not null check (unit in ('kg', 'quintal', 'tonne')),
  retrieved_at timestamptz not null default now(),
  is_sample boolean not null default false,
  verification_status text not null default 'verified' check (verification_status in ('verified', 'verification_pending')),
  unique (source_id, source_record_key),
  constraint price_order check (min_paise is null or max_paise is null or (min_paise <= modal_paise and modal_paise <= max_paise))
);
create index market_prices_filter_idx on public.market_price_observations (price_type, commodity_id, state, district, observed_on desc);

create or replace function public.admin_import_prices(p_source_code text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source public.data_sources;
  v_run uuid;
  r jsonb;
  v_ok integer := 0;
  v_bad integer := 0;
  v_commodity smallint;
begin
  if not app_private.is_admin() then raise exception 'admin with MFA required' using errcode = '42501', hint = 'ADMIN_AAL2_REQUIRED'; end if;
  select * into v_source from public.data_sources where code = p_source_code;
  if not found then raise exception 'unknown source' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'rows must be an array of <= 5000' using errcode = '22023'; end if;
  insert into public.ingestion_runs (source_id, triggered_by, rows_received) values (v_source.id, 'admin_csv', jsonb_array_length(p_rows)) returning id into v_run;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      select id into v_commodity from public.commodities where code = r ->> 'commodity_code';
      if v_commodity is null or (r ->> 'unit') not in ('kg', 'quintal', 'tonne') or (r ->> 'modal_paise') is null or (r ->> 'observed_on') is null then
        v_bad := v_bad + 1; continue;
      end if;
      insert into public.market_price_observations (source_id, ingestion_run_id, source_record_key, price_type, commodity_id, variety, state,
        district, market, season, observed_on, min_paise, max_paise, modal_paise, unit, is_sample, verification_status)
      values (v_source.id, v_run,
        coalesce(r ->> 'source_record_key', md5(concat_ws('|', r ->> 'commodity_code', r ->> 'variety', r ->> 'state', r ->> 'district', r ->> 'market', r ->> 'observed_on'))),
        v_source.price_type, v_commodity, coalesce(nullif(r ->> 'variety', ''), 'Other'), r ->> 'state', r ->> 'district', r ->> 'market', r ->> 'season',
        (r ->> 'observed_on')::date, (r ->> 'min_paise')::bigint, (r ->> 'max_paise')::bigint, (r ->> 'modal_paise')::bigint, r ->> 'unit',
        coalesce((r ->> 'is_sample')::boolean, false), 'verified')
      on conflict (source_id, source_record_key) do update
        set min_paise = excluded.min_paise, max_paise = excluded.max_paise, modal_paise = excluded.modal_paise,
            retrieved_at = now(), ingestion_run_id = excluded.ingestion_run_id;
      v_ok := v_ok + 1;
    exception when others then
      v_bad := v_bad + 1;
    end;
  end loop;
  update public.ingestion_runs set finished_at = now(), rows_upserted = v_ok, rows_rejected = v_bad,
    result = case when v_bad = 0 then 'succeeded' when v_ok > 0 then 'partial' else 'failed' end where id = v_run;
  perform app_private.audit('prices.imported', 'ingestion_runs', v_run::text, jsonb_build_object('source', p_source_code, 'ok', v_ok, 'rejected', v_bad));
  return jsonb_build_object('run_id', v_run, 'upserted', v_ok, 'rejected', v_bad);
end $$;

-- ---------------------------------------------------------------------------
-- Government schemes (governed content)
-- ---------------------------------------------------------------------------
create table public.government_schemes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title_en text not null,
  title_hi text,
  scheme_type text not null check (scheme_type in ('income_support', 'insurance', 'credit', 'soil_health', 'irrigation_energy', 'market_access', 'organic', 'mechanisation', 'other')),
  level text not null default 'central' check (level in ('central', 'state')),
  applicable_states text[] not null default '{}',
  applicable_crops text[] not null default '{}',
  farmer_categories text[] not null default '{}',
  summary_en text not null,
  summary_hi text,
  eligibility_en text not null,
  benefit_en text not null,
  documents_en text[] not null default '{}',
  application_steps_en text[] not null default '{}',
  official_url text not null check (official_url ~ '^https://'),
  application_url text check (application_url ~ '^https://'),
  opens_on date,
  closes_on date,
  source_published_on date,
  last_verified_at timestamptz,
  reviewer_id uuid references public.profiles (id),
  status text not null default 'source_review' check (status in ('draft', 'source_review', 'published', 'review_due', 'expired', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger schemes_touch before update on public.government_schemes for each row execute function app_private.touch_updated_at();

create table public.scheme_reviews (
  id bigint generated always as identity primary key,
  scheme_id uuid not null references public.government_schemes (id) on delete cascade,
  reviewer_id uuid references public.profiles (id),
  from_status text, to_status text not null, note text, created_at timestamptz not null default now()
);

create table public.saved_schemes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  scheme_id uuid not null references public.government_schemes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, scheme_id)
);

create or replace function public.admin_review_scheme(p_scheme_id uuid, p_to_status text, p_note text default null)
returns public.government_schemes language plpgsql security definer set search_path = '' as $$
declare v public.government_schemes; v_from text;
begin
  if not app_private.is_admin() then raise exception 'admin with MFA required' using errcode = '42501', hint = 'ADMIN_AAL2_REQUIRED'; end if;
  if p_to_status not in ('source_review', 'published', 'review_due', 'expired', 'withdrawn') then raise exception 'invalid status' using errcode = '22023'; end if;
  select * into v from public.government_schemes where id = p_scheme_id for update;
  if not found then raise exception 'scheme not found' using errcode = 'P0002'; end if;
  v_from := v.status;
  update public.government_schemes set status = p_to_status, reviewer_id = auth.uid(),
         last_verified_at = case when p_to_status = 'published' then now() else last_verified_at end
   where id = p_scheme_id returning * into v;
  insert into public.scheme_reviews (scheme_id, reviewer_id, from_status, to_status, note) values (v.id, auth.uid(), v_from, p_to_status, left(p_note, 500));
  perform app_private.audit('scheme.reviewed', 'government_schemes', v.id::text, jsonb_build_object('to', p_to_status));
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Landowner workspace (enquiries only; no legal e-signing)
-- ---------------------------------------------------------------------------
create table public.land_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  state text not null, district text not null, locality text,
  area numeric(10, 2) not null check (area > 0),
  area_unit text not null check (area_unit in ('acre', 'hectare', 'bigha')),
  arrangement text not null check (arrangement in ('lease', 'sharecropping', 'partnership')),
  permitted_use text check (char_length(permitted_use) <= 300),
  water_source text check (char_length(water_source) <= 120),
  available_from date not null, available_until date,
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'closed')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger land_listings_touch before update on public.land_listings for each row execute function app_private.touch_updated_at();

create table public.land_enquiries (
  id uuid primary key default gen_random_uuid(),
  land_listing_id uuid not null references public.land_listings (id) on delete cascade,
  enquirer_id uuid not null references public.profiles (id),
  owner_id uuid not null references public.profiles (id),
  message text not null check (char_length(message) between 5 and 1000),
  status text not null default 'open' check (status in ('open', 'responded', 'closed')),
  owner_reply text check (char_length(owner_reply) <= 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reports, support, admin moderation
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  target_type text not null check (target_type in ('harvest_listing', 'demand_request', 'seed_product', 'profile', 'land_listing')),
  target_id uuid not null,
  reason text not null check (reason in ('misleading', 'fraud', 'abusive', 'prohibited', 'duplicate', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolution_note text,
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  category text not null check (category in ('account', 'listing', 'order', 'payment', 'seed', 'data', 'other')),
  subject text not null check (char_length(subject) between 3 and 140),
  body text not null check (char_length(body) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now()
);

create or replace function public.admin_moderate(p_target_type text, p_target_id uuid, p_action text, p_reason text, p_report_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if not app_private.is_admin() then raise exception 'admin with MFA required' using errcode = '42501', hint = 'ADMIN_AAL2_REQUIRED'; end if;
  if p_action not in ('withdraw', 'dismiss') then raise exception 'invalid action' using errcode = '22023'; end if;
  if char_length(coalesce(p_reason, '')) < 5 then raise exception 'reason required' using errcode = '22023'; end if;
  if p_action = 'withdraw' then
    if p_target_type = 'harvest_listing' then
      perform set_config('app.trusted_inventory_write', 'on', true);
      update public.harvest_listings set status = 'withdrawn' where id = p_target_id and reserved_quantity = 0 returning farmer_id into v_owner;
      perform set_config('app.trusted_inventory_write', 'off', true);
      if v_owner is null then raise exception 'listing not found or has reserved stock' using errcode = '55000'; end if;
    elsif p_target_type = 'seed_product' then
      update public.seed_products set status = 'delisted' where id = p_target_id returning seller_id into v_owner;
    elsif p_target_type = 'demand_request' then
      perform set_config('app.trusted_inventory_write', 'on', true);
      update public.demand_requests set status = 'cancelled' where id = p_target_id returning buyer_id into v_owner;
      perform set_config('app.trusted_inventory_write', 'off', true);
    else
      raise exception 'unsupported target' using errcode = '22023';
    end if;
    if v_owner is not null then
      perform app_private.notify(v_owner, 'listing_moderated', 'A listing was removed by moderation', left(p_reason, 300), '/help');
    end if;
  end if;
  if p_report_id is not null then
    update public.reports set status = case when p_action = 'withdraw' then 'actioned' else 'dismissed' end,
           resolution_note = left(p_reason, 500), resolved_by = auth.uid() where id = p_report_id;
  end if;
  perform app_private.audit('moderation.' || p_action, p_target_type, p_target_id::text, jsonb_build_object('reason', left(p_reason, 300), 'report_id', p_report_id));
end $$;

create or replace function public.admin_verify_seed_certification(p_product_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_admin() then raise exception 'admin with MFA required' using errcode = '42501', hint = 'ADMIN_AAL2_REQUIRED'; end if;
  if char_length(coalesce(p_note, '')) < 10 then raise exception 'describe exactly what was checked' using errcode = '22023'; end if;
  perform set_config('app.trusted_admin_write', 'on', true);
  update public.seed_products set certification_verified_at = now(), certification_verified_note = left(p_note, 300)
   where id = p_product_id and certification_ref is not null;
  perform set_config('app.trusted_admin_write', 'off', true);
  if not found then raise exception 'product not found or has no certification reference' using errcode = 'P0002'; end if;
  perform app_private.audit('seed.certification_verified', 'seed_products', p_product_id::text, jsonb_build_object('note', left(p_note, 300)));
end $$;

create or replace function public.admin_list_users(p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, email text, email_verified boolean, display_name text, state text, district text, roles jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_admin() then raise exception 'admin with MFA required' using errcode = '42501', hint = 'ADMIN_AAL2_REQUIRED'; end if;
  perform app_private.audit('admin.list_users', 'profiles', null, jsonb_build_object('search', left(p_search, 60)));
  return query
    select p.id, u.email::text, u.email_confirmed_at is not null, p.display_name, p.state, p.district,
           coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'role', r.role, 'status', r.status) order by r.role)
                       from public.user_roles r where r.user_id = p.id), '[]'::jsonb),
           p.created_at
      from public.profiles p join auth.users u on u.id = p.id
     where p_search is null or p.display_name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%'
     order by p.created_at desc
     limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_admin() then raise exception 'admin with MFA required' using errcode = '42501', hint = 'ADMIN_AAL2_REQUIRED'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'pending_roles', (select count(*) from public.user_roles where status = 'requested'),
    'open_listings', (select count(*) from public.harvest_listings where status in ('published', 'partially_reserved')),
    'open_demand', (select count(*) from public.demand_requests where status in ('open', 'partially_filled')),
    'active_orders', (select count(*) from public.orders where status not in ('completed', 'cancelled')),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'schemes_needing_review', (select count(*) from public.government_schemes where status in ('source_review', 'review_due')),
    'last_price_ingestion', (select max(finished_at) from public.ingestion_runs where result in ('succeeded', 'partial')),
    'demo_records', (select count(*) from public.harvest_listings where is_demo)
  );
end $$;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.match_runs enable row level security;
alter table public.match_allocations enable row level security;
alter table public.seed_products enable row level security;
alter table public.seed_inventory enable row level security;
alter table public.seed_orders enable row level security;
alter table public.seed_order_items enable row level security;
alter table public.seed_order_events enable row level security;
alter table public.data_sources enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.market_price_observations enable row level security;
alter table public.government_schemes enable row level security;
alter table public.scheme_reviews enable row level security;
alter table public.saved_schemes enable row level security;
alter table public.land_listings enable row level security;
alter table public.land_enquiries enable row level security;
alter table public.reports enable row level security;
alter table public.support_tickets enable row level security;

revoke all on public.match_runs, public.match_allocations, public.seed_products, public.seed_inventory, public.seed_orders,
  public.seed_order_items, public.seed_order_events, public.data_sources, public.ingestion_runs, public.market_price_observations,
  public.government_schemes, public.scheme_reviews, public.saved_schemes, public.land_listings, public.land_enquiries,
  public.reports, public.support_tickets from anon, authenticated;
revoke all on sequence public.seed_order_number_seq from anon, authenticated;

grant select on public.match_runs, public.match_allocations to authenticated;
create policy match_runs_owner on public.match_runs for select to authenticated
  using (created_by = (select auth.uid()) or (select app_private.is_support_or_admin()));
create policy match_allocations_visible on public.match_allocations for select to authenticated
  using (farmer_id = (select auth.uid()) or exists (select 1 from public.match_runs r where r.id = match_run_id and r.created_by = (select auth.uid())));

grant select on public.seed_products, public.seed_inventory to anon, authenticated;
grant insert (seller_id, commodity_id, variety_name, brand, pack_size, pack_unit, price_paise, season, lot_number, germination_percent,
  expiry_date, certification_ref, description, delivery_states, shipping_paise, status),
  update (variety_name, brand, pack_size, pack_unit, price_paise, season, lot_number, germination_percent, expiry_date, certification_ref,
  description, delivery_states, shipping_paise, status) on public.seed_products to authenticated;
create policy seed_products_public on public.seed_products for select to anon, authenticated using (status = 'active');
create policy seed_products_owner_read on public.seed_products for select to authenticated
  using (seller_id = (select auth.uid()) or (select app_private.is_support_or_admin()));
create policy seed_products_owner_insert on public.seed_products for insert to authenticated
  with check (seller_id = (select auth.uid()) and (select app_private.has_role('seed_seller')) and (select app_private.is_email_verified()));
create policy seed_products_owner_update on public.seed_products for update to authenticated
  using (seller_id = (select auth.uid()) and (select app_private.has_role('seed_seller'))) with check (seller_id = (select auth.uid()));
create policy seed_inventory_read on public.seed_inventory for select to anon, authenticated
  using (exists (select 1 from public.seed_products p where p.id = product_id));

grant select on public.seed_orders, public.seed_order_items, public.seed_order_events to authenticated;
create policy seed_orders_party on public.seed_orders for select to authenticated
  using ((select auth.uid()) in (buyer_id, seller_id) or (select app_private.is_support_or_admin()));
create policy seed_order_items_party on public.seed_order_items for select to authenticated
  using (exists (select 1 from public.seed_orders o where o.id = seed_order_id));
create policy seed_order_events_party on public.seed_order_events for select to authenticated
  using (exists (select 1 from public.seed_orders o where o.id = seed_order_id));

grant select on public.data_sources, public.market_price_observations to anon, authenticated;
grant select on public.ingestion_runs to authenticated;
create policy data_sources_read on public.data_sources for select to anon, authenticated using (true);
create policy prices_read on public.market_price_observations for select to anon, authenticated using (true);
create policy ingestion_runs_admin on public.ingestion_runs for select to authenticated using ((select app_private.is_admin()));

grant select on public.government_schemes to anon, authenticated;
grant insert (slug, title_en, title_hi, scheme_type, level, applicable_states, applicable_crops, farmer_categories, summary_en, summary_hi,
  eligibility_en, benefit_en, documents_en, application_steps_en, official_url, application_url, opens_on, closes_on, source_published_on),
  update (title_en, title_hi, scheme_type, level, applicable_states, applicable_crops, farmer_categories, summary_en, summary_hi,
  eligibility_en, benefit_en, documents_en, application_steps_en, official_url, application_url, opens_on, closes_on, source_published_on)
  on public.government_schemes to authenticated;
create policy schemes_public on public.government_schemes for select to anon, authenticated
  using (status in ('published', 'review_due') or (select app_private.is_admin()));
create policy schemes_admin_insert on public.government_schemes for insert to authenticated with check ((select app_private.is_admin()));
create policy schemes_admin_update on public.government_schemes for update to authenticated
  using ((select app_private.is_admin())) with check ((select app_private.is_admin()));
grant select on public.scheme_reviews to authenticated;
create policy scheme_reviews_admin on public.scheme_reviews for select to authenticated using ((select app_private.is_admin()));
grant select, insert (user_id, scheme_id), delete on public.saved_schemes to authenticated;
create policy saved_schemes_own_read on public.saved_schemes for select to authenticated using (user_id = (select auth.uid()));
create policy saved_schemes_own_insert on public.saved_schemes for insert to authenticated with check (user_id = (select auth.uid()));
create policy saved_schemes_own_delete on public.saved_schemes for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.land_listings to anon, authenticated;
grant insert (owner_id, title, state, district, locality, area, area_unit, arrangement, permitted_use, water_source, available_from, available_until, status),
  update (title, state, district, locality, area, area_unit, arrangement, permitted_use, water_source, available_from, available_until, status)
  on public.land_listings to authenticated;
create policy land_public on public.land_listings for select to anon, authenticated using (status = 'published');
create policy land_owner_read on public.land_listings for select to authenticated using (owner_id = (select auth.uid()));
create policy land_owner_insert on public.land_listings for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select app_private.has_role('landowner')) and (select app_private.is_email_verified()));
create policy land_owner_update on public.land_listings for update to authenticated
  using (owner_id = (select auth.uid()) and (select app_private.has_role('landowner'))) with check (owner_id = (select auth.uid()));

grant select, insert (land_listing_id, enquirer_id, owner_id, message), update (status, owner_reply) on public.land_enquiries to authenticated;
create policy land_enquiries_party on public.land_enquiries for select to authenticated using ((select auth.uid()) in (enquirer_id, owner_id));
create policy land_enquiries_insert on public.land_enquiries for insert to authenticated
  with check (enquirer_id = (select auth.uid()) and (select app_private.is_email_verified())
    and exists (select 1 from public.land_listings l where l.id = land_listing_id and l.owner_id = land_enquiries.owner_id and l.status = 'published' and l.owner_id <> (select auth.uid())));
create policy land_enquiries_owner_update on public.land_enquiries for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

grant select, insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;
create policy reports_own_or_admin on public.reports for select to authenticated using (reporter_id = (select auth.uid()) or (select app_private.is_admin()));
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));

grant select, insert (user_id, category, subject, body) on public.support_tickets to authenticated;
create policy tickets_own_or_staff on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_support_or_admin()));
create policy tickets_insert on public.support_tickets for insert to authenticated with check (user_id = (select auth.uid()));

revoke all on function public.send_match_offers(uuid, text, integer), public.set_seed_stock(uuid, integer),
  public.place_seed_order(uuid, integer, text, text, text, text), public.transition_seed_order(uuid, text, text),
  public.admin_import_prices(text, jsonb), public.admin_review_scheme(uuid, text, text), public.admin_moderate(text, uuid, text, text, uuid),
  public.admin_verify_seed_certification(uuid, text), public.admin_list_users(text, integer, integer), public.admin_overview() from public, anon;
grant execute on function public.send_match_offers(uuid, text, integer), public.set_seed_stock(uuid, integer),
  public.place_seed_order(uuid, integer, text, text, text, text), public.transition_seed_order(uuid, text, text),
  public.admin_import_prices(text, jsonb), public.admin_review_scheme(uuid, text, text), public.admin_moderate(text, uuid, text, text, uuid),
  public.admin_verify_seed_certification(uuid, text), public.admin_list_users(text, integer, integer), public.admin_overview() to authenticated;

-- service_role (Edge Functions) needs to read inputs and write match runs.
grant select on all tables in schema public to service_role;
grant insert on public.match_runs, public.match_allocations to service_role;

-- ---------------------------------------------------------------------------
-- Storage buckets and object policies
-- Path convention: <auth.uid()>/<resource uuid>/<file name>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('harvest-images', 'harvest-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('private-user-documents', 'private-user-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy harvest_images_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'harvest-images' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.harvest_listings l where l.id::text = (storage.foldername(name))[2] and l.farmer_id = (select auth.uid())));
create policy harvest_images_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'harvest-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy harvest_images_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'harvest-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy private_docs_owner_all on storage.objects for select to authenticated
  using (bucket_id = 'private-user-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy private_docs_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'private-user-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy private_docs_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'private-user-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Realtime: only notifications (RLS-filtered per recipient).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
