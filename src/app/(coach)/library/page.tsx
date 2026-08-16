import { ExerciseLibrary } from "@/components/library/ExerciseLibrary";
import { listExercises } from "@/lib/db/queries/exercises";
import { getDemoOrg } from "@/lib/db/queries/org";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const org = await getDemoOrg();
  const exercises = await listExercises(org?.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-surface px-5 py-3">
        <h1 className="text-sm font-semibold">Exercise Library</h1>
        <p className="text-xs text-text-faint">
          Tagged by movement pattern, equipment and tracked metrics — the same
          taxonomy the builder filters on.
        </p>
      </div>
      <ExerciseLibrary exercises={exercises} />
    </div>
  );
}
