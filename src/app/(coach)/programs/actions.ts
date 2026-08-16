"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { ScopedDb } from "@/lib/db";
import { withCoach } from "@/lib/auth/session";
import {
  exerciseSlots,
  exercises,
  microcycles,
  prescribedSets,
  sessionBlocks,
  sessions,
  programs,
} from "@/lib/db/schema";
import { presetById, progressSet } from "@/lib/domain/progression";
import type { PrescriptionInput } from "@/lib/domain/prescription";

/*
 * Every mutation runs through `withCoach`, so the transaction assumes the
 * `authenticated` role and RLS applies. Ids arriving from the client are
 * therefore harmless: a set id belonging to another coach simply matches no
 * rows.
 *
 * That silence is the reason for `assertProgram` — without it a cross-tenant
 * write would look like a successful no-op in the UI instead of an error.
 */

function refresh(programId: string) {
  revalidatePath(`/programs/${programId}/builder`);
}

/** Throws unless the signed-in coach may modify this program. */
async function assertProgram(tx: ScopedDb, programId: string) {
  const [row] = await tx
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);
  if (!row) throw new Error("Program not found, or you do not have access.");
}

/* ------------------------------------------------------------------ *
 * Prescribed sets
 * ------------------------------------------------------------------ */

/** Numeric prescription fields, editable from the inspector. */
export type SetPatch = Partial<{
  setType:
    | "warmup"
    | "ramp"
    | "working"
    | "top"
    | "backoff"
    | "drop"
    | "cluster"
    | "rest_pause"
    | "amrap"
    | "technique";
  reps: number | null;
  repMin: number | null;
  repMax: number | null;
  isAmrap: boolean;
  loadKg: number | null;
  loadPercent: number | null;
  percentOf: "1rm" | "training_max" | "bodyweight" | "e1rm" | null;
  rpeTarget: number | null;
  rirTarget: number | null;
  velocityTargetMin: number | null;
  velocityTargetMax: number | null;
  velocityLossThresholdPct: number | null;
  tempo: string | null;
  restSeconds: number | null;
  durationSec: number | null;
  distanceM: number | null;
  calories: number | null;
  heightCm: number | null;
  notes: string | null;
}>;

export async function updateSet(
  programId: string,
  setId: string,
  patch: SetPatch,
) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);
    await tx
      .update(prescribedSets)
      .set(patch)
      .where(eq(prescribedSets.id, setId));
    refresh(programId);
  });
}

/** Adds a set by copying the last one — coaches almost always want a repeat. */
export async function addSet(programId: string, slotId: string) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);

    const existing = await tx
      .select()
      .from(prescribedSets)
      .where(eq(prescribedSets.slotId, slotId))
      .orderBy(asc(prescribedSets.setNumber));

    const last = existing.at(-1);
    if (last) {
      const { id: _id, ...clone } = last;
      await tx
        .insert(prescribedSets)
        .values({ ...clone, slotId, setNumber: existing.length + 1 });
    } else {
      await tx.insert(prescribedSets).values({
        slotId,
        setNumber: 1,
        setType: "working",
        reps: 5,
      });
    }

    refresh(programId);
  });
}

export async function deleteSet(programId: string, setId: string) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);

    const [row] = await tx
      .select({ slotId: prescribedSets.slotId })
      .from(prescribedSets)
      .where(eq(prescribedSets.id, setId));
    if (!row) return;

    await tx.delete(prescribedSets).where(eq(prescribedSets.id, setId));
    await renumberSets(tx, row.slotId);
    refresh(programId);
  });
}

async function renumberSets(tx: ScopedDb, slotId: string) {
  const remaining = await tx
    .select({ id: prescribedSets.id })
    .from(prescribedSets)
    .where(eq(prescribedSets.slotId, slotId))
    .orderBy(asc(prescribedSets.setNumber));

  // Sequential rather than Promise.all: these share one transaction, and
  // postgres-js runs a transaction's statements on a single connection.
  for (const [i, r] of remaining.entries()) {
    await tx
      .update(prescribedSets)
      .set({ setNumber: i + 1 })
      .where(eq(prescribedSets.id, r.id));
  }
}

/* ------------------------------------------------------------------ *
 * Exercise slots
 * ------------------------------------------------------------------ */

