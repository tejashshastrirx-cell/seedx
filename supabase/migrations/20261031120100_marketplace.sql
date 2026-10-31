-- SEED X 02 - catalogue, harvest listings, demand, offers, orders and their state machines.

-- ---------------------------------------------------------------------------
-- Reference catalogue
-- ---------------------------------------------------------------------------
create table public.commodities (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z_]{2,40}$'),
  name_en text not null,
  name_hi text not null,
  category text not null check (category in ('cereal', 'pulse', 'oilseed', 'vegetable', 'fruit', 'fibre', 'spice', 'other')),
  default_unit text not null check (default_unit in ('kg', 'quintal', 'tonne')),
  shelf_life_days integer not null check (shelf_life_days between 1 and 720),
  icon text
);

create table public.crop_varieties (
  id integer generated always as identity primary key,
  commodity_id smallint not null references public.commodities (id),
  name_en text not null,
  name_hi text,
  unique (commodity_id, name_en)
);

-- ---------------------------------------------------------------------------
-- Harvest listings
-- ---------------------------------------------------------------------------
create table public.harvest_listings (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.profiles (id) on delete restrict,
  commodity_id smallint not null references public.commodities (id),
  variety_id integer references public.crop_varieties (id),
  title text not null check (char_length(title) between 3 and 120),
  grade text not null default 'ungraded' check (grade in ('A', 'B', 'C', 'ungraded')),
  quality_notes text check (char_length(quality_notes) <= 500),
  unit text not null check (unit in ('kg', 'quintal', 'tonne')),
  total_quantity numeric(14, 3) not null check (total_quantity > 0 and total_quantity <= 10000000),
  available_quantity numeric(14, 3) not null default 0 check (available_quantity >= 0),
  reserved_quantity numeric(14, 3) not null default 0 check (reserved_quantity >= 0),
  sold_quantity numeric(14, 3) not null default 0 check (sold_quantity >= 0),
  min_price_paise_per_unit bigint check (min_price_paise_per_unit > 0),
  asking_price_paise_per_unit bigint check (asking_price_paise_per_unit > 0),
  seller_handling_paise_per_unit bigint not null default 0 check (seller_handling_paise_per_unit >= 0),
  harvest_date date,
  available_from date not null default current_date,
  available_until date not null,
  state text not null check (char_length(state) between 2 and 80),
  district text not null check (char_length(district) between 2 and 80),
  locality text check (char_length(locality) <= 120),
  approx_lat numeric(6, 3) check (approx_lat between -90 and 90),
  approx_lng numeric(7, 3) check (approx_lng between -180 and 180),
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'partially_reserved', 'reserved', 'sold', 'withdrawn', 'expired')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint harvest_quantity_balance check (available_quantity + reserved_quantity + sold_quantity = total_quantity),
  constraint harvest_window check (available_until >= available_from),
  constraint harvest_price_floor check (asking_price_paise_per_unit is null or min_price_paise_per_unit is null or asking_price_paise_per_unit >= min_price_paise_per_unit)
);
create index harvest_listings_public_idx on public.harvest_listings (status, commodity_id, available_until);
create index harvest_listings_farmer_idx on public.harvest_listings (farmer_id, status);
create index harvest_listings_location_idx on public.harvest_listings (state, district);

-- Exact pickup location: private, disclosed only to transaction parties.
create table public.harvest_pickup_locations (
  listing_id uuid primary key references public.harvest_listings (id) on delete cascade,
  farmer_id uuid not null references public.profiles (id),
  address_line text check (char_length(address_line) <= 300),
  lat numeric(9, 6) check (lat between -90 and 90),
  lng numeric(9, 6) check (lng between -180 and 180),
  contact_phone text check (contact_phone ~ '^[0-9+ -]{6,20}$'),
  updated_at timestamptz not null default now()
);

create table public.harvest_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.harvest_listings (id) on delete cascade,
  farmer_id uuid not null references public.profiles (id),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  created_at timestamptz not null default now()
);

-- Listing defaults, rounding of public location and owner state-machine rules.
create or replace function app_private.harvest_listing_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_trusted boolean := coalesce(current_setting('app.trusted_inventory_write', true), '') = 'on';
begin
  -- Public coordinates are deliberately coarse (~1 km).
  new.approx_lat := round(new.approx_lat, 2);
  new.approx_lng := round(new.approx_lng, 2);

  if tg_op = 'INSERT' then
    if not v_trusted then
      new.available_quantity := new.total_quantity;
      new.reserved_quantity := 0;
      new.sold_quantity := 0;
      if new.status not in ('draft', 'published') then
        raise exception 'new listings start as draft or published' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;

  if v_trusted then
    new.updated_at := now();
    return new;
  end if;

  -- Owner edits ------------------------------------------------------------
  if old.status in ('sold', 'withdrawn', 'expired') then
    raise exception 'listing is closed (%)', old.status using errcode = '55000', hint = 'LISTING_CLOSED';
  end if;
  if (new.commodity_id, new.unit) is distinct from (old.commodity_id, old.unit) and old.status <> 'draft' then
    raise exception 'commodity and unit are locked after publication' using errcode = '55000';
  end if;
  if new.total_quantity <> old.total_quantity then
    new.available_quantity := new.total_quantity - old.reserved_quantity - old.sold_quantity;
    if new.available_quantity < 0 then
      raise exception 'total cannot be lower than reserved + sold quantity' using errcode = '23514';
    end if;
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('published', 'withdrawn')) or
      (old.status in ('published', 'partially_reserved') and new.status in ('paused', 'withdrawn')) or
      (old.status = 'paused' and new.status in ('published', 'withdrawn'))
    ) then
      raise exception 'illegal listing transition % -> %', old.status, new.status using errcode = '55000', hint = 'ILLEGAL_TRANSITION';
    end if;
    if new.status = 'withdrawn' and old.reserved_quantity > 0 then
      raise exception 'cannot withdraw while quantity is reserved for an order' using errcode = '55000';
    end if;
    if new.status = 'published' and old.reserved_quantity > 0 then
      new.status := 'partially_reserved';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger harvest_listings_before_write before insert or update on public.harvest_listings
  for each row execute function app_private.harvest_listing_before_write();

