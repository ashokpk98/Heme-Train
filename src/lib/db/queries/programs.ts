import { asc, desc, eq } from "drizzle-orm";
import type { ScopedDb } from "@/lib/db";
import { athleteMaxes, athletes, programs } from "@/lib/db/schema";
import type { AthleteMaxEntry } from "@/lib/domain/prescription";

/*
 * Every function here takes the RLS-scoped transaction from `withCoach`.
 * None of them filter by org or coach: the policies do that, so the rule lives
 * in exactly one place. A missing `where` returns nothing, not another coach's
 * data.
 */

export async function listPrograms(tx: ScopedDb) {
  return tx
    .select()
    .from(programs)
    .where(eq(programs.isArchived, false))
    .orderBy(desc(programs.isTemplate), asc(programs.name));
}

/** The whole program tree in one round trip, ordered at every level. */
export async function getProgramTree(tx: ScopedDb, programId: string) {
  return tx.query.programs.findFirst({
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

/** Only the athletes this coach owns — enforced by the `athletes_all` policy. */
export async function listAthletes(tx: ScopedDb) {
  return tx
    .select({
      id: athletes.id,
      firstName: athletes.firstName,
      lastName: athletes.lastName,
      bodyweightKg: athletes.bodyweightKg,
      sport: athletes.sport,
    })
    .from(athletes)
    .orderBy(asc(athletes.firstName));
}

/**
 * Current max per exercise for one athlete, keyed by exercise id — the shape
 * `resolveSet` expects. Maxes are append-only, so the newest `testedAt` per
 * exercise wins.
 *
 * Returns empty for an athlete this coach does not own: RLS filters the rows
 * rather than raising, so a crafted id yields no data instead of an error that
 * would confirm the athlete exists.
 */
export async function getAthleteMaxes(
  tx: ScopedDb,
  athleteId: string,
): Promise<Record<string, AthleteMaxEntry>> {
  const rows = await tx
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