export async function addSlot(
  programId: string,
  sessionBlockId: string,
  exerciseId: string,
) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);

    const [block] = await tx
      .select()
      .from(sessionBlocks)
      .where(eq(sessionBlocks.id, sessionBlockId));
    if (!block) return;

    const siblings = await tx
      .select({ id: exerciseSlots.id })
      .from(exerciseSlots)
      .where(eq(exerciseSlots.sessionBlockId, sessionBlockId));

    const [exercise] = await tx
      .select()
      .from(exercises)
      .where(eq(exercises.id, exerciseId));

    const [slot] = await tx
      .insert(exerciseSlots)
      .values({
        sessionBlockId,
        exerciseId,
        orderIndex: siblings.length,
        letterLabel: `${String.fromCharCode(65 + (block.orderIndex % 26))}${siblings.length + 1}`,
      })
      .returning();

    // Seed one working set shaped by what the exercise actually tracks, so the
    // inspector opens with the right fields rather than an empty weight box.
    const tracks = (m: string) => exercise?.trackedMetrics.includes(m as never);
    await tx.insert(prescribedSets).values({
      slotId: slot.id,
      setNumber: 1,
      setType: "working",
      reps: tracks("reps") ? 5 : null,
      durationSec: !tracks("reps") && tracks("time") ? 30 : null,
      distanceM:
        !tracks("reps") && !tracks("time") && tracks("distance") ? 20 : null,
      tempo: exercise?.defaultTempo ?? null,
      restSeconds: exercise?.defaultRestSeconds ?? null,
      percentOf: exercise?.loadBasis === "absolute_only" ? null : "1rm",
    });

    refresh(programId);
    return slot.id;
  });
}

export async function deleteSlot(programId: string, slotId: string) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);

    const [row] = await tx
      .select({ blockId: exerciseSlots.sessionBlockId })
      .from(exerciseSlots)
      .where(eq(exerciseSlots.id, slotId));
    if (!row) return;

    await tx.delete(exerciseSlots).where(eq(exerciseSlots.id, slotId));
    await relabelSlots(tx, row.blockId);
    refresh(programId);
  });
}

export async function reorderSlots(
  programId: string,
  sessionBlockId: string,
  orderedSlotIds: string[],
) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);

    for (const [i, id] of orderedSlotIds.entries()) {
      await tx
        .update(exerciseSlots)
        .set({ orderIndex: i })
        .where(eq(exerciseSlots.id, id));
    }
    await relabelSlots(tx, sessionBlockId);
    refresh(programId);
  });
}

/** Keeps A1/A2/B1 labels in step with the block and slot order. */
async function relabelSlots(tx: ScopedDb, sessionBlockId: string) {
  const [block] = await tx
    .select({ orderIndex: sessionBlocks.orderIndex })
    .from(sessionBlocks)
    .where(eq(sessionBlocks.id, sessionBlockId));
  if (!block) return;

  const slots = await tx
    .select({ id: exerciseSlots.id })
    .from(exerciseSlots)
    .where(eq(exerciseSlots.sessionBlockId, sessionBlockId))
    .orderBy(asc(exerciseSlots.orderIndex));

  const letter = String.fromCharCode(65 + (block.orderIndex % 26));
  for (const [i, s] of slots.entries()) {
    await tx
      .update(exerciseSlots)
      .set({ orderIndex: i, letterLabel: `${letter}${i + 1}` })
      .where(eq(exerciseSlots.id, s.id));
  }
}

/* ------------------------------------------------------------------ *
 * Session blocks
 * ------------------------------------------------------------------ */

export async function addSessionBlock(programId: string, sessionId: string) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);

    const siblings = await tx
      .select({ id: sessionBlocks.id })
      .from(sessionBlocks)
      .where(eq(sessionBlocks.sessionId, sessionId));

    await tx.insert(sessionBlocks).values({
      sessionId,
      name: "New block",
      orderIndex: siblings.length,
      blockType: "accessory",
      structure: "straight",
    });
    refresh(programId);
  });
}

export async function updateSessionBlock(
  programId: string,
  blockId: string,
  patch: Partial<{
    name: string | null;
    blockType:
      | "warmup"
      | "activation"
      | "power"
      | "main_strength"
      | "accessory"
      | "conditioning"
      | "cooldown";
    structure:
      | "straight"
      | "superset"
      | "triset"
      | "circuit"
      | "complex"
      | "contrast"
      | "emom"
      | "amrap"
      | "for_time"
      | "interval";
    rounds: number | null;
    restBetweenRoundsSec: number | null;
    workIntervalSec: number | null;
    notes: string | null;
  }>,
) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);
    await tx
      .update(sessionBlocks)
      .set(patch)
      .where(eq(sessionBlocks.id, blockId));
    refresh(programId);
  });
}

