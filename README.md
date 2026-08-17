# Heme-Train

HEME is a high performance app which can be used as a program builder and monitoring tool for athletes by a high performance or a strength and conditioning coach.

This repository contains the exercise library, the program builder, and coach authentication with per-coach data isolation enforced in the database.

---

## Why the schema looks like this

Monitoring, analysis and report generation are all queries over *prescribed vs. actual* training data. If the prescription model is thin, every report built on it later is thin too. So slice 1 ships a builder end to end, but on a schema that already carries assignment, athlete maxes and logged sets.

### The planning hierarchy

Mirrors how coaches actually periodise:

```
Program (macrocycle)
└── Program Block (mesocycle)      accumulation → transmutation → realization
    └── Microcycle (week)          load | unload | deload | test
        └── Session (day)
            └── Session Block      warmup / power / main strength / accessory / conditioning
                └── Exercise Slot  A1, A2, B1 …
                    └── Prescribed Set
```

### Three decisions worth knowing about

**Supersets live on the session block, not on exercises.** A `structure` field (`straight`, `superset`, `triset`, `circuit`, `complex`, `contrast`, `emom`, `amrap`, `for_time`, `interval`) plus rounds and rest. One model expresses a Westside contrast pair and a conditioning circuit without special-casing either.

**Every exercise declares its own tracked metrics.** `tracked_metrics` decides which inputs the builder and logger render — load + distance for a sled push, time for a plank, height for a CMJ. Without it the UI would show a weight box next to a plank.

**All four loading methods coexist on one set.** `prescribed_sets` carries absolute load, %1RM/training-max, RPE/RIR, velocity targets and tempo simultaneously. A set can legitimately read:

```
87.5 kg (80%) × 5 @ RPE 8 · ≥ 0.45 m/s · stop at 20% vel. loss · tempo 3-1-X-0
```

Most competing builders cap at two prescription variables per movement.

---

## Authentication and data isolation

Supabase Auth for identity, Postgres row level security for authorisation.

**A coach sees only their own athletes — sharing an organisation is not enough.**
Ownership lives on three roots (`athletes`, `groups`, `programs`) via
`owner_coach_id`. Everything else inherits visibility from one of those roots.

### Why the tenancy columns are denormalised

`prescribed_sets` sits seven foreign keys away from `organizations`:

```
prescribed_sets → exercise_slots → session_blocks → sessions
                → microcycles → program_blocks → programs → organizations
```

A policy that walked that chain would be evaluated per row on the largest table
in the system. So every tenant table carries `org_id`, and the program tree also
carries `program_id`. No policy joins more than once, and the org gate is a plain
indexed equality that prunes first.

Those columns are filled by `BEFORE INSERT` triggers that read the parent row,
not by application code — a server action that forgets a field cannot
desynchronise the security boundary, and a client that submits a forged `org_id`
has it overwritten.

### RLS is load-bearing, not decorative

Connecting as a superuser silently bypasses every policy, which is how "we added
RLS" often ends up meaning nothing. There are two connections:

| | Used by | RLS |
|---|---|---|
| `db` | seed script, auth callbacks, admin | **bypassed** |
| `withCoach(fn)` / `withUserId(id, fn)` | every page and server action | **enforced** |

`withUserId` opens a transaction, publishes the user id as the JWT claims that
`public.auth_uid()` reads, and switches to the `authenticated` role for the rest
of the transaction. Both are transaction-local, so a pooled connection cannot
leak one coach's scope into the next request.

> **`drizzle-kit push` disables RLS.** It emits `DISABLE ROW LEVEL SECURITY` for
> any table that does not declare RLS in the Drizzle schema, which quietly undoes
> the migration while leaving the policies in place — the database still *looks*
> configured. `npm run db:push` therefore re-applies `supabase/migrations/` every
> time, and that file ends with a check that raises if RLS is not active. The
> test suite refuses to run without it too, because these tests attempt real
> cross-tenant deletes.

## Getting started

Requires Node 22+ and either a Supabase project or a local Postgres 16.

### Against Supabase

```bash
cp .env.example .env.local    # fill in project URL, anon key, service role key,
                              # and the pooled DATABASE_URL
npm install
npm run db:push               # schema + RLS policies + triggers
npm run db:seed               # 213 exercises, 3 coaches, 5 program templates
npm run dev                   # http://localhost:3000
```

Seeded logins (password `heme-demo-1234`):

| Email | Coach | Organisation | Athletes |
|---|---|---|---|
| `a1@heme.test` | Alex Reid | HEME Performance | Priya, Marcus |
| `a2@heme.test` | Jordan Six | HEME Performance | Aisha |
| `b1@heme.test` | Sam Okafor | Northside Strength | Tom |

A1 and A2 share an organisation deliberately: sign in as each and the athlete
lists do not overlap.

### Against a local Postgres

```bash
docker compose up -d
psql "$DATABASE_URL" -f supabase/local-bootstrap.sql   # emulates Supabase's
                                                       # auth schema and roles
npm run db:push && npm run db:seed
```

