import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  athleteMaxes,
  athletes,
  programs,
} from "@/lib/db/schema";
import type { AthleteMaxEntry } from "@/lib/domain/prescription";

export async function listPrograms(orgId: string) {
  return db
    .select()
    .from(programs)
    .where(and(eq(programs.orgId, orgId), eq(programs.isArchived, false)))
    .orderBy(desc(programs.isTemplate), asc(programs.name));
}

/**
 * The whole program tree in one round trip.
 * Ordering is applied at every level so the builder never has to sort.
 */
export async function getProgramTree(programId: string) {
  return db.query.programs.findFirst({
    where: eq(programs.id, programId),
    with: {
      blocks: {
        orderBy: (b, { asc }) => [asc(b.orderIndex)],
        with: {
          microcycles: {
            orderBy: (m, { asc }) => [asc(m.weekNumber)],
            with: {
              sessions: {
                orderBy: (s, { asc }) => [asc(s.dayIndex)],
                with: {
                  blocks: {
                    orderBy: (sb, { asc }) => [asc(sb.orderIndex)],
                    with: {
                      slots: {
                        orderBy: (sl, { asc }) => [asc(sl.orderIndex)],
                        with: {
                          exercise: true,
                          sets: {
                            orderBy: (ps, { asc }) => [asc(ps.setNumber)],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

export type ProgramTree = NonNullable<Awaited<ReturnType<typeof getProgramTree>>>;
export type TreeBlock = ProgramTree["blocks"][number];
export type TreeMicrocycle = TreeBlock["microcycles"][number];
export type TreeSession = TreeMicrocycle["sessions"][number];
export type TreeSessionBlock = TreeSession["blocks"][number];
export type TreeSlot = TreeSessionBlock["slots"][number];
export type TreeSet = TreeSlot["sets"][number];

export async function listAthletes(orgId: string) {
  return db
    .select({
      id: athletes.id,
      firstName: athletes.firstName,
      lastName: athletes.lastName,
      bodyweightKg: athletes.bodyweightKg,
      sport: athletes.sport,
    })
    .from(athletes)
    .where(eq(athletes.orgId, orgId))
    .orderBy(asc(athletes.firstName));
}

/**
 * Current max per exercise for one athlete, keyed by exercise id — the shape
 * `resolveSet` expects. Maxes are append-only, so the newest `testedAt` per
 * exercise wins.
 */
export async function getAthleteMaxes(
  athleteId: string,
): Promise<Record<string, AthleteMaxEntry>> {
  const rows = await db
    .select()
    .from(athleteMaxes)
    .where(eq(athleteMaxes.athleteId, athleteId))
    .orderBy(desc(athleteMaxes.testedAt));

  const out: Record<string, AthleteMaxEntry> = {};
  for (const r of rows) {
    // Rows arrive newest-first, so the first hit per exercise is current.
    if (out[r.exerciseId]) continue;
    out[r.exerciseId] = {
      oneRepMaxKg: r.valueKg,
      trainingMaxKg: r.trainingMaxKg,
    };
  }
  return out;
}