export async function deleteSessionBlock(programId: string, blockId: string) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);
    await tx.delete(sessionBlocks).where(eq(sessionBlocks.id, blockId));
    refresh(programId);
  });
}

/* ------------------------------------------------------------------ *
 * Bulk operations — what makes this a builder rather than a form
 * ------------------------------------------------------------------ */

/**
 * Clone one week across the rest of its block, optionally applying a
 * progression preset so week N differs from week 1 by the rule.
 *
 * This is the same `progressSet` the seeder uses to expand templates, so
 * "apply across weeks" in the UI and a seeded template produce identical maths.
 */
export async function propagateWeek(
  programId: string,
  sourceMicrocycleId: string,
  presetId?: string,
) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);

    const [source] = await tx
      .select()
      .from(microcycles)
      .where(eq(microcycles.id, sourceMicrocycleId));
    if (!source) return;

    const targets = await tx
      .select()
      .from(microcycles)
      .where(
        and(
          eq(microcycles.blockId, source.blockId),
          ne(microcycles.id, sourceMicrocycleId),
        ),
      )
      .orderBy(asc(microcycles.weekNumber));

    const rule = presetId ? presetById(presetId)?.rule : undefined;

    // Read the source week once, in full.
    const sourceSessions = await tx.query.sessions.findMany({
      where: eq(sessions.microcycleId, sourceMicrocycleId),
      orderBy: (s, { asc }) => [asc(s.dayIndex)],
      with: {
        blocks: {
          orderBy: (sb, { asc }) => [asc(sb.orderIndex)],
          with: {
            slots: {
              orderBy: (sl, { asc }) => [asc(sl.orderIndex)],
              with: { sets: { orderBy: (ps, { asc }) => [asc(ps.setNumber)] } },
            },
          },
        },
      },
    });

    for (const target of targets) {
      // Week offset drives the progression rule; weeks are 1-based in the schema.
      const weekOffset = target.weekNumber - source.weekNumber;

      // Replace the target week wholesale. Cascades clear blocks/slots/sets.
      const existing = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.microcycleId, target.id));
      if (existing.length) {
        await tx.delete(sessions).where(
          inArray(
            sessions.id,
            existing.map((s) => s.id),
          ),
        );
      }

      for (const srcSession of sourceSessions) {
        const [newSession] = await tx
          .insert(sessions)
          .values({
            microcycleId: target.id,
            dayIndex: srcSession.dayIndex,
            name: srcSession.name,
            sessionType: srcSession.sessionType,
            estimatedDurationMin: srcSession.estimatedDurationMin,
            notes: srcSession.notes,
          })
          .returning();

        for (const srcBlock of srcSession.blocks) {
          const [newBlock] = await tx
            .insert(sessionBlocks)
            .values({
              sessionId: newSession.id,
              name: srcBlock.name,
              orderIndex: srcBlock.orderIndex,
              blockType: srcBlock.blockType,
              structure: srcBlock.structure,
              rounds: srcBlock.rounds,
              restBetweenRoundsSec: srcBlock.restBetweenRoundsSec,
              timeCapSec: srcBlock.timeCapSec,
              workIntervalSec: srcBlock.workIntervalSec,
              notes: srcBlock.notes,
            })
            .returning();

          for (const srcSlot of srcBlock.slots) {
            const [newSlot] = await tx
              .insert(exerciseSlots)
              .values({
                sessionBlockId: newBlock.id,
                exerciseId: srcSlot.exerciseId,
                orderIndex: srcSlot.orderIndex,
                letterLabel: srcSlot.letterLabel,
                notes: srcSlot.notes,
                coachingCues: srcSlot.coachingCues,
              })
              .returning();

            if (srcSlot.sets.length === 0) continue;

            await tx.insert(prescribedSets).values(
              srcSlot.sets.map((s) => {
                const progressed = rule
                  ? (progressSet(
                      s as PrescriptionInput,
                      rule,
                      weekOffset,
                    ) as PrescriptionInput)
                  : (s as PrescriptionInput);

                return {
                  slotId: newSlot.id,
                  setNumber: s.setNumber,
                  setType: s.setType,
                  reps: progressed.reps ?? null,
                  repMin: progressed.repMin ?? null,
                  repMax: progressed.repMax ?? null,
                  isAmrap: progressed.isAmrap ?? false,
                  clusterReps: progressed.clusterReps ?? null,
                  clusterRestSec: progressed.clusterRestSec ?? null,
                  loadKg: progressed.loadKg ?? null,
                  loadPercent: progressed.loadPercent ?? null,
                  percentOf: progressed.percentOf ?? null,
                  rpeTarget: progressed.rpeTarget ?? null,
                  rirTarget: progressed.rirTarget ?? null,
                  velocityTargetMin: progressed.velocityTargetMin ?? null,
                  velocityTargetMax: progressed.velocityTargetMax ?? null,
                  velocityLossThresholdPct:
                    progressed.velocityLossThresholdPct ?? null,
                  tempo: progressed.tempo ?? null,
                  restSeconds: progressed.restSeconds ?? null,
                  durationSec: progressed.durationSec ?? null,
                  distanceM: progressed.distanceM ?? null,
                  calories: progressed.calories ?? null,
                  heightCm: progressed.heightCm ?? null,
                  notes: s.notes,
                };
              }),
            );
          }
        }
      }
    }

    refresh(programId);
  });
}

