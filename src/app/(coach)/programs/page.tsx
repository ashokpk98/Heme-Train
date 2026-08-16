import Link from "next/link";
import { withCoach } from "@/lib/auth/session";
import { listPrograms } from "@/lib/db/queries/programs";
import { Badge, EmptyState, humanize } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const { programs, coachName } = await withCoach(async (tx, coach) => ({
    programs: await listPrograms(tx),
    coachName: coach.name,
  }));

  const templates = programs.filter((p) => p.isTemplate);
  const working = programs.filter((p) => !p.isTemplate);

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">Programs</h1>
        <p className="text-xs text-text-faint">
          Everything here is yours, {coachName} — programs and athletes are
          private to the coach who owns them.
        </p>
      </header>

      {working.length > 0 && (
        <Section title="Your programs">
          {working.map((p) => (
            <ProgramCard key={p.id} program={p} />
          ))}
        </Section>
      )}

      {templates.length > 0 ? (
        <Section title="Templates">
          {templates.map((p) => (
            <ProgramCard key={p.id} program={p} />
          ))}
        </Section>
      ) : (
        working.length === 0 && (
          <EmptyState
            title="No programs yet"
            hint="Run `npm run db:seed` to load the starter templates, or create a program."
          />
        )
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        {title}
      </h2>
      <div className="grid gap-2">{children}</div>
    </section>
  );
}

function ProgramCard({
  program,
}: {
  program: {
    id: string;
    name: string;
    description: string | null;
    goal: string | null;
    periodizationModel: string;
    durationWeeks: number;
    isTemplate: boolean;
    isOrgShared: boolean;
  };
}) {
  return (
    <Link
      href={`/programs/${program.id}/builder`}
      className="group rounded border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium group-hover:text-accent">
            {program.name}
          </h3>
          {program.description && (
            <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
              {program.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone="violet">{humanize(program.periodizationModel)}</Badge>
          {program.isOrgShared && <Badge tone="info">Shared</Badge>}
          <span className="text-[11px] text-text-faint">
            {program.durationWeeks} weeks
          </span>
        </div>
      </div>
      {program.goal && (
        <p className="mt-2 text-[11px] text-text-faint">Goal: {program.goal}</p>
      )}
    </Link>
  );
}
