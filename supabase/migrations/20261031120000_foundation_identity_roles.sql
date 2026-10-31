-- SEED X 01 - foundation: private helper schema, identity, roles, audit, notifications, idempotency.
-- Conventions: uuid PKs, timestamptz, money in integer paise (bigint), quantities numeric(14,3) + explicit unit.
-- Every exposed table has RLS enabled and explicit grants (see the end of each migration).

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Explicit, tested unit conversion. Never infer a unit from a number.
create or replace function app_private.unit_to_kg_factor(p_unit text) returns numeric
language sql immutable set search_path = '' as $$
  select case p_unit when 'kg' then 1::numeric when 'quintal' then 100::numeric when 'tonne' then 1000::numeric end
$$;

-- ---------------------------------------------------------------------------
-- Profiles: public-safe fields only. Private contact data lives in profile_private.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'SEED X user' check (char_length(display_name) between 1 and 80),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'hi')),
  state text check (char_length(state) <= 80),
  district text check (char_length(district) <= 80),
  bio text check (char_length(bio) <= 500),
  onboarding_completed boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Public-safe profile summary. Never store phone, email or exact address here.';

create table public.profile_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  phone text check (phone ~ '^[0-9+ -]{6,20}$'),
  address_line text check (char_length(address_line) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function app_private.touch_updated_at();
create trigger profile_private_touch before update on public.profile_private
  for each row execute function app_private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Roles. Grants are trusted server-side records; signup metadata never grants a role.
-- ---------------------------------------------------------------------------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('farmer', 'buyer', 'landowner', 'seed_seller', 'logistics', 'support', 'admin')),
  status text not null default 'requested' check (status in ('requested', 'active', 'rejected', 'revoked')),
  request_note text check (char_length(request_note) <= 500),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  review_note text check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);
create index user_roles_user_status_idx on public.user_roles (user_id, status);
create trigger user_roles_touch before update on public.user_roles
  for each row execute function app_private.touch_updated_at();

-- Trusted predicates used by RLS policies and RPCs.
create or replace function app_private.has_role(p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = p_role and r.status = 'active'
  )
$$;

create or replace function app_private.is_email_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
$$;

