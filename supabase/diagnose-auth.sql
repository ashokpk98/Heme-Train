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
                                                  as has_profile

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
 *                                re-run 02b_seed.sql.
 *   all green                    the credentials are fine and the problem is
 *                                the app's key or URL — check /api/health.
 */
