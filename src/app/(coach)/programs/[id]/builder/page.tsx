import { notFound } from "next/navigation";
import { ProgramBuilder } from "@/components/builder/ProgramBuilder";
import { withCoach } from "@/lib/auth/session";
import { listExercises } from "@/lib/db/queries/exercises";
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

  const data = await withCoach(async (tx, coach) => {
    // RLS decides this: a program belonging to another coach simply isn't found.
    const tree = await getProgramTree(tx, id);
    if (!tree) return null;

    const [exercises, athletes] = await Promise.all([
      listExercises(tx),
      listAthletes(tx),
    ]);

    // Maxes for every athlete this coach owns, so switching the preview target
    // is instant. Sequential because they share one transaction.
    const maxesByAthlete: Record<string, Record<string, AthleteMaxEntry>> = {};
    for (const a of athletes) {
      maxesByAthlete[a.id] = await getAthleteMaxes(tx, a.id);
    }

    return {
      tree,
      exercises,
      athletes,
      maxesByAthlete,
      plateIncrementKg: coach.plateIncrementKg,
    };
  });

  if (!data) notFound();

  return (
    <ProgramBuilder
      tree={data.tree}
      exercises={data.exercises}
      athletes={data.athletes}
      maxesByAthlete={data.maxesByAthlete}
      plateIncrementKg={data.plateIncrementKg}
    />
  );
}
