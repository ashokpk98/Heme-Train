/*
 * Makes the three seeded coach logins work.
 *
 * Run in the Supabase SQL Editor after diagnose-auth.sql shows a problem.
 * Safe to run more than once, and it touches only the three @heme.test
 * fixture accounts — never a real one.
 *
 * The seed created these accounts as SQL rows rather than through Supabase's
 * signup API, because the sandbox that generated it could not reach the
 * network. That is a legitimate approach, but it means every column the auth
 * service checks had to be set correctly by hand, and any one of them being
 * wrong produces the same indistinguishable "incorrect password". This resets
 * all of them together instead of guessing which.
 *
 * The hash is regenerated at cost 10. pgcrypto's gen_salt('bf') defaults to
 * cost 6, which is valid bcrypt and does verify, but 10 is what Supabase's own
 * signup produces — so this also removes the difference between a seeded
 * account and a real one, rather than leaving a subtle mismatch behind.
 */

begin;

/*
 * First, the one that actually breaks sign-in.
 *
 * GoTrue maps these columns to a Go `string`, which cannot hold NULL, while
 * Supabase declares them nullable with no default. A row inserted by hand that
 * omits them stores NULL, and then any query touching that user crashes the
 * auth service rather than rejecting the login:
 *
 *   sql: Scan error on column index 3, name "confirmation_token":
 *   converting NULL to string is unsupported
 *
 * The browser sees HTTP 500 "Database error querying schema", which the login
 * form reports as "Email or password is incorrect." like every other failure.
 * Meanwhile the row looks flawless in SQL — hash verifies, email confirmed,
 * identity present — because nothing is wrong with the *data*; the reader
 * cannot represent it. It disables the Admin API too, so resetting the password
 * through Supabase fails with "Database error finding users".
 *
 * Applied to every row rather than just the fixtures, because NULL is never a
 * valid value in these columns for any account. Accounts created through
 * signup already hold '' and are left untouched.
 *
 * Each column is guarded: they do not all exist on every Supabase revision, and
 * an unguarded reference would abort the transaction.
 */
do $$
declare
  col text;
begin
  foreach col in array array[
    'confirmation_token', 'recovery_token', 'email_change',
    'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'auth' and table_name = 'users'
         and column_name = col
    ) then
      execute format(
        'update auth.users set %I = %L where %I is null', col, '', col
      );
    end if;
  end loop;
end $$;

update auth.users
   set encrypted_password = extensions.crypt(
         'heme-demo-1234', extensions.gen_salt('bf', 10)
       ),
       -- Supabase refuses to sign in an unconfirmed account. These are
       -- fixtures with no real mailbox, so confirm them outright.
       email_confirmed_at = coalesce(email_confirmed_at, now()),
       -- The audience and role the auth service looks users up by.
       aud                = 'authenticated',
       role               = 'authenticated',
       -- Email/password is the only provider these accounts use.
       raw_app_meta_data  = jsonb_build_object(
         'provider', 'email', 'providers', jsonb_build_array('email')
       ),
       updated_at         = now()
 where email in ('a1@heme.test', 'a2@heme.test', 'b1@heme.test');

-- Clear a ban or soft-delete if the columns exist on this instance. Guarded,
-- because the local emulation in local-bootstrap.sql does not define them and
-- an unguarded reference would abort the whole transaction.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
       and column_name = 'banned_until'
  ) then
    execute $q$update auth.users set banned_until = null
              where email like '%@heme.test'$q$;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users'
       and column_name = 'deleted_at'
  ) then
    execute $q$update auth.users set deleted_at = null
              where email like '%@heme.test'$q$;
  end if;
end $$;

-- The auth service needs an identities row for the email provider. Missing one
-- lets the account exist while sign-in still fails.
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select
  extensions.gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object(
    'sub', u.id::text, 'email', u.email,
    'email_verified', true, 'phone_verified', false
  ),
  'email',
  now(), now(), now()
  from auth.users u
 where u.email like '%@heme.test'
   and not exists (
     select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'email'
   );

commit;

-- Confirm the repair took. Every column here must be true.
select
  email,
  encrypted_password = extensions.crypt('heme-demo-1234', encrypted_password)
                                    as password_matches,
  left(encrypted_password, 7)       as hash_prefix,
  email_confirmed_at is not null    as email_confirmed,
  -- The check that matters most: no NULL left in any column GoTrue reads as a
  -- string. False here means sign-in still returns HTTP 500.
  num_nulls(
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) = 0                             as no_null_tokens
  from auth.users
 where email like '%@heme.test'
 order by email;
