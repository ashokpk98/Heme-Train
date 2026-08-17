/*
 * Why can't a seeded coach sign in?
 *
 * Run this in the Supabase SQL Editor. It is read-only — it changes nothing.
 *
 * The app deliberately reports "Email or password is incorrect." for every
 * sign-in failure, because distinguishing "no such user" from "wrong password"
 * hands an attacker a way to enumerate which emails have accounts. That is the
 * right behaviour for the login form and useless for debugging, so the real
 * answer has to come from here.
 *
 * The column that matters is `password_matches`. pgcrypto can verify a hash in
 * place: crypt(plaintext, stored_hash) re-hashes using the salt embedded in the
 * stored hash, so it returns the stored hash exactly when the password is right.
 * That is the same comparison Supabase's auth service performs, so this answers
 * the question directly rather than inferring it.
 *
 * Optional columns are read via `to_jsonb` so this file runs unchanged against
 * both a hosted project and the local emulation in local-bootstrap.sql, which
 * does not define every column a managed instance has.
 */

select
  u.email,

  -- Is the password the one the login form fills in?
  u.encrypted_password = extensions.crypt('heme-demo-1234', u.encrypted_password)
                                                  as password_matches,

  -- A bcrypt hash is exactly 60 characters and starts $2a$, $2b$ or $2y$.
  -- Anything else means the hash was never written or was truncated.
  left(u.encrypted_password, 7)                   as hash_prefix,
  length(u.encrypted_password)                    as hash_len,

  -- Any of these will refuse a sign-in on their own, with the same
  -- indistinguishable error.
  u.email_confirmed_at is not null                as email_confirmed,
  u.aud,
  u.role,
  to_jsonb(u) ->> 'banned_until'                  as banned_until,
  to_jsonb(u) ->> 'deleted_at'                    as deleted_at,
  u.is_sso_user,
  u.is_anonymous,

  -- The auth service needs an identities row for the email provider.
  exists (
    select 1 from auth.identities i
     where i.user_id = u.id and i.provider = 'email'
  )                                               as has_email_identity,

  -- And the app needs a profile row, or sign-in succeeds and every page fails.
  exists (select 1 from public.users p where p.id = u.id)
                                                  as has_profile,

  /*
   * The check every other column here will happily pass while sign-in fails.
   *
   * GoTrue maps each of these columns to a Go string, which cannot hold NULL,
   * while Supabase declares them nullable with no default. A row inserted by
   * hand that omits them stores NULL, and then any query touching that user
   * crashes the auth service instead of rejecting the login:
   *
   *   sql: Scan error on column index 3, name "confirmation_token":
   *   converting NULL to string is unsupported
   *
   * That arrives as HTTP 500, which the login form reports with the same
   * "Email or password is incorrect." as everything else. Nothing is wrong with
   * the data — the reader cannot represent it — so this is invisible to every
   * other check in this file. It was the actual fault the first time this
   * diagnostic ran green.
   *
   * Read through jsonb so a column missing on this Supabase revision is simply
   * absent rather than an error.
   */
  (select count(*)
     from jsonb_each(to_jsonb(u)) as kv(k, v)
    where k in ('confirmation_token', 'recovery_token', 'email_change',
                'email_change_token_new', 'email_change_token_current',
                'phone_change', 'phone_change_token', 'reauthentication_token')
      and v = 'null'::jsonb) = 0            as no_null_tokens

from auth.users u
where u.email like '%@heme.test'
order by u.email;

/*
 * Reading the result:
 *
 *   no rows                      the seed's auth.users insert never ran.
 *                                Re-run supabase/dist/02a_seed.sql.
 *   password_matches = false     the stored hash is not this password.
 *                                Run repair-seed-logins.sql.
 *   hash_len is not 60           the hash is malformed. Same repair.
 *   email_confirmed = false      Supabase refuses unconfirmed accounts.
 *                                Same repair.
 *   has_email_identity = false   Same repair.
 *   has_profile = false          auth works but the app has no coach record;
 *                                re-run the later seed parts.
 *   no_null_tokens = false       sign-in returns HTTP 500 and the auth service
 *                                is crashing, not rejecting the password. Run
 *                                repair-seed-logins.sql.
 *   all green                    the credentials are fine. Run
 *                                `npm run auth:doctor`, which asks the auth
 *                                service directly and prints the status and
 *                                error code this form is designed to hide.
 */
