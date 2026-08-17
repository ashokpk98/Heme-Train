/**
 * Seed script: global exercise library, coaches with auth identities, and the
 * starter program templates.
 *
 * Works against both a local Postgres and a real Supabase project. With
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set, auth users are created through
 * the Admin API so passwords are properly hashed and sign-in works. Without
 * them it falls back to inserting into `auth.users` directly, which is enough
 * to develop and test authorisation locally.
 *
 * Idempotent — clears the tables it owns first.
 *
 * Run with: npm run db:seed
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  athleteMaxes,
  athletes,
  exerciseSlots,
  exercises,
  groupMembers,
  groups,
  microcycles,
  organizations,
  prescribedSets,
  programBlocks,
  programs,
  sessionBlocks,
  sessions,
  users,
} from "@/lib/db/schema";
import { progressSet } from "@/lib/domain/progression";
import { trainingMaxFrom } from "@/lib/domain/e1rm";
import { EXERCISE_LIBRARY } from "./exercise-data";
import { PROGRAM_TEMPLATES, type TemplateSet } from "./templates";
import { SEED_COACHES, type SeedCoach } from "./coaches";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function letterLabel(blockIndex: number, slotIndex: number): string {
  return `${String.fromCharCode(65 + (blockIndex % 26))}${slotIndex + 1}`;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const useAdminApi = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);

/* ------------------------------------------------------------------ *
 * Reset
 * ------------------------------------------------------------------ */

async function clearAll() {
  // Deleting the auth users cascades to public.users, which cascades onward.
  // Organizations are cleared separately because they are created by the
  // signup trigger, not owned by any single auth user.
  if (useAdminApi) {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.email?.endsWith("@heme.test")) {
        await admin.auth.admin.deleteUser(u.id);
      }
    }
  } else {
    await db.execute(sql`truncate auth.users cascade`);
  }

  await db.execute(sql`truncate table ${organizations} restart identity cascade`);
  await db.execute(sql`truncate table ${exercises} restart identity cascade`);
}

/* ------------------------------------------------------------------ *
 * Exercise library (global: org_id stays null)
 * ------------------------------------------------------------------ */

async function seedExercises(): Promise<Map<string, string>> {
  const rows = EXERCISE_LIBRARY.map((e) => ({
    orgId: null,
    name: e.name,
    slug: slugify(e.name),
    aliases: e.aliases ?? [],
    movementPattern: e.pattern,
    category: e.category,
    laterality: e.laterality ?? "bilateral",
    forceVector: e.vector ?? null,
    contractionEmphasis: e.contraction ?? "mixed",
    equipment: e.equipment,
    primaryMuscles: e.primary,
    secondaryMuscles: e.secondary ?? [],
    trackedMetrics: e.metrics ?? (["load", "reps"] as const).slice(),
    loadBasis: e.loadBasis ?? "absolute_only",
    derivedRatio: e.derivedRatio ?? null,
    isMaxTestable: e.maxTestable ?? false,
    difficultyLevel: e.difficulty ?? 3,
    defaultTempo: e.tempo ?? null,
    defaultRestSeconds: e.rest ?? null,
    coachingCues: e.cues ?? [],
    tags: e.tags ?? [],
  }));

  const inserted = await db
    .insert(exercises)
    .values(rows as (typeof exercises.$inferInsert)[])
    .returning({ id: exercises.id, slug: exercises.slug });

  const bySlug = new Map(inserted.map((r) => [r.slug, r.id]));

  // Second pass wires the self-references now that every id exists.
  for (const e of EXERCISE_LIBRARY) {
    const id = bySlug.get(slugify(e.name));
    if (!id) continue;

    const derivedFromId = e.derivedFrom ? bySlug.get(e.derivedFrom) : undefined;
    const progressionOfId = e.progressionOf
      ? bySlug.get(e.progressionOf)
      : undefined;
    if (!derivedFromId && !progressionOfId) continue;

    if (e.derivedFrom && !derivedFromId) {
      throw new Error(
        `Exercise "${e.name}" references unknown derivedFrom slug "${e.derivedFrom}"`,
      );
    }
    if (e.progressionOf && !progressionOfId) {
      throw new Error(
        `Exercise "${e.name}" references unknown progressionOf slug "${e.progressionOf}"`,
      );
    }

    await db
      .update(exercises)
      .set({
        ...(derivedFromId ? { derivedFromExerciseId: derivedFromId } : {}),
        ...(progressionOfId ? { progressionOfId } : {}),
      })
      .where(eq(exercises.id, id));
  }

  return bySlug;
}

