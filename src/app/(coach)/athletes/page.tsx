import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { athleteMaxes, athletes, exercises, groupMembers, groups } from "@/lib/db/schema";
import { getDemoOrg } from "@/lib/db/queries/org";
import { Badge, EmptyState, humanize } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AthletesPage() {
  const org = await getDemoOrg();
  if (!org) {
    return (
      <div className="p-8">
        <EmptyState
          title="No organisation found"
          hint="Run `npm run db:seed` to populate the database."
        />
      </div>
    );
  }

  const roster = await db
    .select()
    .from(athletes)
    .where(eq(athletes.orgId, org.id))
    .orderBy(asc(athletes.firstName));

  const memberships = await db
    .select({
      athleteId: groupMembers.athleteId,
      groupName: groups.name,
      groupType: groups.type,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groups.orgId, org.id));

  const maxes = await db
    .select({
      athleteId: athleteMaxes.athleteId,
      exerciseName: exercises.name,
      valueKg: athleteMaxes.valueKg,
    })
    .from(athleteMaxes)
    .innerJoin(exercises, eq(exercises.id, athleteMaxes.exerciseId))
    .orderBy(asc(exercises.name));

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">Athletes</h1>
        <p className="text-xs text-text-faint">
          A 1:1 personal-training client is an athlete in a group of one — the
          same model serves both squads and individual coaching.
        </p>
      </header>

      <div className="grid gap-2">
        {roster.map((a) => {
          const inGroups = memberships.filter((m) => m.athleteId === a.id);
          const theirMaxes = maxes.filter((m) => m.athleteId === a.id);
          return (
            <div key={a.id} className="rounded border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-medium">
                  {a.firstName} {a.lastName}
                </h3>
                <Badge tone={a.status === "active" ? "ok" : "warn"}>
                  {humanize(a.status)}
                </Badge>
                {a.sport && <Badge tone="info">{a.sport}</Badge>}
                {a.position && (
                  <span className="text-[11px] text-text-faint">{a.position}</span>
                )}
                <span className="ml-auto text-[11px] text-text-faint">
                  {a.bodyweightKg ? `${a.bodyweightKg} kg` : "—"}
                  {a.heightCm ? ` · ${a.heightCm} cm` : ""}
                </span>
              </div>

              {inGroups.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {inGroups.map((g) => (
                    <Badge
                      key={g.groupName}
                      tone={g.groupType === "individual" ? "violet" : "neutral"}
                    >
                      {g.groupName}
                    </Badge>
                  ))}
                </div>
              )}

              {theirMaxes.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-text-faint">
                    Current maxes
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {theirMaxes.map((m) => (
                      <span
                        key={m.exerciseName}
                        className="text-[11px] text-text-muted"
                      >
                        {m.exerciseName}{" "}
                        <span className="font-mono text-text">{m.valueKg} kg</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