Sign-in needs a real Supabase project, but everything about *authorisation* can
be developed and tested locally this way.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Domain-logic unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Push schema, then re-apply RLS migrations |
| `npm run db:rls` | Re-apply `supabase/migrations/` only |
| `npm run db:seed` | Reseed (idempotent — truncates first) |
| `npm run db:studio` | Drizzle Studio |

---

## Deployment troubleshooting

Visit **`/api/health`** on any deployment. It reports which environment
variables the running app can actually see, how the database URL parses, and
whether Supabase auth and Postgres are reachable — no secret values, only
formats and lengths.

Add **`?signin=1`** to also attempt a real sign-in as the seeded coach. Worth
doing once after seeding: the coach accounts are inserted as SQL rows carrying a
bcrypt hash rather than created through Supabase's signup API, so "the database
has 3 coaches" and "a coach can log in" are separate claims — a missing
`auth.identities` row or an unset `email_confirmed_at` satisfies the first and
fails the second. It is opt-in because Supabase rate-limits the token endpoint
per IP, and a probe that ran on every page load would spend that budget and make
real sign-ins fail with 429.

Three failures this route exists to catch, because all three are silent:

**The browser key under an unexpected name.** Supabase's current dashboard hands
out a *publishable* key (`sb_publishable_…`) and suggests the variable name
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, where it used to hand out an anon JWT.
Both that name and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are accepted. On Vercel,
`NEXT_PUBLIC_*` variables are read at build time — after adding them you must
**redeploy**, not just restart.

**A password that is not percent-encoded.** If your Postgres password contains
`/`, `@`, `:` or `#`, it must be escaped (`/` → `%2F`, `@` → `%40`). Unescaped,
the driver does *not* error — it silently parses the wrong host, port, user and
database, then fails much later with something that points nowhere near the
cause:

```
postgresql://postgres.ref:/pa/ss@aws-0-region.pooler.supabase.com:6543/postgres
  parses as → host "postgres.ref"  port 5432  user "root"
              database "pa/ss@aws-0-region.pooler.supabase.com:6543/postgres"
```

**A revoked legacy anon key.** Enabling the new `sb_publishable_` key format
disables the legacy anon JWT. The app still starts, the login form still renders,
and sign-in fails with a 401 that names nothing. `/api/health` reports this as
`auth.status: 401` — the probe sends the `apikey` header, so a 401 there means
the key was genuinely rejected rather than merely absent.

`/api/health` flags the mis-encoded URL as `looksMisencoded`. Delete or gate the
route before the app carries real client data.

### Seeded logins refusing to sign in

If the seeded accounts are refused while a self-registered one works, this is
almost certainly the cause, and it is worth understanding because nothing about
it looks like a password problem.

**A NULL in a token column crashes the auth service.** GoTrue maps
`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`,
`email_change_token_current`, `phone_change`, `phone_change_token` and
`reauthentication_token` to a Go `string`, which cannot hold NULL. Supabase
declares all eight nullable with no default. So a row inserted by hand that
omits them stores NULL, and every subsequent read of that user fails:

```
error finding user: sql: Scan error on column index 3, name "confirmation_token":
converting NULL to string is unsupported
```

The browser gets HTTP 500 — the service is *crashing*, not rejecting the
password. Three things make this hard to see. The row looks flawless in SQL: the
bcrypt hash verifies, the email is confirmed, the identity row exists, because
nothing is wrong with the data and the fault is in the reader. The login form
reports it identically to a wrong password. And it disables the Admin API too,
so resetting the password through Supabase fails with `Database error finding
users` — the usual escape hatch is closed by the same bug.

The generator now writes `''` into all eight columns, so a fresh install cannot
hit this. An existing project is repaired by `repair-seed-logins.sql`.

The login form reports `Email or password is incorrect.` for *every* failure,
deliberately — distinguishing "no such user" from "wrong password" is an
account-enumeration oracle. That is right for the form and useless for
debugging, so these three answer it instead:

| File | What it does |
|---|---|
| `supabase/diagnose-auth.sql` | Read-only. Reports, per fixture account, whether the stored hash actually matches `heme-demo-1234`, whether the email is confirmed, and whether the identity and profile rows exist. |
| `supabase/repair-seed-logins.sql` | Resets all of it together. Idempotent, and scoped to the three `@heme.test` accounts. |
| `npm run auth:doctor` | Asks the auth service instead of the database. Use when the SQL says everything is fine and sign-in still fails. |

The diagnostic works because pgcrypto verifies a hash in place —
`crypt(plaintext, stored_hash)` re-hashes with the salt embedded in the stored
hash, so it equals that hash exactly when the password is right. That is the
same comparison Supabase's auth service makes, so the answer is direct rather
than inferred.

This is a consequence of how the seed was built: the accounts were inserted as
SQL rows rather than created through Supabase's signup API, so every column the
auth service checks had to be right by hand, and any single one being wrong
produces the identical error. The repair also re-hashes at bcrypt cost 10, which
is what Supabase's own signup produces — pgcrypto's `gen_salt('bf')` defaults to
cost 6, which is valid and does verify, but leaving it differing from a real
account is a subtle difference worth not having.

