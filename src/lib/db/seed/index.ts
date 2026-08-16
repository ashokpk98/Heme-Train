/**
 * Seed script: global exercise library, a demo org, and the starter templates.
 *
 * Idempotent — it clears the tables it owns before inserting, so `npm run
 * db:seed` can be run repeatedly during development.
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
  loggedSessions,
  loggedSets,
  microcycles,
  organizations,
  prescribedSets,
  programAssignments,
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

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Coach-facing slot label: block 0 slot 0 -> "A1", block 1 slot 2 -> "B3". */
function letterLabel(blockIndex: number, slotIndex: number): string {
  return `${String.fromCharCode(65 + (blockIndex % 26))}${slotIndex + 1}`;
}

async function clearAll() {
  // CASCADE handles the FK ordering for us.
  await db.execute(sql`
    truncate table
      ${loggedSets}, ${loggedSessions},
      ${athleteMaxes}, ${programAssignments},
      ${prescribedSets}, ${exerciseSlots}, ${sessionBlocks}, ${sessions},
      ${microcycles}, ${programBlocks}, ${programs},
      ${groupMembers}, ${groups}, ${athletes}, ${users},
      ${exercises}, ${organizations}
    restart identity cascade
  `);
}

/* ------------------------------------------------------------------ *
 * Exercise library
 * ------------------------------------------------------------------ */

async function seedExercises(): Promise<Map<string, string>> {
  // Pass 1: insert every exercise without its self-references, since a row may
  // point at another row that does not exist yet.
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

  // Pass 2: wire up derivedFrom and progressionOf now that every id exists.
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
 * Demo organisation
 * ------------------------------------------------------------------ */

const DEMO_ATHLETES = [
  { firstName: "Priya", lastName: "Raman", sex: "female" as const, dob: "2001-04-12", height: 168, weight: 63, sport: "Athletics", position: "400m" },
  { firstName: "Marcus", lastName: "Bell", sex: "male" as const, dob: "1999-09-02", height: 186, weight: 94, sport: "Rugby", position: "Flanker" },
  { firstName: "Aisha", lastName: "Khan", sex: "female" as const, dob: "2003-01-25", height: 174, weight: 70, sport: "Netball", position: "Goal Attack" },
  { firstName: "Tom", lastName: "Whitfield", sex: "male" as const, dob: "1997-06-18", height: 180, weight: 88, sport: "Rugby", position: "Scrum-half" },
  { firstName: "Elena", lastName: "Duarte", sex: "female" as const, dob: "2000-11-30", height: 171, weight: 66, sport: "Football", position: "Midfielder" },
  { firstName: "Sam", lastName: "Okafor", sex: "male" as const, dob: "1995-03-08", height: 178, weight: 82, sport: "General", position: null },
];

/** Rough maxes per athlete, in kg, keyed by exercise slug. */
const DEMO_MAXES: Record<string, Record<string, number>> = {
  "Priya Raman": { "back-squat": 95, deadlift: 115, "bench-press": 52.5, "overhead-press": 35, "power-clean": 62.5 },
  "Marcus Bell": { "back-squat": 180, deadlift: 220, "bench-press": 135, "overhead-press": 85, "power-clean": 115 },
  "Aisha Khan": { "back-squat": 105, deadlift: 130, "bench-press": 55, "overhead-press": 37.5, "power-clean": 65 },
  "Tom Whitfield": { "back-squat": 160, deadlift: 200, "bench-press": 120, "overhead-press": 75, "power-clean": 105 },
  "Elena Duarte": { "back-squat": 110, deadlift: 135, "bench-press": 57.5, "overhead-press": 40, "power-clean": 70 },
  "Sam Okafor": { "back-squat": 140, deadlift: 175, "bench-press": 100, "overhead-press": 62.5, "power-clean": 85 },
};

async function seedOrg(exerciseIds: Map<string, string>) {
  const [org] = await db
    .insert(organizations)
    .values({
      name: "HEME Performance",
      slug: "heme-performance",
      unitSystem: "kg",
      plateIncrementKg: 2.5,
    })
    .returning();

  const [coach] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: "coach@heme.app",
      name: "Head Coach",
      role: "owner",
    })
    .returning();

  const athleteRows = await db
    .insert(athletes)
    .values(
      DEMO_ATHLETES.map((a) => ({
        orgId: org.id,
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

  // A squad, plus an individual group — the 1:1 personal-training case.
  const [squad, ptClient] = await db
    .insert(groups)
    .values([
      {
        orgId: org.id,
        name: "Senior Squad",
        type: "team" as const,
        sport: "Rugby",
        season: "2026 Pre-season",
      },
      {
        orgId: org.id,
        name: "Sam Okafor — 1:1",
        type: "individual" as const,
        sport: "General",
      },
    ])
    .returning();

  const today = new Date().toISOString().slice(0, 10);

  await db.insert(groupMembers).values([
    ...athleteRows
      .filter((a) => a.lastName !== "Okafor")
      .map((a) => ({ groupId: squad.id, athleteId: a.id, joinedAt: today })),
    {
      groupId: ptClient.id,
      athleteId: athleteRows.find((a) => a.lastName === "Okafor")!.id,
      joinedAt: today,
    },
  ]);

  // Maxes — this is what makes %1RM prescriptions resolve to real weights.
  const maxRows = athleteRows.flatMap((a) => {
    const key = `${a.firstName} ${a.lastName}`;
    const maxes = DEMO_MAXES[key] ?? {};
    return Object.entries(maxes).flatMap(([slug, value]) => {
      const exerciseId = exerciseIds.get(slug);
      if (!exerciseId) return [];
      return [
        {
          athleteId: a.id,
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

  return { org, coach, athleteRows, squad, ptClient };
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

async function seedTemplates(orgId: string, coachId: string, exerciseIds: Map<string, string>) {
  for (const tpl of PROGRAM_TEMPLATES) {
    const totalWeeks = tpl.blocks.reduce((n, b) => n + b.weeks, 0);

    const [program] = await db
      .insert(programs)
      .values({
        orgId,
        name: tpl.name,
        description: tpl.description,
        goal: tpl.goal,
        periodizationModel: tpl.model,
        durationWeeks: totalWeeks,
        isTemplate: true,
        createdById: coachId,
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
                  weekSets.map((s, i) => setRow(insertedSlot.id, i + 1, s as TemplateSet)),
                );
            }
          }
        }
      }
    }

    console.log(`  · ${tpl.name} (${totalWeeks} weeks)`);
  }
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log("Clearing existing data…");
  await clearAll();

  console.log("Seeding exercise library…");
  const exerciseIds = await seedExercises();
  console.log(`  · ${exerciseIds.size} exercises`);

  console.log("Seeding demo organisation…");
  const { org, coach, athleteRows } = await seedOrg(exerciseIds);
  console.log(`  · ${org.name} with ${athleteRows.length} athletes`);

  console.log("Seeding program templates…");
  await seedTemplates(org.id, coach.id, exerciseIds);

  console.log("\nSeed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
