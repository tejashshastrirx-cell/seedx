-- SEED X 05 - brand migration (renamed from the original working name to SEED X).
-- Migrations 01-03 are applied history and stay unchanged; this migration supersedes their
-- user-facing brand text. No tables, columns, buckets, roles or project identifiers are renamed.

-- 1. Default display name for new profiles.
alter table public.profiles alter column display_name set default 'SEED X user';
update public.profiles set display_name = 'SEED X user' where display_name = 'SEED X user';

-- 2. Redefine two functions in place by rewriting only the brand literal (grants are preserved by CREATE OR REPLACE).
do $$
declare d text;
begin
  d := pg_get_functiondef('app_private.handle_new_user()'::regprocedure);
  if strpos(d, '''SEED X user''') > 0 then
    execute replace(d, '''SEED X user''', '''SEED X user''');
  end if;
  -- New marketplace order numbers use the SX- prefix. Existing order numbers are never rewritten.
  d := pg_get_functiondef('public.accept_offer(uuid,text)'::regprocedure);
  if strpos(d, '''KS-''') > 0 then
    execute replace(d, '''KS-''', '''SX-''');
  end if;
end $$;
