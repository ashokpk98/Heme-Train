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

/* --------------------------- extensions schema -------------------------- */

-- Supabase installs pgcrypto into `extensions`; the generated SQL calls
-- extensions.crypt() and extensions.gen_random_uuid() by that path.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

/* ----------------------------- auth schema ----------------------------- */

create schema if not exists auth;

-- Mirrors the shape of Supabase's auth.users closely enough that SQL written
-- against a real project runs here unchanged. Not every column is present on
-- Supabase-managed instances' newer revisions, but these are the stable ones
-- the generated seed touches.
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default extensions.gen_random_uuid(),
  aud varchar(255),
  role varchar(255),
  email varchar(255) unique,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  is_sso_user boolean not null default false,
  is_anonymous boolean not null default false,
  banned_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /*
   * These are here to reproduce a real failure, not for completeness.
   *
   * GoTrue's Go structs map every one of these to a plain `string`, which
   * cannot hold NULL. Supabase declares them nullable with no default, so a
   * row inserted by hand that omits them stores NULL — and then *any* query
   * touching that user crashes the auth service:
   *
   *   sql: Scan error on column index 3, name "confirmation_token":
   *   converting NULL to string is unsupported
   *
   * That surfaces as HTTP 500 "Database error querying schema" on sign-in, and
   * it breaks the Admin API too, so listing or updating the user cannot repair
   * it either. Every column is present in the database and the password hash
   * verifies correctly — the row looks perfect from SQL.
   *
   * Declared nullable with no default deliberately, exactly as Supabase has
   * them, so the seed is tested against the shape that actually bites rather
   * than a forgiving one.
   */
  confirmation_token varchar(255),
  recovery_token varchar(255),
  email_change varchar(255),
  email_change_token_new varchar(255),
  email_change_token_current varchar(255),
  phone_change varchar(255),
  phone_change_token varchar(255),
  reauthentication_token varchar(255)
);

-- GoTrue requires an identities row per provider for email/password sign-in.
create table if not exists auth.identities (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, provider)
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
