-- Local development only. DO NOT run this against a Supabase project.
--
-- Supabase provides the `auth` schema, the `auth.users` table and the
-- anon/authenticated/service_role roles out of the box. A plain Postgres does
-- not, so this recreates just enough of that surface for the RLS policies and
-- the test suite to behave identically on a laptop.
--
-- Apply with:  psql "$DATABASE_URL" -f supabase/local-bootstrap.sql

/* ----------------------------- roles ----------------------------- */

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- The connecting role must be able to `set role authenticated`.
grant anon, authenticated, service_role to postgres;

/* ----------------------------- auth schema ----------------------------- */

create schema if not exists auth;

-- Mirrors the columns of Supabase's auth.users that this app actually reads.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

/* --------------------------- auth.uid() shim --------------------------- */

-- Supabase ships this; defined here so local and hosted behave the same.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid
$$;

/* ------------------------------- grants ------------------------------- */

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants table privileges to these roles by default; RLS, not GRANT,
-- is what actually restricts row visibility.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
