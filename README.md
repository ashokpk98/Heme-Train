# Heme-Train

HEME is a high performance app which can be used as a program builder and monitoring tool for athletes by a high performance or a strength and conditioning coach.

This repository currently contains **slice 1: the exercise library and program builder**.

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

## Getting started

Requires Node 22+ and Docker (or a local Postgres 16).

```bash
docker compose up -d          # Postgres on :5432
cp .env.example .env.local
npm install
npm run db:push               # apply the schema
npm run db:seed               # 213 exercises, demo org, 5 program templates
npm run dev                   # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Domain-logic unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Push schema to Postgres |
| `npm run db:seed` | Reseed (idempotent — truncates first) |
| `npm run db:studio` | Drizzle Studio |

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
npm test   # 40 tests
```

---

## Athletes and clients are the same thing

An athlete belongs to zero or more groups. A 1:1 personal-training client is simply an athlete in a group of type `individual`. The same model serves institutional squad S&C and individual coaching without a fork.

---

## Not yet built

Auth is stubbed — every page resolves to the single seeded org via `getDemoOrg()`. `org_id` is already on every tenant-scoped table, so real auth replaces that one function rather than requiring a migration.

Also outstanding: the athlete-facing app, VBT device integrations (the schema holds velocity fields; nothing syncs hardware yet), analytics dashboards, and report generation.

---

## Stack

Next.js (App Router) · TypeScript · Postgres + Drizzle · Tailwind · dnd-kit · Vitest
