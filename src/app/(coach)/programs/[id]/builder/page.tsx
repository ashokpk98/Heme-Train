import { notFound } from "next/navigation";
import { ProgramBuilder } from "@/components/builder/ProgramBuilder";
import { listExercises } from "@/lib/db/queries/exercises";
import { getDemoOrg } from "@/lib/db/queries/org";
import {
  getAthleteMaxes,
  getProgramTree,
  listAthletes,
} from "@/lib/db/queries/programs";
import type { AthleteMaxEntry } from "@/lib/domain/prescription";

export const dynamic = "force-dynamic";

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const org = await getDemoOrg();
  if (!org) notFound();

  const [tree, exercises, athletes] = await Promise.all([
    getProgramTree(id),
    listExercises(org.id),
    listAthletes(org.id),
  ]);

  if (!tree) notFound();

  // Maxes for every athlete, so switching the preview target is instant.
  const maxEntries = await Promise.all(
    athletes.map(async (a) => [a.id, await getAthleteMaxes(a.id)] as const),
  );
  const maxesByAthlete: Record<string, Record<string, AthleteMaxEntry>> =
    Object.fromEntries(maxEntries);

  return (
    <ProgramBuilder
      tree={tree}
      exercises={exercises}
      athletes={athletes}
      maxesByAthlete={maxesByAthlete}
      plateIncrementKg={org.plateIncrementKg}
    />
  );
}
