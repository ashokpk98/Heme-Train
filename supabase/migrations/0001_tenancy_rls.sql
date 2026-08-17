-- HEME — tenancy, signup wiring, and row level security.
--
-- Run AFTER the Drizzle schema exists (`npm run db:push`), because this file
-- only adds functions, triggers and policies to tables Drizzle owns.
--
-- Isolation model
--   * An organisation is the tenant boundary.
--   * Inside an organisation, a coach sees only rows they own. Ownership lives
--     on three roots: athletes, groups, programs (`owner_coach_id`).
--   * Everything else inherits visibility from one of those roots via a single
--     denormalised column, so no policy walks more than one join.
--
-- All helper functions are SECURITY DEFINER with an empty search_path. That is
-- deliberate: it stops policy subqueries from re-triggering RLS on the parent
-- table (which would nest policy evaluation per row), and it is the standard
-- hardening for definer functions.

begin;

/* ==================================================================== *
 * 1. Identity helpers
 * ==================================================================== */

create or replace function public.auth_uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid
$$;

comment on function public.auth_uid() is
  'The signed-in user id, read from the request JWT. Null when unauthenticated.';

-- SECURITY DEFINER so reading public.users here does not recurse into the
-- policy on public.users.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.org_id from public.users u where u.id = public.auth_uid()
$$;

comment on function public.current_org_id() is
  'Organisation of the signed-in user. The join-free tenant gate in every policy.';

/* ==================================================================== *
 * 2. Ownership predicates
 *
 * One indexed primary-key lookup each. SECURITY DEFINER keeps the parent
 * table''s own RLS out of the inner query.
 * ==================================================================== */

create or replace function public.owns_athlete(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.athletes a
    where a.id = p_athlete_id
      and a.org_id = public.current_org_id()
      and a.owner_coach_id = public.auth_uid()
  )
$$;

create or replace function public.owns_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id
      and g.org_id = public.current_org_id()
      and g.owner_coach_id = public.auth_uid()
  )
$$;

-- Readable: mine, or shared org-wide as a template.
create or replace function public.can_read_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.programs p
    where p.id = p_program_id
      and p.org_id = public.current_org_id()
      and (p.owner_coach_id = public.auth_uid() or p.is_org_shared)
  )
$$;

-- Writable: mine only. A shared template is read-only to colleagues.
create or replace function public.can_write_program(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.programs p
    where p.id = p_program_id
      and p.org_id = public.current_org_id()
      and p.owner_coach_id = public.auth_uid()
  )
$$;

/* ==================================================================== *
 * 3. Signup: one auth user -> one organisation -> one coach profile
 * ==================================================================== */