-- Recompute derived status after a trusted inventory change.
create or replace function app_private.refresh_listing_status(p_listing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.harvest_listings;
begin
  select * into v from public.harvest_listings where id = p_listing_id;
  if v.status in ('withdrawn', 'expired', 'draft', 'paused') and v.available_quantity > 0 then
    return;
  end if;
  perform set_config('app.trusted_inventory_write', 'on', true);
  update public.harvest_listings set status = case
      when available_quantity = 0 and reserved_quantity = 0 and sold_quantity > 0 then 'sold'
      when available_quantity = 0 and reserved_quantity > 0 then 'reserved'
      when available_quantity > 0 and reserved_quantity > 0 then 'partially_reserved'
      when available_quantity > 0 and status in ('reserved', 'partially_reserved', 'sold') then 'published'
      else status end
   where id = p_listing_id;
  perform set_config('app.trusted_inventory_write', 'off', true);
end $$;
revoke all on function app_private.refresh_listing_status(uuid) from public;

-- ---------------------------------------------------------------------------
-- Buyer demand
-- ---------------------------------------------------------------------------
create table public.demand_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  commodity_id smallint not null references public.commodities (id),
  variety_id integer references public.crop_varieties (id),
  title text not null check (char_length(title) between 3 and 120),
  min_grade text not null default 'ungraded' check (min_grade in ('A', 'B', 'C', 'ungraded')),
  quantity numeric(14, 3) not null check (quantity > 0 and quantity <= 10000000),
  unit text not null check (unit in ('kg', 'quintal', 'tonne')),
  filled_quantity numeric(14, 3) not null default 0 check (filled_quantity >= 0),
  max_price_paise_per_unit bigint check (max_price_paise_per_unit > 0),
  delivery_from date not null,
  delivery_until date not null,
  delivery_state text not null check (char_length(delivery_state) between 2 and 80),
  delivery_district text not null check (char_length(delivery_district) between 2 and 80),
  delivery_locality text check (char_length(delivery_locality) <= 120),
  approx_lat numeric(6, 3) check (approx_lat between -90 and 90),
  approx_lng numeric(7, 3) check (approx_lng between -180 and 180),
  max_transit_hours integer check (max_transit_hours between 1 and 240),
  buyer_type text not null default 'retailer' check (buyer_type in ('retailer', 'restaurant', 'hostel', 'hotel', 'canteen', 'processor', 'wholesaler', 'other')),
  visibility text not null default 'public' check (visibility in ('public', 'matched_only')),
  status text not null default 'open' check (status in ('draft', 'open', 'partially_filled', 'filled', 'cancelled', 'expired')),
  notes text check (char_length(notes) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demand_window check (delivery_until >= delivery_from),
  constraint demand_fill check (filled_quantity <= quantity)
);
create index demand_requests_public_idx on public.demand_requests (status, commodity_id, delivery_until);
create index demand_requests_buyer_idx on public.demand_requests (buyer_id, status);

create or replace function app_private.demand_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.approx_lat := round(new.approx_lat, 2);
  new.approx_lng := round(new.approx_lng, 2);
  if tg_op = 'INSERT' then
    if current_setting('app.trusted_inventory_write', true) is distinct from 'on' then
      new.filled_quantity := 0;
      if new.status not in ('draft', 'open') then
        raise exception 'new demand starts as draft or open' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;
  if current_setting('app.trusted_inventory_write', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;
  if old.status in ('filled', 'cancelled', 'expired') then
    raise exception 'demand is closed' using errcode = '55000';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status in ('open', 'cancelled')) or
    (old.status in ('open', 'partially_filled') and new.status = 'cancelled')
  ) then
    raise exception 'illegal demand transition % -> %', old.status, new.status using errcode = '55000', hint = 'ILLEGAL_TRANSITION';
  end if;
  if (new.commodity_id, new.unit) is distinct from (old.commodity_id, old.unit) and old.status <> 'draft' then
    raise exception 'commodity and unit are locked after publication' using errcode = '55000';
  end if;
  if new.quantity < old.filled_quantity then
    raise exception 'quantity cannot be below the filled quantity' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger demand_before_write before insert or update on public.demand_requests
  for each row execute function app_private.demand_before_write();

