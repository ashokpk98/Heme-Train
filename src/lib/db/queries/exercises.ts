import { asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { exercises } from "@/lib/db/schema";

export interface LibraryExercise {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  movementPattern: string;
  category: string;
  laterality: string;
  forceVector: string | null;
  contractionEmphasis: string;
  equipment: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  trackedMetrics: string[];
  loadBasis: string;
  derivedFromExerciseId: string | null;
  derivedRatio: number | null;
  isMaxTestable: boolean;
  progressionOfId: string | null;
  difficultyLevel: number;
  defaultTempo: string | null;
  defaultRestSeconds: number | null;
  coachingCues: string[];
  tags: string[];
  isCustom: boolean;
}

/**
 * The global library plus this org's custom exercises.
 * Global rows carry `org_id IS NULL`, so both come back in one pass.
 */
export async function listExercises(orgId?: string): Promise<LibraryExercise[]> {
  const rows = await db
    .select()
    .from(exercises)
    .where(
      orgId
        ? or(isNull(exercises.orgId), eq(exercises.orgId, orgId))
        : isNull(exercises.orgId),
    )
    .orderBy(asc(exercises.name));

  return rows
    .filter((r) => !r.isArchived)
    .map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      aliases: r.aliases,
      movementPattern: r.movementPattern,
      category: r.category,
      laterality: r.laterality,
      forceVector: r.forceVector,
      contractionEmphasis: r.contractionEmphasis,
      equipment: r.equipment,
      primaryMuscles: r.primaryMuscles,
      secondaryMuscles: r.secondaryMuscles,
      trackedMetrics: r.trackedMetrics,
      loadBasis: r.loadBasis,
      derivedFromExerciseId: r.derivedFromExerciseId,
      derivedRatio: r.derivedRatio,
      isMaxTestable: r.isMaxTestable,
      progressionOfId: r.progressionOfId,
      difficultyLevel: r.difficultyLevel,
      defaultTempo: r.defaultTempo,
      defaultRestSeconds: r.defaultRestSeconds,
      coachingCues: r.coachingCues,
      tags: r.tags,
      isCustom: r.orgId !== null,
    }));
}