**When the SQL says everything is fine and sign-in still fails**, stop asking the
database and ask the auth service:

```bash
npm run auth:doctor
```

It signs in as each fixture account with the public key and prints the status
and error code the service actually returned — `invalid_credentials`,
`email_not_confirmed`, `email_provider_disabled`, `over_request_rate_limit` —
which the login form is designed never to reveal. Anything still failing then
gets its password set through the Admin API and retried.

That second phase is the part SQL cannot do. It makes the auth service hash and
store the password through its own code path, so the account stops being a
hand-written row and becomes indistinguishable from one created by signup. User
ids are preserved, so every seeded athlete, group and program stays attached to
its coach. It needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` for that phase
only — add it, run, then take it back out.

## Supabase MCP

`.mcp.json` configures the Supabase MCP server, which lets an agent inspect the
project directly — query tables, read logs, check advisors — instead of asking
you to paste SQL output back and forth.

It needs a personal access token, created at **Supabase → account settings →
Access Tokens**. The token is read from the environment rather than stored in
`.mcp.json`, so nothing secret is committed:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."   # PowerShell, current session
setx SUPABASE_ACCESS_TOKEN "sbp_..."     # persist across sessions
```

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."   # macOS / Linux
```

Then restart Claude Code and check with `/mcp`.

Two deliberate choices in that config. **`--read-only`** means the agent can
look but not write; run schema changes yourself through the SQL Editor, where
you can read them first. **`--features=database,debugging,docs`** withholds the
account, storage, functions and branching tool groups, which nothing here needs.
Widen either only when a task actually requires it.

Worth knowing before pointing this at anything real: an MCP server that can read
your database puts whatever is *in* that database in front of the model, and
rows are not trusted input — an athlete-supplied note could contain text aimed
at the agent reading it. Read-only mode bounds the damage but does not remove
it. A development project with fixture data is the right place for this; a
production one holding client data is not.


> Next 16 renamed the `middleware` file convention to `proxy`. Session refresh
> and route guarding live in `src/proxy.ts`, exporting `proxy` — not
> `middleware`. The redirect there is convenience; the real boundary is RLS.

---

## What's in the box

**Exercise library — 213 exercises**, each tagged across the full taxonomy: movement pattern, category, laterality, force vector, contraction emphasis, equipment, primary/secondary muscles, tracked metrics, coaching cues and tags. Filterable and searchable, with alias matching (searching "RFESS" finds the Bulgarian split squat).

**Progression chains.** `progression_of_id` links each exercise to the easier variant it progresses from — split squat → Bulgarian split squat → skater squat. The library drawer walks the whole ladder.

**Derived loading.** Lifts programmed off another lift's max, e.g. front squat at 85% of the back squat max. Front squat, box squat, close-grip bench, rack pull, hang power clean and others ship wired up.

**Program builder.** Three panes — program tree, session canvas with drag-and-drop, prescription inspector. The inspector renders only the fields the selected exercise actually tracks and previews the resolved load live against a chosen athlete's maxes.

**Bulk operations.** "Copy across weeks" clones a week into the rest of its block, applying a progression preset (linear kg, linear %, percentage ramp, RPE ramp, double progression, 5/3/1 wave).

**Five starter templates**, one per periodization model: Linear, Block (accumulation → transmutation → realization), Daily Undulating, Conjugate (max-effort / dynamic-effort), and a 4-day Upper/Lower hypertrophy split driven by double progression for clients who have never tested a 1RM.

---

## Domain logic

Pure and unit-tested, in `src/lib/domain/` — shared by the builder preview, the seeder and (later) report generation, so the maths is defined once.

- **`prescription.ts`** — `resolveSet()` turns a stored row into what a coach or athlete reads. Handles derived lifts, rounds to available plate increments, and degrades gracefully: with no max on file the load shows `—` while reps, RPE and tempo still render, so programs are buildable before anyone has tested.
- **`e1rm.ts`** — Epley / Brzycki / Lombardi estimators, exact at a true single, plus training-max derivation.
- **`progression.ts`** — progression rules and the presets the builder offers.

```bash
npm test   # 62 tests
```

---

## Athletes and clients are the same thing

An athlete belongs to zero or more groups. A 1:1 personal-training client is simply an athlete in a group of type `individual`. The same model serves institutional squad S&C and individual coaching without a fork.

---

## Not yet built

**Program assignment and logging.** The tables exist and carry tenancy —
`program_assignments`, `athlete_maxes`, `logged_sessions`, `logged_sets` — but
nothing writes to them yet. This is the next slice, and what compliance,
volume-load and ACWR are all computed from.

**Athlete logins.** Coaches only for now. `logged_sets` already denormalises
`athlete_id`, so athlete-scoped policies are an addition rather than a migration.

Also outstanding: team invites (signup creates your own org today), VBT device
integrations (the schema holds velocity fields; nothing syncs hardware yet),
analytics dashboards, and report generation.

---

## Stack

Next.js (App Router) · TypeScript · Supabase (Auth + Postgres) · Drizzle · Tailwind · dnd-kit · Vitest