/* ------------------------------------------------------------------ *
 * Coaches — identity first, then the org merge
 * ------------------------------------------------------------------ */

interface CreatedCoach {
  spec: SeedCoach;
  userId: string;
  orgId: string;
}

async function createAuthUser(spec: SeedCoach): Promise<string> {
  if (useAdminApi) {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.admin.createUser({
      email: spec.email,
      password: spec.password,
      email_confirm: true,
      user_metadata: { name: spec.name, org_name: spec.orgName },
    });
    if (error || !data.user) {
      throw new Error(`Could not create ${spec.email}: ${error?.message}`);
    }
    return data.user.id;
  }

  // Local fallback. The password is not usable for sign-in without GoTrue
  // running, but everything about authorisation can still be exercised.
  //
  // The empty strings matter even though nothing local reads them: GoTrue maps
  // these columns to a Go string and cannot scan NULL out of them, so a row
  // seeded this way and later pointed at a real Supabase project would fail
  // every sign-in with HTTP 500. Writing '' keeps the local fixture the same
  // shape as one Supabase would have created.
  const [row] = await db.execute<{ id: string }>(sql`
    insert into auth.users (
      email, raw_user_meta_data,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    )
    values (${spec.email}, ${JSON.stringify({
      name: spec.name,
      org_name: spec.orgName,
    })}::jsonb, '', '', '', '', '', '', '', '')
    returning id
  `);
  return row.id;
}

async function seedCoaches(): Promise<CreatedCoach[]> {
  const created: CreatedCoach[] = [];
  // orgKey -> the org id created by the first coach carrying that key.
  const orgByKey = new Map<string, string>();

  for (const spec of SEED_COACHES) {
    // The `handle_new_user` trigger creates an organisation and profile.
    const userId = await createAuthUser(spec);

    const [profile] = await db
      .select({ orgId: users.orgId })
      .from(users)
      .where(eq(users.id, userId));

    if (!profile) {
      throw new Error(
        `handle_new_user() did not create a profile for ${spec.email}. ` +
          `Has supabase/migrations/0001_tenancy_rls.sql been applied?`,
      );
    }

    const existingOrgId = orgByKey.get(spec.orgKey);

    if (existingOrgId) {
      // This coach shares an organisation with an earlier one. Signup always
      // mints a fresh org, so move them across and drop the empty one — this
      // is what the invite flow will do properly later.
      const ownOrgId = profile.orgId;
      await db
        .update(users)
        .set({ orgId: existingOrgId })
        .where(eq(users.id, userId));
      await db.delete(organizations).where(eq(organizations.id, ownOrgId));
      created.push({ spec, userId, orgId: existingOrgId });
    } else {
      orgByKey.set(spec.orgKey, profile.orgId);
      created.push({ spec, userId, orgId: profile.orgId });
    }
  }

  return created;
}

/* ------------------------------------------------------------------ *
 * Athletes, groups, maxes — owned by a specific coach
 * ------------------------------------------------------------------ */