create or replace function public.unique_org_slug(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_slug text;
  candidate text;
  n int := 1;
begin
  base_slug := regexp_replace(lower(coalesce(p_name, 'org')), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'org';
  end if;

  candidate := base_slug;
  while exists (select 1 from public.organizations o where o.slug = candidate) loop
    n := n + 1;
    candidate := base_slug || '-' || n::text;
  end loop;

  return candidate;
end
$$;

-- Runs inside the auth.users insert, so a signup can never half-succeed and
-- leave a session with no organisation behind it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_name   text;
  v_org    text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, 'coach'), '@', 1)
  );
  v_org := coalesce(
    nullif(new.raw_user_meta_data ->> 'org_name', ''),
    v_name || '''s Team'
  );

  insert into public.organizations (name, slug)
  values (v_org, public.unique_org_slug(v_org))
  returning id into v_org_id;

  insert into public.users (id, org_id, email, name, role)
  values (new.id, v_org_id, coalesce(new.email, ''), v_name, 'owner');

  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ==================================================================== *
 * 4. Tenancy inheritance
 *
 * Child rows derive org_id (and program_id / athlete_id) from their parent.
 * Done in the database rather than in application code so a server action that
 * forgets a column cannot desynchronise the security boundary. Values sent by
 * the client are overwritten, not trusted.
 * ==================================================================== */

create or replace function public.inherit_tenancy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_table text := tg_argv[0];
  v_fk_column    text := tg_argv[1];
  v_copy_columns text := tg_argv[2];
  v_fk_value     uuid;
  v_inherited    jsonb;
begin
  execute format('select ($1).%I', v_fk_column) into v_fk_value using new;

  if v_fk_value is null then
    raise exception '%.% must be set', tg_table_name, v_fk_column;
  end if;

  execute format(
    'select to_jsonb(t) from (select %s from public.%I where id = $1) t',
    v_copy_columns, v_parent_table
  ) into v_inherited using v_fk_value;

  if v_inherited is null then
    raise exception '%.% references a missing %', tg_table_name, v_fk_column, v_parent_table;
  end if;

  -- Overlay the authoritative parent values on top of whatever was submitted.
  new := jsonb_populate_record(new, v_inherited);
  return new;
end
$$;

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      -- child table,          parent table,       fk column,            copied columns
      ('group_members',        'groups',           'group_id',           'org_id'),
      ('program_blocks',       'programs',         'program_id',         'org_id'),
      ('microcycles',          'program_blocks',   'block_id',           'org_id, program_id'),
      ('sessions',             'microcycles',      'microcycle_id',      'org_id, program_id'),
      ('session_blocks',       'sessions',         'session_id',         'org_id, program_id'),
      ('exercise_slots',       'session_blocks',   'session_block_id',   'org_id, program_id'),
      ('prescribed_sets',      'exercise_slots',   'slot_id',            'org_id, program_id'),
      ('program_assignments',  'programs',         'program_id',         'org_id'),
      ('athlete_maxes',        'athletes',         'athlete_id',         'org_id'),
      ('logged_sessions',      'athletes',         'athlete_id',         'org_id'),
      ('logged_sets',          'logged_sessions',  'logged_session_id',  'org_id, athlete_id')
    ) as t(child, parent, fk, cols)
  loop
    execute format('drop trigger if exists inherit_tenancy_trg on public.%I', spec.child);
    execute format(
      'create trigger inherit_tenancy_trg
         before insert or update of %I on public.%I
         for each row execute function public.inherit_tenancy(%L, %L, %L)',
      spec.fk, spec.child, spec.parent, spec.fk, spec.cols
    );
  end loop;
end
$$;

/* ==================================================================== *
 * 5. Row level security
 * ==================================================================== */

-- The canonical list of tenant tables, reused by the verification block below.
create or replace function public.heme_tenant_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'organizations','users','athletes','groups','group_members','exercises',
    'programs','program_blocks','microcycles','sessions','session_blocks',
    'exercise_slots','prescribed_sets','program_assignments','athlete_maxes',
    'logged_sessions','logged_sets'
  ]
$$;

do $$
declare
  t text;
  p record;
begin
  foreach t in array public.heme_tenant_tables() loop
    execute format('alter table public.%I enable row level security', t);
    -- Policies must bind the table owner too, otherwise the owner silently
    -- bypasses them and the test suite would pass for the wrong reason.
    execute format('alter table public.%I force row level security', t);

    -- Idempotent: drizzle-kit push rewrites tables, so this file has to be
    -- safely re-appliable.
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------- tenant root

create policy org_select on public.organizations
  for select to authenticated
  using (id = (select public.current_org_id()));

create policy org_update on public.organizations
  for update to authenticated
  using (id = (select public.current_org_id()))
  with check (id = (select public.current_org_id()));

-- ---------------------------------------------------------------------- users
-- Colleagues are visible by name so programs can show an author; this table
-- holds no athlete data.

create policy users_select on public.users
  for select to authenticated
  using (org_id = (select public.current_org_id()));

create policy users_update_self on public.users
  for update to authenticated
  using (id = (select public.auth_uid()))
  with check (id = (select public.auth_uid()) and org_id = (select public.current_org_id()));

-- ------------------------------------------------------- ownership roots
-- This is the rule the whole phase exists for: same org is not enough.

create policy athletes_all on public.athletes
  for all to authenticated
  using (
    org_id = (select public.current_org_id())
    and owner_coach_id = (select public.auth_uid())
  )
  with check (
    org_id = (select public.current_org_id())
    and owner_coach_id = (select public.auth_uid())
  );

create policy groups_all on public.groups
  for all to authenticated
  using (
    org_id = (select public.current_org_id())
    and owner_coach_id = (select public.auth_uid())
  )
  with check (
    org_id = (select public.current_org_id())
    and owner_coach_id = (select public.auth_uid())
  );

create policy group_members_all on public.group_members
  for all to authenticated
  using (org_id = (select public.current_org_id()) and public.owns_group(group_id))
  with check (
    org_id = (select public.current_org_id())
    and public.owns_group(group_id)
    and public.owns_athlete(athlete_id)
  );

-- ------------------------------------------------------------ exercise library
-- Reference data, not client data. Global rows (org_id is null) are readable by
-- everyone; an org's custom exercises are shared across that org's coaches.

create policy exercises_select on public.exercises
  for select to authenticated
  using (org_id is null or org_id = (select public.current_org_id()));

create policy exercises_write on public.exercises
  for all to authenticated
  using (org_id = (select public.current_org_id()))
  with check (org_id = (select public.current_org_id()));

-- --------------------------------------------------------------------- programs

create policy programs_select on public.programs
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (owner_coach_id = (select public.auth_uid()) or is_org_shared)
  );

create policy programs_write on public.programs
  for all to authenticated
  using (
    org_id = (select public.current_org_id())
    and owner_coach_id = (select public.auth_uid())
  )
  with check (
    org_id = (select public.current_org_id())
    and owner_coach_id = (select public.auth_uid())
  );

-- ----------------------------------------------------- program tree descendants
-- One join each, via the denormalised program_id.

do $$
declare
  t text;
begin
  foreach t in array array[
    'program_blocks','microcycles','sessions','session_blocks',
    'exercise_slots','prescribed_sets'
  ] loop
    execute format($f$
      create policy %1$I_select on public.%1$I
        for select to authenticated
        using (org_id = (select public.current_org_id())
               and public.can_read_program(program_id));

      create policy %1$I_write on public.%1$I
        for all to authenticated
        using (org_id = (select public.current_org_id())
               and public.can_write_program(program_id))
        with check (org_id = (select public.current_org_id())
                    and public.can_write_program(program_id));
    $f$, t);
  end loop;
end
$$;

-- ------------------------------------------------------------ execution tables
-- Athlete-scoped: gated on owning the athlete, never merely sharing an org.

create policy assignments_all on public.program_assignments
  for all to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (athlete_id is not null and public.owns_athlete(athlete_id))
      or (group_id is not null and public.owns_group(group_id))
    )
  )
  with check (
    org_id = (select public.current_org_id())
    and public.can_read_program(program_id)
    and (
      (athlete_id is not null and public.owns_athlete(athlete_id))
      or (group_id is not null and public.owns_group(group_id))
    )
  );

do $$
declare
  t text;
begin
  foreach t in array array['athlete_maxes','logged_sessions','logged_sets'] loop
    execute format($f$
      create policy %1$I_all on public.%1$I
        for all to authenticated
        using (org_id = (select public.current_org_id())
               and public.owns_athlete(athlete_id))
        with check (org_id = (select public.current_org_id())
                    and public.owns_athlete(athlete_id));
    $f$, t);
  end loop;
end
$$;

/* ==================================================================== *
 * 6. Grants
 *
 * Table privileges are broad; RLS decides which rows. `anon` gets nothing —
 * an unauthenticated request must not read training data.
 * ==================================================================== */

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

revoke all on all tables in schema public from anon;

/* ==================================================================== *
 * 7. Post-condition
 *
 * `drizzle-kit push` emits DISABLE ROW LEVEL SECURITY for any table that does
 * not declare RLS in the Drizzle schema, which silently undoes everything
 * above. This check turns that into a loud failure instead of a security hole
 * that still looks configured.
 * ==================================================================== */

do $$
declare
  offenders text[];
begin
  select array_agg(c.relname order by c.relname) into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(public.heme_tenant_tables())
    and not (c.relrowsecurity and c.relforcerowsecurity);

  if offenders is not null then
    raise exception 'Row level security is not active on: %', array_to_string(offenders, ', ');
  end if;
end
$$;

commit;
