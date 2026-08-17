import { asc } from "drizzle-orm";
import type { ScopedDb } from "@/lib/db";
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
 *
 * No org filter here on purpose: the `exercises_select` policy already returns
 * `org_id is null or org_id = current_org_id()`. Filtering again in SQL would
 * duplicate the rule in two places that could drift apart.
 */
export async function listExercises(tx: ScopedDb): Promise<LibraryExercise[]> {
  const rows = await tx.select().from(exercises).orderBy(asc(exercises.name));

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