async function seedRoster(coach: CreatedCoach, exerciseIds: Map<string, string>) {
  const today = new Date().toISOString().slice(0, 10);

  const athleteRows = await db
    .insert(athletes)
    .values(
      coach.spec.athletes.map((a) => ({
        orgId: coach.orgId,
        ownerCoachId: coach.userId,
        firstName: a.firstName,
        lastName: a.lastName,
        dateOfBirth: a.dob,
        sex: a.sex,
        heightCm: a.height,
        bodyweightKg: a.weight,
        sport: a.sport,
        position: a.position,
      })),
    )
    .returning();

  const byName = new Map(
    athleteRows.map((a) => [`${a.firstName} ${a.lastName}`, a.id]),
  );

  for (const g of coach.spec.groups) {
    const [group] = await db
      .insert(groups)
      .values({
        orgId: coach.orgId,
        ownerCoachId: coach.userId,
        name: g.name,
        type: g.type,
        sport: g.sport,
      })
      .returning();

    const members = g.members
      .map((n) => byName.get(n))
      .filter((id): id is string => Boolean(id))
      .map((athleteId) => ({ groupId: group.id, athleteId, joinedAt: today }));

    if (members.length) await db.insert(groupMembers).values(members);
  }

  // Maxes are what make %1RM prescriptions resolve to real weights.
  const maxRows = coach.spec.athletes.flatMap((a) => {
    const athleteId = byName.get(`${a.firstName} ${a.lastName}`);
    if (!athleteId) return [];
    return Object.entries(a.maxes).flatMap(([slug, value]) => {
      const exerciseId = exerciseIds.get(slug);
      if (!exerciseId) return [];
      return [
        {
          athleteId,
          exerciseId,
          valueKg: value,
          trainingMaxKg: trainingMaxFrom(value),
          source: "tested" as const,
          testedAt: today,
        },
      ];
    });
  });

  if (maxRows.length) await db.insert(athleteMaxes).values(maxRows);

  return athleteRows.length;
}

/* ------------------------------------------------------------------ *
 * Program templates
 * ------------------------------------------------------------------ */

function setRow(slotId: string, setNumber: number, s: TemplateSet) {
  return {
    slotId,
    setNumber,
    setType: s.setType ?? ("working" as const),
    reps: s.reps ?? null,
    repMin: s.repMin ?? null,
    repMax: s.repMax ?? null,
    isAmrap: s.isAmrap ?? false,
    clusterReps: s.clusterReps ?? null,
    clusterRestSec: s.clusterRestSec ?? null,
    loadKg: s.loadKg ?? null,
    loadPercent: s.loadPercent ?? null,
    percentOf: s.percentOf ?? (s.loadPercent != null ? ("1rm" as const) : null),
    rpeTarget: s.rpeTarget ?? null,
    rirTarget: s.rirTarget ?? null,
    velocityTargetMin: s.velocityTargetMin ?? null,
    velocityTargetMax: s.velocityTargetMax ?? null,
    velocityLossThresholdPct: s.velocityLossThresholdPct ?? null,
    tempo: s.tempo ?? null,
    restSeconds: s.restSeconds ?? null,
    durationSec: s.durationSec ?? null,
    distanceM: s.distanceM ?? null,
    calories: s.calories ?? null,
    heightCm: s.heightCm ?? null,
    notes: s.notes ?? null,
  };
}