-- Admin requires an active admin grant AND an MFA-verified session (AAL2) on the JWT.
create or replace function app_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.has_role('admin') and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function app_private.is_support_or_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_admin()
      or (app_private.has_role('support') and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2')
$$;

create or replace function app_private.require_verified_role(p_role text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not app_private.is_email_verified() then
    raise exception 'email verification required' using errcode = '42501', hint = 'EMAIL_NOT_VERIFIED';
  end if;
  if p_role is not null and not app_private.has_role(p_role) then
    raise exception 'role % required', p_role using errcode = '42501', hint = 'ROLE_REQUIRED';
  end if;
end $$;

revoke all on function app_private.has_role(text), app_private.is_email_verified(), app_private.is_admin(),
  app_private.is_support_or_admin(), app_private.require_verified_role(text) from public;
grant execute on function app_private.has_role(text), app_private.is_email_verified(), app_private.is_admin(),
  app_private.is_support_or_admin(), app_private.require_verified_role(text) to authenticated, anon, service_role;

-- Prevent anyone except the trusted admin path from changing role status/role/user.
create or replace function app_private.guard_user_roles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('app.trusted_role_write', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'role grants must be requested through request_role()' using errcode = '42501';
  end if;
  raise exception 'role grants can only be changed by the trusted review workflow' using errcode = '42501';
end $$;
create trigger user_roles_guard before insert or update on public.user_roles
  for each row when (current_user in ('authenticated', 'anon'))
  execute function app_private.guard_user_roles();

-- ---------------------------------------------------------------------------
-- Audit log (append-only for normal users) and notifications
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (char_length(action) <= 80),
  resource_type text not null check (char_length(resource_type) <= 60),
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

create or replace function app_private.audit(p_action text, p_resource_type text, p_resource_id text, p_metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (auth.uid(), p_action, p_resource_type, p_resource_id, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke all on function app_private.audit(text, text, text, jsonb) from public;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_withdrawn',
    'order_update', 'seed_order_update', 'role_update', 'listing_moderated', 'security', 'match_proposal')),
  title text not null check (char_length(title) <= 160),
  body text check (char_length(body) <= 500),
  link text check (link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

create or replace function app_private.notify(p_recipient uuid, p_type text, p_title text, p_body text, p_link text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (recipient_id, type, title, body, link, payload)
  values (p_recipient, p_type, p_title, p_body, p_link, coalesce(p_payload, '{}'::jsonb));
$$;
revoke all on function app_private.notify(uuid, text, text, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Idempotency keys: scoped by actor + operation; reuse with another payload is rejected.
-- ---------------------------------------------------------------------------
create table public.idempotency_keys (
  actor_id uuid not null,
  operation text not null,
  idem_key text not null check (char_length(idem_key) between 8 and 100),
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, operation, idem_key)
);

create or replace function app_private.idem_lookup(p_operation text, p_key text, p_request jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row public.idempotency_keys;
  v_hash text := md5(p_request::text);
begin
  if p_key is null or char_length(p_key) < 8 then
    raise exception 'idempotency key required (8-100 chars)' using errcode = '22023';
  end if;
  select * into v_row from public.idempotency_keys
   where actor_id = auth.uid() and operation = p_operation and idem_key = p_key;
  if not found then
    return null;
  end if;
  if v_row.request_hash <> v_hash then
    raise exception 'idempotency key reused with a different payload' using errcode = '22023', hint = 'IDEMPOTENCY_CONFLICT';
  end if;
  return v_row.response || jsonb_build_object('replayed', true);
end $$;

create or replace function app_private.idem_store(p_operation text, p_key text, p_request jsonb, p_response jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.idempotency_keys (actor_id, operation, idem_key, request_hash, response)
  values (auth.uid(), p_operation, p_key, md5(p_request::text), p_response);
$$;
revoke all on function app_private.idem_lookup(text, text, jsonb), app_private.idem_store(text, text, jsonb, jsonb) from public;

-- ---------------------------------------------------------------------------
-- New auth user -> profile. Display name/language from metadata are cosmetic only;
-- roles are NEVER taken from signup metadata.
-- ---------------------------------------------------------------------------
create or replace function app_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'SEED X user'), 80);
  v_lang text := case when new.raw_user_meta_data ->> 'preferred_language' = 'hi' then 'hi' else 'en' end;
begin
  insert into public.profiles (id, display_name, preferred_language) values (new.id, v_name, v_lang)
  on conflict (id) do nothing;
  insert into public.profile_private (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function app_private.handle_new_user() from public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role request workflow
-- farmer/buyer: self-service, activated once the email is verified.
-- landowner/seed_seller/logistics: require admin review.
-- support/admin: never requestable from the app.
-- ---------------------------------------------------------------------------
create or replace function public.request_role(p_role text, p_note text default null)
returns public.user_roles language plpgsql security definer set search_path = '' as $$
declare
  v_row public.user_roles;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_role not in ('farmer', 'buyer', 'landowner', 'seed_seller', 'logistics') then
    raise exception 'role % cannot be requested', p_role using errcode = '42501', hint = 'ROLE_NOT_REQUESTABLE';
  end if;
  if not app_private.is_email_verified() then
    raise exception 'email verification required' using errcode = '42501', hint = 'EMAIL_NOT_VERIFIED';
  end if;
  v_status := case when p_role in ('farmer', 'buyer') then 'active' else 'requested' end;

  perform set_config('app.trusted_role_write', 'on', true);
  insert into public.user_roles (user_id, role, status, request_note, reviewed_at)
  values (auth.uid(), p_role, v_status, left(p_note, 500), case when v_status = 'active' then now() end)
  on conflict (user_id, role) do update
    set request_note = excluded.request_note,
        -- a rejected request may be re-submitted; a revoked role stays revoked until an admin acts.
        status = case when public.user_roles.status = 'rejected' then v_status else public.user_roles.status end
  returning * into v_row;
  perform set_config('app.trusted_role_write', 'off', true);

  perform app_private.audit('role.requested', 'user_roles', v_row.id::text, jsonb_build_object('role', p_role, 'status', v_row.status));
  return v_row;
end $$;

-- Admin review. Requires AAL2 admin session; cannot grant admin/support through this path.
create or replace function public.admin_review_role(p_role_id uuid, p_decision text, p_note text default null)
returns public.user_roles language plpgsql security definer set search_path = '' as $$
declare
  v_row public.user_roles;
begin
  if not app_private.is_admin() then
    raise exception 'admin with MFA (aal2) required' using errcode = '42501', hint = 'ADMIN_AAL2_REQUIRED';
  end if;
  if p_decision not in ('active', 'rejected', 'revoked') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  select * into v_row from public.user_roles where id = p_role_id for update;
  if not found then
    raise exception 'role request not found' using errcode = 'P0002';
  end if;
  if v_row.role in ('admin', 'support') and p_decision = 'active' then
    raise exception 'admin/support grants use the owner-only grant procedure' using errcode = '42501';
  end if;
  if v_row.user_id = auth.uid() then
    raise exception 'admins cannot review their own role' using errcode = '42501';
  end if;
  perform set_config('app.trusted_role_write', 'on', true);
  update public.user_roles
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 500)
   where id = p_role_id
  returning * into v_row;
  perform set_config('app.trusted_role_write', 'off', true);
  perform app_private.audit('role.reviewed', 'user_roles', v_row.id::text,
    jsonb_build_object('role', v_row.role, 'decision', p_decision, 'user_id', v_row.user_id));
  perform app_private.notify(v_row.user_id, 'role_update', 'Role ' || v_row.role || ': ' || p_decision, p_note, '/profile');
  return v_row;
end $$;

-- Owner-only bootstrap for admin/support. Executable only by the database owner
-- (run from the Supabase SQL editor). There is no app path to this function.
create or replace function app_private.owner_grant_staff_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if p_role not in ('admin', 'support') then
    raise exception 'only admin/support' using errcode = '22023';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(p_email) and email_confirmed_at is not null;
  if v_uid is null then
    raise exception 'no verified user with that email' using errcode = 'P0002';
  end if;
  perform set_config('app.trusted_role_write', 'on', true);
  insert into public.user_roles (user_id, role, status, reviewed_at, review_note)
  values (v_uid, p_role, 'active', now(), 'granted by project owner')
  on conflict (user_id, role) do update set status = 'active', reviewed_at = now(), review_note = 'granted by project owner';
  perform set_config('app.trusted_role_write', 'off', true);
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (null, 'role.owner_granted', 'user_roles', v_uid::text, jsonb_build_object('role', p_role));
end $$;
revoke all on function app_private.owner_grant_staff_role(text, text) from public, anon, authenticated, service_role;

-- Mark all notifications read for the caller.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  update public.notifications set read_at = now()
   where recipient_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.idempotency_keys enable row level security;

revoke all on public.profiles, public.profile_private, public.user_roles, public.audit_logs,
  public.notifications, public.idempotency_keys from anon, authenticated;

-- profiles: safe summary readable by everyone; owner edits cosmetic fields only.
grant select on public.profiles to anon, authenticated;
grant update (display_name, preferred_language, state, district, bio, onboarding_completed) on public.profiles to authenticated;
create policy profiles_select_all on public.profiles for select to anon, authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- profile_private: owner only (admin/support read for legitimate support, audited in RPCs).
grant select, update (phone, address_line) on public.profile_private to authenticated;
create policy profile_private_select_own on public.profile_private for select to authenticated
  using (id = (select auth.uid()) or (select app_private.is_support_or_admin()));
create policy profile_private_update_own on public.profile_private for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_roles: users see their own; admins see all. Writes only via RPCs.
grant select on public.user_roles to authenticated;
create policy user_roles_select_own on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.is_admin()));

-- audit logs: admin read only; nobody updates/deletes through the API.
grant select on public.audit_logs to authenticated;
create policy audit_logs_admin_select on public.audit_logs for select to authenticated
  using ((select app_private.is_admin()));

-- notifications: recipient reads and marks read.
grant select, update (read_at) on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- idempotency_keys: no direct API access (RLS on, no policies, no grants).

revoke all on function public.request_role(text, text), public.admin_review_role(uuid, text, text),
  public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.request_role(text, text), public.admin_review_role(uuid, text, text),
  public.mark_notifications_read(uuid[]) to authenticated;
