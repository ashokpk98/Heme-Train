# Generated SQL bundles

Every file here is generated. Do not edit them by hand — regenerate instead.

Run these in the Supabase SQL Editor, in order:

1. `01_schema.sql` — enums, tables, indexes, foreign keys, RLS policies, triggers
2. `02a_seed.sql` … — auth logins, exercise library, demo fixture. Run every part,
   in alphabetical order. Each part is one transaction, so a failure leaves that
   part unapplied rather than half-applied.

`02_seed.sql` is the same content unsplit, for reference and for `psql`, which
has no size limit to work around.

Regenerate with:

```bash
npm run db:push && npm run db:seed        # against a local Postgres
npx drizzle-kit generate --name=heme_schema
npx tsx scripts/build-supabase-sql.ts
```

## Two things the generator has to correct

`01_schema.sql` is post-processed, not raw drizzle-kit output. `drizzle-kit
generate` ignores `schemaFilter`, so it emits `CREATE SCHEMA "auth"` plus its own
`auth.users` table — both of which collide with Supabase's — and omits the
`public.users.id -> auth.users.id` foreign key. The build script strips the
former and restores the latter.

The `auth.users` insert writes `''` into eight token columns
(`confirmation_token`, `recovery_token`, `email_change`,
`email_change_token_new`, `email_change_token_current`, `phone_change`,
`phone_change_token`, `reauthentication_token`). This is not cosmetic. GoTrue
maps each to a Go `string`, which cannot hold NULL, while Supabase declares them
nullable with no default — so omitting them stores NULL and every sign-in then
fails with HTTP 500 (`converting NULL to string is unsupported`) while the row
still looks perfect in SQL. An earlier bundle omitted them and did exactly that.

The seed parts are also split by the generator now. They were cut by hand once,
and then `02_seed.sql` was regenerated while the parts kept their old contents —
so the files someone actually pastes into Supabase were stale. Splitting happens
at statement boundaries under a size budget, and stale parts are deleted before
new ones are written.

## Verified

Applying `local-bootstrap.sql`, `01_schema.sql` and every seed part to a fresh
database yields 213 exercises, 3 coaches, 2 organisations, 4 athletes, 6
programs, 915 prescribed sets, RLS active and forced on 17 tables, and zero
users with a NULL token column. `npm test` then passes 62/62 against it,
including the 22 cross-tenant isolation tests.