/** Copy one session onto another day in the same week. */
export async function duplicateSession(
  programId: string,
  sessionId: string,
  targetDayIndex: number,
) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);

    const src = await tx.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      with: {
        blocks: {
          orderBy: (sb, { asc }) => [asc(sb.orderIndex)],
          with: {
            slots: {
              orderBy: (sl, { asc }) => [asc(sl.orderIndex)],
              with: { sets: { orderBy: (ps, { asc }) => [asc(ps.setNumber)] } },
            },
          },
        },
      },
    });
    if (!src) return;

    const [newSession] = await tx
      .insert(sessions)
      .values({
        microcycleId: src.microcycleId,
        dayIndex: targetDayIndex,
        name: src.name,
        sessionType: src.sessionType,
        estimatedDurationMin: src.estimatedDurationMin,
        notes: src.notes,
      })
      .returning();

    for (const b of src.blocks) {
      const [nb] = await tx
        .insert(sessionBlocks)
        .values({
          sessionId: newSession.id,
          name: b.name,
          orderIndex: b.orderIndex,
          blockType: b.blockType,
          structure: b.structure,
          rounds: b.rounds,
          restBetweenRoundsSec: b.restBetweenRoundsSec,
          timeCapSec: b.timeCapSec,
          workIntervalSec: b.workIntervalSec,
          notes: b.notes,
        })
        .returning();

      for (const sl of b.slots) {
        const [ns] = await tx
          .insert(exerciseSlots)
          .values({
            sessionBlockId: nb.id,
            exerciseId: sl.exerciseId,
            orderIndex: sl.orderIndex,
            letterLabel: sl.letterLabel,
            notes: sl.notes,
            coachingCues: sl.coachingCues,
          })
          .returning();

        if (sl.sets.length) {
          await tx.insert(prescribedSets).values(
            sl.sets.map(
              ({ id: _id, slotId: _slotId, orgId: _o, programId: _p, ...rest }) => ({
                ...rest,
                slotId: ns.id,
              }),
            ),
          );
        }
      }
    }

    refresh(programId);
  });
}

export async function addSession(
  programId: string,
  microcycleId: string,
  dayIndex: number,
) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);
    await tx.insert(sessions).values({
      microcycleId,
      dayIndex,
      name: "New session",
      sessionType: "strength",
    });
    refresh(programId);
  });
}

export async function deleteSession(programId: string, sessionId: string) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);
    await tx.delete(sessions).where(eq(sessions.id, sessionId));
    refresh(programId);
  });
}

export async function updateSession(
  programId: string,
  sessionId: string,
  patch: Partial<{
    name: string;
    sessionType:
      | "strength"
      | "power"
      | "hypertrophy"
      | "conditioning"
      | "recovery"
      | "testing"
      | "skill"
      | "rest";
    estimatedDurationMin: number | null;
    notes: string | null;
  }>,
) {
  return withCoach(async (tx) => {
    await assertProgram(tx, programId);
    await tx.update(sessions).set(patch).where(eq(sessions.id, sessionId));
    refresh(programId);
  });
}