async function seedTemplates(
  coach: CreatedCoach,
  exerciseIds: Map<string, string>,
  which: typeof PROGRAM_TEMPLATES,
  isOrgShared: boolean,
) {
  for (const tpl of which) {
    const totalWeeks = tpl.blocks.reduce((n, b) => n + b.weeks, 0);

    const [program] = await db
      .insert(programs)
      .values({
        orgId: coach.orgId,
        ownerCoachId: coach.userId,
        isOrgShared,
        name: tpl.name,
        description: tpl.description,
        goal: tpl.goal,
        periodizationModel: tpl.model,
        durationWeeks: totalWeeks,
        isTemplate: true,
        createdById: coach.userId,
      })
      .returning();

    let weekCursor = 0;

    for (const [blockIndex, blk] of tpl.blocks.entries()) {
      const [block] = await db
        .insert(programBlocks)
        .values({
          programId: program.id,
          name: blk.name,
          orderIndex: blockIndex,
          weeks: blk.weeks,
          blockType: blk.type,
          volumeEmphasis: blk.volumeEmphasis ?? 3,
          intensityEmphasis: blk.intensityEmphasis ?? 3,
          notes: blk.notes ?? null,
        })
        .returning();

      for (let week = 0; week < blk.weeks; week++) {
        weekCursor += 1;

        const [micro] = await db
          .insert(microcycles)
          .values({
            blockId: block.id,
            weekNumber: weekCursor,
            label: `Week ${weekCursor}`,
            loadType: blk.weekLoadTypes?.[week] ?? "load",
          })
          .returning();

        for (const sess of blk.sessions) {
          const [session] = await db
            .insert(sessions)
            .values({
              microcycleId: micro.id,
              dayIndex: sess.dayIndex,
              name: sess.name,
              sessionType: sess.type,
              estimatedDurationMin: sess.durationMin ?? null,
              notes: sess.notes ?? null,
            })
            .returning();

          for (const [sbIndex, sb] of sess.blocks.entries()) {
            const [sessionBlock] = await db
              .insert(sessionBlocks)
              .values({
                sessionId: session.id,
                name: sb.name ?? null,
                orderIndex: sbIndex,
                blockType: sb.type,
                structure: sb.structure ?? "straight",
                rounds: sb.rounds ?? null,
                restBetweenRoundsSec: sb.restBetweenRoundsSec ?? null,
                timeCapSec: sb.timeCapSec ?? null,
                workIntervalSec: sb.workIntervalSec ?? null,
                notes: sb.notes ?? null,
              })
              .returning();

            for (const [slotIndex, slot] of sb.slots.entries()) {
              const exerciseId = exerciseIds.get(slot.exercise);
              if (!exerciseId) {
                throw new Error(
                  `Template "${tpl.name}" references unknown exercise slug "${slot.exercise}"`,
                );
              }

              const [insertedSlot] = await db
                .insert(exerciseSlots)
                .values({
                  sessionBlockId: sessionBlock.id,
                  exerciseId,
                  orderIndex: slotIndex,
                  letterLabel: letterLabel(sbIndex, slotIndex),
                  notes: slot.notes ?? null,
                })
                .returning();

              // Week 1 is the template as written; later weeks come from the
              // same progression rule the builder's bulk action uses.
              const weekSets = blk.progression
                ? slot.sets.map((s) => ({
                    ...progressSet(s, blk.progression!, week),
                    setType: s.setType,
                  }))
                : slot.sets;

              await db
                .insert(prescribedSets)
                .values(
                  weekSets.map((s, i) =>
                    setRow(insertedSlot.id, i + 1, s as TemplateSet),
                  ),
                );
            }
          }
        }
      }
    }

    console.log(`    · ${tpl.name} (${totalWeeks} weeks)`);
  }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log(
    useAdminApi
      ? "Seeding against Supabase (Admin API)…"
      : "Seeding against local Postgres (auth.users direct insert)…",
  );

  console.log("Clearing existing data…");
  await clearAll();

  console.log("Seeding exercise library…");
  const exerciseIds = await seedExercises();
  console.log(`  · ${exerciseIds.size} global exercises`);

  console.log("Seeding coaches…");
  const coaches = await seedCoaches();
  for (const c of coaches) {
    console.log(`  · ${c.spec.name} <${c.spec.email}> — ${c.spec.orgName}`);
  }

  console.log("Seeding athletes and groups…");
  for (const c of coaches) {
    const n = await seedRoster(c, exerciseIds);
    console.log(`  · ${c.spec.name}: ${n} athletes`);
  }

  console.log("Seeding program templates…");
  const a1 = coaches.find((c) => c.spec.key === "a1")!;
  const b1 = coaches.find((c) => c.spec.key === "b1")!;

  console.log(`  ${a1.spec.name} (shared with their org):`);
  await seedTemplates(a1, exerciseIds, PROGRAM_TEMPLATES, true);

  // One private template in the other tenant, so cross-org isolation on
  // programs is something the tests can actually observe.
  console.log(`  ${b1.spec.name} (private):`);
  await seedTemplates(b1, exerciseIds, PROGRAM_TEMPLATES.slice(0, 1), false);

  console.log("\nSeed complete.");
  if (useAdminApi) {
    console.log("\nSign in with any of:");
    for (const c of SEED_COACHES) {
      console.log(`  ${c.email}  /  ${c.password}`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