-- ---------------------------------------------------------------------------
-- Offers (immutable terms once submitted; a counter creates a new version)
-- ---------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.harvest_listings (id) on delete restrict,
  farmer_id uuid not null references public.profiles (id),
  buyer_id uuid not null references public.profiles (id),
  demand_id uuid references public.demand_requests (id),
  match_run_id uuid,
  proposed_by text not null check (proposed_by in ('buyer', 'farmer')),
  parent_offer_id uuid references public.offers (id),
  version integer not null default 1 check (version between 1 and 20),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit text not null check (unit in ('kg', 'quintal', 'tonne')),
  price_paise_per_unit bigint not null check (price_paise_per_unit > 0),
  delivery_terms text not null default 'buyer_pays_transport' check (delivery_terms in ('buyer_pays_transport', 'seller_pays_transport', 'buyer_collects')),
  transport_estimate_paise bigint not null default 0 check (transport_estimate_paise >= 0),
  transport_estimate_source text check (char_length(transport_estimate_source) <= 200),
  message text check (char_length(message) <= 500),
  status text not null default 'submitted' check (status in ('submitted', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired')),
  status_reason text check (char_length(status_reason) <= 200),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint offer_parties_differ check (farmer_id <> buyer_id)
);
create index offers_listing_idx on public.offers (listing_id, status);
create index offers_buyer_idx on public.offers (buyer_id, created_at desc);
create index offers_farmer_idx on public.offers (farmer_id, created_at desc);

create table public.offer_events (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.offers (id),
  actor_id uuid,
  event text not null check (event in ('submitted', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired', 'closed_insufficient_stock')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index offer_events_offer_idx on public.offer_events (offer_id, created_at);

-- ---------------------------------------------------------------------------
-- Orders (snapshot of accepted terms; append-only event history)
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  offer_id uuid not null unique references public.offers (id),
  listing_id uuid not null references public.harvest_listings (id),
  demand_id uuid references public.demand_requests (id),
  farmer_id uuid not null references public.profiles (id) on delete restrict,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  logistics_provider_id uuid references public.profiles (id),
  commodity_id smallint not null references public.commodities (id),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit text not null check (unit in ('kg', 'quintal', 'tonne')),
  price_paise_per_unit bigint not null check (price_paise_per_unit > 0),
  gross_paise bigint not null check (gross_paise > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  delivery_terms text not null,
  terms_snapshot jsonb not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'pickup_scheduled', 'in_transit', 'delivered', 'completed', 'cancelled', 'disputed')),
  pickup_date date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_farmer_idx on public.orders (farmer_id, created_at desc);
create index orders_logistics_idx on public.orders (logistics_provider_id, status);

create table public.order_cost_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  label text not null check (char_length(label) <= 120),
  payer text not null check (payer in ('farmer', 'buyer')),
  amount_paise bigint not null check (amount_paise >= 0),
  source text not null check (char_length(source) <= 200),
  certainty text not null check (certainty in ('estimated', 'confirmed')),
  created_at timestamptz not null default now()
);
create index order_cost_lines_order_idx on public.order_cost_lines (order_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_id uuid,
  actor_role text,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.order_delivery_details (
  order_id uuid primary key references public.orders (id) on delete restrict,
  buyer_id uuid not null references public.profiles (id),
  address_line text not null check (char_length(address_line) between 5 and 300),
  contact_phone text check (contact_phone ~ '^[0-9+ -]{6,20}$'),
  instructions text check (char_length(instructions) <= 300),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RPC: submit an offer (buyer) - validated server-side
-- ---------------------------------------------------------------------------
create or replace function public.submit_offer(
  p_listing_id uuid,
  p_quantity numeric,
  p_price_paise_per_unit bigint,
  p_delivery_terms text default 'buyer_pays_transport',
  p_message text default null,
  p_demand_id uuid default null,
  p_expires_in_hours integer default 72,
  p_transport_estimate_paise bigint default 0,
  p_transport_estimate_source text default null,
  p_match_run_id uuid default null
) returns public.offers language plpgsql security definer set search_path = '' as $$
declare
  v_listing public.harvest_listings;
  v_offer public.offers;
begin
  perform app_private.require_verified_role('buyer');
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;
  if p_price_paise_per_unit is null or p_price_paise_per_unit <= 0 then
    raise exception 'price must be positive' using errcode = '22023';
  end if;
  if p_expires_in_hours not between 1 and 336 then
    raise exception 'expiry must be 1-336 hours' using errcode = '22023';
  end if;

  select * into v_listing from public.harvest_listings where id = p_listing_id;
  if not found or v_listing.status not in ('published', 'partially_reserved') or v_listing.available_until < current_date then
    raise exception 'listing is not open for offers' using errcode = '55000', hint = 'LISTING_NOT_OPEN';
  end if;
  if v_listing.farmer_id = auth.uid() then
    raise exception 'you cannot make an offer on your own listing' using errcode = '42501';
  end if;
  if p_quantity > v_listing.available_quantity then
    raise exception 'requested quantity exceeds available quantity' using errcode = '23514', hint = 'INSUFFICIENT_STOCK';
  end if;
  if v_listing.min_price_paise_per_unit is not null and p_price_paise_per_unit < v_listing.min_price_paise_per_unit then
    raise exception 'price is below the farmer''s minimum' using errcode = '23514', hint = 'BELOW_MIN_PRICE';
  end if;
  if p_demand_id is not null and not exists (
    select 1 from public.demand_requests d where d.id = p_demand_id and d.buyer_id = auth.uid() and d.commodity_id = v_listing.commodity_id
  ) then
    raise exception 'demand request does not belong to you or is for another commodity' using errcode = '42501';
  end if;

  insert into public.offers (listing_id, farmer_id, buyer_id, demand_id, match_run_id, proposed_by, quantity, unit,
    price_paise_per_unit, delivery_terms, transport_estimate_paise, transport_estimate_source, message, expires_at, created_by)
  values (p_listing_id, v_listing.farmer_id, auth.uid(), p_demand_id, p_match_run_id, 'buyer', p_quantity, v_listing.unit,
    p_price_paise_per_unit, p_delivery_terms, coalesce(p_transport_estimate_paise, 0), left(p_transport_estimate_source, 200),
    left(p_message, 500), now() + make_interval(hours => p_expires_in_hours), auth.uid())
  returning * into v_offer;

  insert into public.offer_events (offer_id, actor_id, event, metadata)
  values (v_offer.id, auth.uid(), 'submitted', jsonb_build_object('quantity', p_quantity, 'price_paise_per_unit', p_price_paise_per_unit));
  perform app_private.notify(v_listing.farmer_id, 'offer_received', 'New offer on ' || v_listing.title,
    p_quantity || ' ' || v_listing.unit || ' at Rs ' || round(p_price_paise_per_unit / 100.0, 2) || '/' || v_listing.unit, '/farmer/offers');
  perform app_private.audit('offer.submitted', 'offers', v_offer.id::text, jsonb_build_object('listing_id', p_listing_id));
  return v_offer;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: counter an offer (the party that did NOT propose this version)
-- ---------------------------------------------------------------------------
create or replace function public.counter_offer(p_offer_id uuid, p_price_paise_per_unit bigint, p_quantity numeric default null, p_message text default null)
returns public.offers language plpgsql security definer set search_path = '' as $$
declare
  v_old public.offers;
  v_listing public.harvest_listings;
  v_new public.offers;
  v_actor text;
  v_counterparty uuid;
begin
  perform app_private.require_verified_role(null);
  select * into v_old from public.offers where id = p_offer_id for update;
  if not found then raise exception 'offer not found' using errcode = 'P0002'; end if;
  v_actor := case when auth.uid() = v_old.farmer_id then 'farmer' when auth.uid() = v_old.buyer_id then 'buyer' end;
  if v_actor is null or v_actor = v_old.proposed_by then
    raise exception 'only the receiving party can counter this offer' using errcode = '42501';
  end if;
  if v_old.status <> 'submitted' or v_old.expires_at < now() then
    raise exception 'offer is no longer open' using errcode = '55000', hint = 'OFFER_NOT_OPEN';
  end if;
  if v_old.version >= 20 then raise exception 'negotiation limit reached' using errcode = '55000'; end if;
  select * into v_listing from public.harvest_listings where id = v_old.listing_id;
  if coalesce(p_quantity, v_old.quantity) <= 0 or coalesce(p_quantity, v_old.quantity) > v_listing.available_quantity then
    raise exception 'quantity exceeds available quantity' using errcode = '23514', hint = 'INSUFFICIENT_STOCK';
  end if;
  if p_price_paise_per_unit is null or p_price_paise_per_unit <= 0 then
    raise exception 'price must be positive' using errcode = '22023';
  end if;

  update public.offers set status = 'countered', responded_at = now() where id = v_old.id;
  insert into public.offers (listing_id, farmer_id, buyer_id, demand_id, match_run_id, proposed_by, parent_offer_id, version,
    quantity, unit, price_paise_per_unit, delivery_terms, transport_estimate_paise, transport_estimate_source, message, expires_at, created_by)
  values (v_old.listing_id, v_old.farmer_id, v_old.buyer_id, v_old.demand_id, v_old.match_run_id, v_actor, v_old.id, v_old.version + 1,
    coalesce(p_quantity, v_old.quantity), v_old.unit, p_price_paise_per_unit, v_old.delivery_terms, v_old.transport_estimate_paise,
    v_old.transport_estimate_source, left(p_message, 500), now() + interval '72 hours', auth.uid())
  returning * into v_new;

  insert into public.offer_events (offer_id, actor_id, event, metadata)
  values (v_old.id, auth.uid(), 'countered', jsonb_build_object('new_offer_id', v_new.id, 'price_paise_per_unit', p_price_paise_per_unit));
  insert into public.offer_events (offer_id, actor_id, event) values (v_new.id, auth.uid(), 'submitted');
  v_counterparty := case when v_actor = 'farmer' then v_old.buyer_id else v_old.farmer_id end;
  perform app_private.notify(v_counterparty, 'offer_countered', 'Counter-offer on ' || v_listing.title,
    'New price Rs ' || round(p_price_paise_per_unit / 100.0, 2) || '/' || v_old.unit,
    case when v_actor = 'farmer' then '/buyer/purchases' else '/farmer/offers' end);
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: reject or withdraw
-- ---------------------------------------------------------------------------
create or replace function public.respond_offer(p_offer_id uuid, p_action text, p_reason text default null)
returns public.offers language plpgsql security definer set search_path = '' as $$
declare
  v_offer public.offers;
  v_actor text;
begin
  perform app_private.require_verified_role(null);
  if p_action not in ('reject', 'withdraw') then
    raise exception 'action must be reject or withdraw (use accept_offer to accept)' using errcode = '22023';
  end if;
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then raise exception 'offer not found' using errcode = 'P0002'; end if;
  v_actor := case when auth.uid() = v_offer.farmer_id then 'farmer' when auth.uid() = v_offer.buyer_id then 'buyer' end;
  if v_actor is null then raise exception 'not a party to this offer' using errcode = '42501'; end if;
  if v_offer.status <> 'submitted' then
    raise exception 'offer is no longer open' using errcode = '55000', hint = 'OFFER_NOT_OPEN';
  end if;
  if p_action = 'withdraw' and v_actor <> v_offer.proposed_by then
    raise exception 'only the proposer can withdraw' using errcode = '42501';
  end if;
  if p_action = 'reject' and v_actor = v_offer.proposed_by then
    raise exception 'only the receiving party can reject' using errcode = '42501';
  end if;
  update public.offers
     set status = case when p_action = 'reject' then 'rejected' else 'withdrawn' end,
         status_reason = left(p_reason, 200), responded_at = now()
   where id = p_offer_id returning * into v_offer;
  insert into public.offer_events (offer_id, actor_id, event, metadata)
  values (v_offer.id, auth.uid(), v_offer.status, jsonb_build_object('reason', left(p_reason, 200)));
  perform app_private.notify(case when v_actor = 'farmer' then v_offer.buyer_id else v_offer.farmer_id end,
    case when p_action = 'reject' then 'offer_rejected' else 'offer_withdrawn' end,
    'Offer ' || v_offer.status, left(p_reason, 200), case when v_actor = 'farmer' then '/buyer/purchases' else '/farmer/offers' end);
  return v_offer;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: accept an offer - THE atomic transaction.
-- Locks the offer and listing rows, validates actor/state/expiry/stock/price floor,
-- reserves stock, creates the order + cost lines + events, closes incompatible
-- offers and stores the idempotent response. Any failure rolls back everything.
-- ---------------------------------------------------------------------------
create or replace function public.accept_offer(p_offer_id uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request jsonb := jsonb_build_object('offer_id', p_offer_id);
  v_prior jsonb;
  v_offer public.offers;
  v_listing public.harvest_listings;
  v_order public.orders;
  v_actor text;
  v_gross bigint;
  v_handling bigint;
  v_response jsonb;
  v_closed integer;
begin
  perform app_private.require_verified_role(null);
  v_prior := app_private.idem_lookup('accept_offer', p_idempotency_key, v_request);
  if v_prior is not null then
    return v_prior;
  end if;

  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then raise exception 'offer not found' using errcode = 'P0002'; end if;
  v_actor := case when auth.uid() = v_offer.farmer_id then 'farmer' when auth.uid() = v_offer.buyer_id then 'buyer' end;
  if v_actor is null then
    raise exception 'not a party to this offer' using errcode = '42501', hint = 'NOT_PARTY';
  end if;
  if v_actor = v_offer.proposed_by then
    raise exception 'the proposer cannot accept their own offer' using errcode = '42501', hint = 'WRONG_ACTOR';
  end if;
  if not app_private.has_role(v_actor) then
    raise exception 'active % role required', v_actor using errcode = '42501', hint = 'ROLE_REQUIRED';
  end if;
  if v_offer.status <> 'submitted' then
    raise exception 'offer is %', v_offer.status using errcode = '55000', hint = 'OFFER_NOT_OPEN';
  end if;
  if v_offer.expires_at < now() then
    update public.offers set status = 'expired', responded_at = now() where id = v_offer.id;
    insert into public.offer_events (offer_id, actor_id, event) values (v_offer.id, auth.uid(), 'expired');
    v_response := jsonb_build_object('ok', false, 'error', 'OFFER_EXPIRED', 'offer_id', v_offer.id);
    perform app_private.idem_store('accept_offer', p_idempotency_key, v_request, v_response);
    return v_response;
  end if;

  select * into v_listing from public.harvest_listings where id = v_offer.listing_id for update;
  if v_listing.status not in ('published', 'partially_reserved') or v_listing.available_until < current_date then
    raise exception 'listing is not open (%)', v_listing.status using errcode = '55000', hint = 'LISTING_NOT_OPEN';
  end if;
  if v_offer.unit <> v_listing.unit then
    raise exception 'unit mismatch' using errcode = '22023';
  end if;
  if v_listing.available_quantity < v_offer.quantity then
    raise exception 'only % % available', v_listing.available_quantity, v_listing.unit using errcode = '23514', hint = 'INSUFFICIENT_STOCK';
  end if;
  if v_listing.min_price_paise_per_unit is not null and v_offer.price_paise_per_unit < v_listing.min_price_paise_per_unit then
    raise exception 'price is below the listing minimum' using errcode = '23514', hint = 'BELOW_MIN_PRICE';
  end if;

  -- Reserve stock atomically (constraint harvest_quantity_balance double-checks the arithmetic).
  perform set_config('app.trusted_inventory_write', 'on', true);
  update public.harvest_listings
     set available_quantity = available_quantity - v_offer.quantity,
         reserved_quantity = reserved_quantity + v_offer.quantity
   where id = v_listing.id and available_quantity >= v_offer.quantity;
  if not found then
    raise exception 'stock changed concurrently' using errcode = '40001', hint = 'INSUFFICIENT_STOCK';
  end if;
  perform set_config('app.trusted_inventory_write', 'off', true);
  perform app_private.refresh_listing_status(v_listing.id);

  -- Server-calculated money (integer paise; banker-free half-up rounding).
  v_gross := round(v_offer.quantity * v_offer.price_paise_per_unit)::bigint;
  v_handling := round(v_offer.quantity * v_listing.seller_handling_paise_per_unit)::bigint;

  update public.offers set status = 'accepted', responded_at = now() where id = v_offer.id;
  insert into public.offer_events (offer_id, actor_id, event) values (v_offer.id, auth.uid(), 'accepted');

  insert into public.orders (order_number, offer_id, listing_id, demand_id, farmer_id, buyer_id, commodity_id, quantity, unit,
    price_paise_per_unit, gross_paise, delivery_terms, terms_snapshot, is_demo)
  values ('KS-' || to_char(now(), 'YYMM') || '-' || nextval('public.order_number_seq'), v_offer.id, v_listing.id, v_offer.demand_id,
    v_offer.farmer_id, v_offer.buyer_id, v_listing.commodity_id, v_offer.quantity, v_offer.unit, v_offer.price_paise_per_unit, v_gross,
    v_offer.delivery_terms,
    jsonb_build_object(
      'listing_title', v_listing.title, 'grade', v_listing.grade, 'quality_notes', v_listing.quality_notes,
      'commodity_id', v_listing.commodity_id, 'variety_id', v_listing.variety_id,
      'quantity', v_offer.quantity, 'unit', v_offer.unit, 'price_paise_per_unit', v_offer.price_paise_per_unit,
      'delivery_terms', v_offer.delivery_terms, 'offer_version', v_offer.version,
      'pickup_area', v_listing.district || ', ' || v_listing.state, 'accepted_at', now(), 'accepted_by', v_actor),
    v_listing.is_demo)
  returning * into v_order;

  if v_handling > 0 then
    insert into public.order_cost_lines (order_id, label, payer, amount_paise, source, certainty)
    values (v_order.id, 'Packing / handling (seller-agreed)', 'farmer', v_handling, 'Listing handling rate x quantity', 'confirmed');
  end if;
  if v_offer.transport_estimate_paise > 0 and v_offer.delivery_terms <> 'buyer_collects' then
    insert into public.order_cost_lines (order_id, label, payer, amount_paise, source, certainty)
    values (v_order.id, 'Transport (estimate)', case when v_offer.delivery_terms = 'seller_pays_transport' then 'farmer' else 'buyer' end,
      v_offer.transport_estimate_paise, coalesce(v_offer.transport_estimate_source, 'Offer transport estimate'), 'estimated');
  end if;

  insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role, note)
  values (v_order.id, null, 'confirmed', auth.uid(), v_actor, 'Offer v' || v_offer.version || ' accepted; stock reserved');

  -- Demand fill bookkeeping (in the demand's own unit, explicit conversion).
  if v_offer.demand_id is not null then
    perform set_config('app.trusted_inventory_write', 'on', true);
    update public.demand_requests d
       set filled_quantity = least(d.quantity, d.filled_quantity +
             v_offer.quantity * app_private.unit_to_kg_factor(v_offer.unit) / app_private.unit_to_kg_factor(d.unit)),
           status = case when d.filled_quantity + v_offer.quantity * app_private.unit_to_kg_factor(v_offer.unit) / app_private.unit_to_kg_factor(d.unit) >= d.quantity
                         then 'filled' else 'partially_filled' end
     where d.id = v_offer.demand_id and d.status in ('open', 'partially_filled');
    perform set_config('app.trusted_inventory_write', 'off', true);
  end if;

  -- Close open offers that can no longer be satisfied.
  with closed as (
    update public.offers o set status = 'rejected', status_reason = 'Insufficient remaining stock', responded_at = now()
     where o.listing_id = v_listing.id and o.status = 'submitted' and o.id <> v_offer.id
       and o.quantity > (select available_quantity from public.harvest_listings where id = v_listing.id)
    returning o.id, o.buyer_id
  ), ev as (
    insert into public.offer_events (offer_id, actor_id, event) select id, auth.uid(), 'closed_insufficient_stock' from closed
  )
  select count(*) into v_closed from closed;

  perform app_private.notify(case when v_actor = 'farmer' then v_offer.buyer_id else v_offer.farmer_id end,
    'offer_accepted', 'Offer accepted - order ' || v_order.order_number, v_listing.title, '/orders/' || v_order.id);
  perform app_private.audit('offer.accepted', 'orders', v_order.id::text,
    jsonb_build_object('offer_id', v_offer.id, 'listing_id', v_listing.id, 'quantity', v_offer.quantity, 'closed_offers', v_closed));

  v_response := jsonb_build_object('ok', true, 'order_id', v_order.id, 'order_number', v_order.order_number,
    'gross_paise', v_gross, 'closed_offers', v_closed);
  perform app_private.idem_store('accept_offer', p_idempotency_key, v_request, v_response);
  return v_response;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: order state machine
-- ---------------------------------------------------------------------------
create or replace function public.transition_order(p_order_id uuid, p_to_status text, p_note text default null, p_pickup_date date default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_actor text;
  v_from text;
  v_allowed boolean := false;
begin
  perform app_private.require_verified_role(null);
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  v_actor := case when auth.uid() = v_order.farmer_id then 'farmer'
                  when auth.uid() = v_order.buyer_id then 'buyer'
                  when auth.uid() = v_order.logistics_provider_id and app_private.has_role('logistics') then 'logistics' end;
  if v_actor is null then raise exception 'not a party to this order' using errcode = '42501', hint = 'NOT_PARTY'; end if;

  v_allowed := case
    when v_order.status = 'confirmed' and p_to_status = 'pickup_scheduled' then v_actor in ('farmer', 'logistics')
    when v_order.status = 'pickup_scheduled' and p_to_status = 'in_transit' then v_actor in ('farmer', 'logistics')
    when v_order.status = 'in_transit' and p_to_status = 'delivered' then v_actor = 'buyer'   -- recipient confirmation is the proof of delivery
    when v_order.status = 'delivered' and p_to_status = 'completed' then v_actor in ('buyer', 'farmer')
    when v_order.status in ('confirmed', 'pickup_scheduled') and p_to_status = 'cancelled' then v_actor in ('buyer', 'farmer')
    when v_order.status in ('in_transit', 'delivered') and p_to_status = 'disputed' then v_actor in ('buyer', 'farmer')
    else false end;
  if not v_allowed then
    raise exception 'illegal transition % -> % for %', v_order.status, p_to_status, v_actor using errcode = '55000', hint = 'ILLEGAL_TRANSITION';
  end if;
  if p_to_status = 'pickup_scheduled' and p_pickup_date is null then
    raise exception 'pickup date required' using errcode = '22023';
  end if;

  perform set_config('app.trusted_inventory_write', 'on', true);
  if p_to_status = 'cancelled' then
    update public.harvest_listings set available_quantity = available_quantity + v_order.quantity,
           reserved_quantity = reserved_quantity - v_order.quantity where id = v_order.listing_id;
  elsif p_to_status = 'delivered' then
    update public.harvest_listings set reserved_quantity = reserved_quantity - v_order.quantity,
           sold_quantity = sold_quantity + v_order.quantity where id = v_order.listing_id;
  end if;
  perform set_config('app.trusted_inventory_write', 'off', true);
  perform app_private.refresh_listing_status(v_order.listing_id);

  v_from := v_order.status;
  update public.orders set status = p_to_status, updated_at = now(),
         pickup_date = coalesce(p_pickup_date, pickup_date)
   where id = v_order.id returning * into v_order;
  insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role, note)
  values (v_order.id, v_from, p_to_status, auth.uid(), v_actor, left(p_note, 300));

  perform app_private.notify(x.uid, 'order_update', 'Order ' || v_order.order_number || ': ' || replace(p_to_status, '_', ' '), left(p_note, 200), '/orders/' || v_order.id)
     from (select unnest(array[v_order.farmer_id, v_order.buyer_id, v_order.logistics_provider_id]) as uid) x
    where x.uid is not null and x.uid <> auth.uid();
  perform app_private.audit('order.transition', 'orders', v_order.id::text, jsonb_build_object('to', p_to_status, 'actor_role', v_actor));
  return v_order;
end $$;

-- Assign an approved logistics provider (seller side).
create or replace function public.assign_logistics(p_order_id uuid, p_provider_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  perform app_private.require_verified_role('farmer');
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.farmer_id <> auth.uid() then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('confirmed', 'pickup_scheduled') then
    raise exception 'logistics can only be assigned before transit' using errcode = '55000';
  end if;
  if not exists (select 1 from public.user_roles r where r.user_id = p_provider_id and r.role = 'logistics' and r.status = 'active') then
    raise exception 'provider is not an approved logistics partner' using errcode = '42501';
  end if;
  update public.orders set logistics_provider_id = p_provider_id, updated_at = now() where id = p_order_id returning * into v_order;
  insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role, note)
  values (v_order.id, v_order.status, v_order.status, auth.uid(), 'farmer', 'Logistics partner assigned');
  perform app_private.notify(p_provider_id, 'order_update', 'New delivery job ' || v_order.order_number, null, '/logistics');
  perform app_private.audit('order.logistics_assigned', 'orders', v_order.id::text, jsonb_build_object('provider_id', p_provider_id));
  return v_order;
end $$;

create or replace function public.list_logistics_providers()
returns table (id uuid, display_name text, district text, state text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.district, p.state from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'logistics' and r.status = 'active'
  where auth.uid() is not null
  order by p.display_name limit 100
$$;

-- Logistics view: delivery-only fields, exact addresses only while the job is active.
create or replace function public.logistics_jobs()
returns table (order_id uuid, order_number text, status text, commodity text, quantity numeric, unit text, pickup_date date,
  pickup_area text, pickup_address text, pickup_lat numeric, pickup_lng numeric, pickup_phone text,
  delivery_area text, delivery_address text, delivery_phone text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.order_number, o.status, c.name_en, o.quantity, o.unit, o.pickup_date,
         l.district || ', ' || l.state,
         case when o.status in ('pickup_scheduled', 'in_transit') then pl.address_line end,
         case when o.status in ('pickup_scheduled', 'in_transit') then pl.lat end,
         case when o.status in ('pickup_scheduled', 'in_transit') then pl.lng end,
         case when o.status in ('pickup_scheduled', 'in_transit') then pl.contact_phone end,
         coalesce(d.delivery_district || ', ' || d.delivery_state, 'Set by buyer'),
         case when o.status in ('pickup_scheduled', 'in_transit') then dd.address_line end,
         case when o.status in ('pickup_scheduled', 'in_transit') then dd.contact_phone end,
         o.updated_at
    from public.orders o
    join public.harvest_listings l on l.id = o.listing_id
    join public.commodities c on c.id = o.commodity_id
    left join public.demand_requests d on d.id = o.demand_id
    left join public.harvest_pickup_locations pl on pl.listing_id = o.listing_id
    left join public.order_delivery_details dd on dd.order_id = o.id
   where o.logistics_provider_id = auth.uid() and app_private.has_role('logistics')
   order by o.updated_at desc
$$;

-- Party predicates for RLS on related private rows.
create or replace function app_private.is_order_party(p_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o where o.id = p_order_id and auth.uid() in (o.farmer_id, o.buyer_id))
$$;
create or replace function app_private.can_see_pickup(p_listing_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o where o.listing_id = p_listing_id and (
      (o.buyer_id = auth.uid() and o.status in ('confirmed', 'pickup_scheduled', 'in_transit')) or
      (o.logistics_provider_id = auth.uid() and o.status in ('pickup_scheduled', 'in_transit'))))
$$;
create or replace function app_private.has_offer_on_listing(p_listing_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.offers o where o.listing_id = p_listing_id and o.buyer_id = auth.uid())
$$;
revoke all on function app_private.is_order_party(uuid), app_private.can_see_pickup(uuid), app_private.has_offer_on_listing(uuid) from public;
grant execute on function app_private.is_order_party(uuid), app_private.can_see_pickup(uuid), app_private.has_offer_on_listing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.commodities enable row level security;
alter table public.crop_varieties enable row level security;
alter table public.harvest_listings enable row level security;
alter table public.harvest_pickup_locations enable row level security;
alter table public.harvest_media enable row level security;
alter table public.demand_requests enable row level security;
alter table public.offers enable row level security;
alter table public.offer_events enable row level security;
alter table public.orders enable row level security;
alter table public.order_cost_lines enable row level security;
alter table public.order_events enable row level security;
alter table public.order_delivery_details enable row level security;

revoke all on public.commodities, public.crop_varieties, public.harvest_listings, public.harvest_pickup_locations,
  public.harvest_media, public.demand_requests, public.offers, public.offer_events, public.orders,
  public.order_cost_lines, public.order_events, public.order_delivery_details from anon, authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;

grant select on public.commodities, public.crop_varieties to anon, authenticated;
create policy commodities_read on public.commodities for select to anon, authenticated using (true);
create policy varieties_read on public.crop_varieties for select to anon, authenticated using (true);

-- Listings
grant select on public.harvest_listings to anon, authenticated;
grant insert (id, farmer_id, commodity_id, variety_id, title, grade, quality_notes, unit, total_quantity, min_price_paise_per_unit,
  asking_price_paise_per_unit, seller_handling_paise_per_unit, harvest_date, available_from, available_until, state, district,
  locality, approx_lat, approx_lng, status) on public.harvest_listings to authenticated;
grant update (variety_id, title, grade, quality_notes, total_quantity, min_price_paise_per_unit, asking_price_paise_per_unit,
  seller_handling_paise_per_unit, harvest_date, available_from, available_until, state, district, locality, approx_lat, approx_lng,
  status, commodity_id, unit) on public.harvest_listings to authenticated;
create policy listings_public_read on public.harvest_listings for select to anon, authenticated
  using (status in ('published', 'partially_reserved') and available_until >= current_date);
create policy listings_owner_read on public.harvest_listings for select to authenticated
  using (farmer_id = (select auth.uid()) or (select app_private.has_offer_on_listing(id)) or (select app_private.is_support_or_admin()));
create policy listings_owner_insert on public.harvest_listings for insert to authenticated
  with check (farmer_id = (select auth.uid()) and (select app_private.has_role('farmer')) and (select app_private.is_email_verified()));
create policy listings_owner_update on public.harvest_listings for update to authenticated
  using (farmer_id = (select auth.uid()) and (select app_private.has_role('farmer')))
  with check (farmer_id = (select auth.uid()));

-- Pickup location: owner writes; parties read per can_see_pickup().
grant select, insert (listing_id, farmer_id, address_line, lat, lng, contact_phone),
  update (address_line, lat, lng, contact_phone) on public.harvest_pickup_locations to authenticated;
create policy pickup_read on public.harvest_pickup_locations for select to authenticated
  using (farmer_id = (select auth.uid()) or (select app_private.can_see_pickup(listing_id)));
create policy pickup_insert on public.harvest_pickup_locations for insert to authenticated
  with check (farmer_id = (select auth.uid()) and exists (select 1 from public.harvest_listings l where l.id = listing_id and l.farmer_id = (select auth.uid())));
create policy pickup_update on public.harvest_pickup_locations for update to authenticated
  using (farmer_id = (select auth.uid())) with check (farmer_id = (select auth.uid()));

-- Media metadata
grant select on public.harvest_media to anon, authenticated;
grant insert (listing_id, farmer_id, storage_path), delete on public.harvest_media to authenticated;
create policy media_read on public.harvest_media for select to anon, authenticated
  using (exists (select 1 from public.harvest_listings l where l.id = listing_id));
create policy media_insert on public.harvest_media for insert to authenticated
  with check (farmer_id = (select auth.uid())
    and exists (select 1 from public.harvest_listings l where l.id = listing_id and l.farmer_id = (select auth.uid()))
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and split_part(storage_path, '/', 2) = listing_id::text);
create policy media_delete on public.harvest_media for delete to authenticated using (farmer_id = (select auth.uid()));

-- Demand
grant select on public.demand_requests to anon, authenticated;
grant insert (id, buyer_id, commodity_id, variety_id, title, min_grade, quantity, unit, max_price_paise_per_unit, delivery_from,
  delivery_until, delivery_state, delivery_district, delivery_locality, approx_lat, approx_lng, max_transit_hours, buyer_type,
  visibility, status, notes) on public.demand_requests to authenticated;
grant update (variety_id, title, min_grade, quantity, max_price_paise_per_unit, delivery_from, delivery_until, delivery_state,
  delivery_district, delivery_locality, approx_lat, approx_lng, max_transit_hours, buyer_type, visibility, status, notes,
  commodity_id, unit) on public.demand_requests to authenticated;
create policy demand_public_read on public.demand_requests for select to anon, authenticated
  using (visibility = 'public' and status in ('open', 'partially_filled') and delivery_until >= current_date);
create policy demand_owner_read on public.demand_requests for select to authenticated
  using (buyer_id = (select auth.uid()) or (select app_private.is_support_or_admin())
    or exists (select 1 from public.offers o where o.demand_id = demand_requests.id and o.farmer_id = (select auth.uid())));
create policy demand_owner_insert on public.demand_requests for insert to authenticated
  with check (buyer_id = (select auth.uid()) and (select app_private.has_role('buyer')) and (select app_private.is_email_verified()));
create policy demand_owner_update on public.demand_requests for update to authenticated
  using (buyer_id = (select auth.uid())) with check (buyer_id = (select auth.uid()));

-- Offers & events: parties only. Writes via RPC.
grant select on public.offers, public.offer_events to authenticated;
create policy offers_party_read on public.offers for select to authenticated
  using ((select auth.uid()) in (buyer_id, farmer_id) or (select app_private.is_support_or_admin()));
create policy offer_events_party_read on public.offer_events for select to authenticated
  using (exists (select 1 from public.offers o where o.id = offer_id and (select auth.uid()) in (o.buyer_id, o.farmer_id)));

-- Orders: buyer + farmer. Logistics use logistics_jobs() (delivery-only fields).
grant select on public.orders, public.order_cost_lines, public.order_events to authenticated;
create policy orders_party_read on public.orders for select to authenticated
  using ((select auth.uid()) in (buyer_id, farmer_id) or (select app_private.is_support_or_admin()));
create policy order_cost_lines_party_read on public.order_cost_lines for select to authenticated
  using ((select app_private.is_order_party(order_id)) or (select app_private.is_support_or_admin()));
create policy order_events_party_read on public.order_events for select to authenticated
  using ((select app_private.is_order_party(order_id)) or (select app_private.is_support_or_admin()));

grant select, insert (order_id, buyer_id, address_line, contact_phone, instructions),
  update (address_line, contact_phone, instructions) on public.order_delivery_details to authenticated;
create policy delivery_details_read on public.order_delivery_details for select to authenticated
  using ((select app_private.is_order_party(order_id)));
create policy delivery_details_insert on public.order_delivery_details for insert to authenticated
  with check (buyer_id = (select auth.uid()) and exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));
create policy delivery_details_update on public.order_delivery_details for update to authenticated
  using (buyer_id = (select auth.uid())) with check (buyer_id = (select auth.uid()));

revoke all on function public.submit_offer(uuid, numeric, bigint, text, text, uuid, integer, bigint, text, uuid),
  public.counter_offer(uuid, bigint, numeric, text), public.respond_offer(uuid, text, text), public.accept_offer(uuid, text),
  public.transition_order(uuid, text, text, date), public.assign_logistics(uuid, uuid), public.list_logistics_providers(),
  public.logistics_jobs() from public, anon;
grant execute on function public.submit_offer(uuid, numeric, bigint, text, text, uuid, integer, bigint, text, uuid),
  public.counter_offer(uuid, bigint, numeric, text), public.respond_offer(uuid, text, text), public.accept_offer(uuid, text),
  public.transition_order(uuid, text, text, date), public.assign_logistics(uuid, uuid), public.list_logistics_providers(),
  public.logistics_jobs() to authenticated;
