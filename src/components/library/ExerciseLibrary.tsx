"use client";

import { useMemo, useState } from "react";
import type { LibraryExercise } from "@/lib/db/queries/exercises";
import { Badge, EmptyState, humanize } from "@/components/ui";

type FacetKey = "movementPattern" | "category" | "equipment" | "primaryMuscles";

const FACETS: { key: FacetKey; label: string; multiValue: boolean }[] = [
  { key: "movementPattern", label: "Movement pattern", multiValue: false },
  { key: "category", label: "Category", multiValue: false },
  { key: "equipment", label: "Equipment", multiValue: true },
  { key: "primaryMuscles", label: "Primary muscle", multiValue: true },
];

function valuesFor(ex: LibraryExercise, key: FacetKey): string[] {
  const v = ex[key];
  return Array.isArray(v) ? v : [v];
}

export function ExerciseLibrary({
  exercises,
}: {
  exercises: LibraryExercise[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<FacetKey, string | null>>({
    movementPattern: null,
    category: null,
    equipment: null,
    primaryMuscles: null,
  });
  const [detail, setDetail] = useState<LibraryExercise | null>(null);

  const byId = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );

  // Facet counts reflect the other active filters, so options that would
  // return nothing are visibly zeroed rather than silently dead.
  const facetOptions = useMemo(() => {
    const out: Record<FacetKey, { value: string; count: number }[]> = {
      movementPattern: [],
      category: [],
      equipment: [],
      primaryMuscles: [],
    };

    for (const facet of FACETS) {
      const others = exercises.filter((ex) =>
        FACETS.every((f) => {
          if (f.key === facet.key) return true;
          const sel = selected[f.key];
          return !sel || valuesFor(ex, f.key).includes(sel);
        }),
      );

      const counts = new Map<string, number>();
      for (const ex of others) {
        for (const v of valuesFor(ex, facet.key)) {
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }
      out[facet.key] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
    return out;
  }, [exercises, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((ex) => {
      for (const f of FACETS) {
        const sel = selected[f.key];
        if (sel && !valuesFor(ex, f.key).includes(sel)) return false;
      }
      if (!q) return true;
      // Search covers aliases too, so "RFESS" finds the Bulgarian split squat.
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.aliases.some((a) => a.toLowerCase().includes(q)) ||
        ex.tags.some((t) => t.replace(/_/g, " ").includes(q))
      );
    });
  }, [exercises, query, selected]);

  const activeCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="flex min-h-0 flex-1">
      {/* ------------------------------ filters ------------------------------ */}
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-border bg-surface p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-faint">
            Filters
          </h2>
          {activeCount > 0 && (
            <button
              onClick={() =>
                setSelected({
                  movementPattern: null,
                  category: null,
                  equipment: null,
                  primaryMuscles: null,
                })
              }
              className="text-[11px] text-accent hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="space-y-5">
          {FACETS.map((facet) => (
            <div key={facet.key}>
              <h3 className="mb-1.5 text-[11px] font-medium text-text-muted">
                {facet.label}
              </h3>
              <div className="space-y-0.5">
                {facetOptions[facet.key].slice(0, 14).map((opt) => {
                  const isActive = selected[facet.key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setSelected((s) => ({
                          ...s,
                          [facet.key]: isActive ? null : opt.value,
                        }))
                      }
                      className={`flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-[12px] transition-colors ${
                        isActive
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-text-muted hover:bg-surface-2 hover:text-text"
                      }`}
                    >
                      <span className="truncate">{humanize(opt.value)}</span>
                      <span className="ml-2 shrink-0 text-[10px] text-text-faint">
                        {opt.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ------------------------------ results ------------------------------ */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises, aliases, tags…"
            className="field field-focus max-w-sm"
          />
          <p className="text-xs text-text-faint">
            {filtered.length} of {exercises.length}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {filtered.length === 0 ? (
            <EmptyState
              title="No exercises match those filters"
              hint="Try clearing a filter or broadening your search."
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
              {filtered.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setDetail(ex)}
                  className="group rounded border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[13px] font-medium leading-snug group-hover:text-accent">
                      {ex.name}
                    </h3>
                    {ex.isMaxTestable && (
                      <Badge tone="accent" title="Can hold a 1RM record">
                        1RM
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge tone="info">{humanize(ex.movementPattern)}</Badge>
                    <Badge>{humanize(ex.category)}</Badge>
                  </div>

                  <p className="mt-2 truncate text-[11px] text-text-faint">
                    {ex.equipment.map(humanize).join(" · ") || "No equipment"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------ detail ------------------------------- */}
      {detail && (
        <ExerciseDetail
          exercise={detail}
          byId={byId}
          all={exercises}
          onClose={() => setDetail(null)}
          onNavigate={setDetail}
        />
      )}
    </div>
  );
}

function ExerciseDetail({
  exercise,
  byId,
  all,
  onClose,
  onNavigate,
}: {
  exercise: LibraryExercise;
  byId: Map<string, LibraryExercise>;
  all: LibraryExercise[];
  onClose: () => void;
  onNavigate: (ex: LibraryExercise) => void;
}) {
  // Walk back to the easiest variant, then forward through the chain, so the
  // coach sees the full regression -> progression ladder.
  const chain = useMemo(() => {
    let root = exercise;
    const guard = new Set<string>([root.id]);
    while (root.progressionOfId) {
      const parent = byId.get(root.progressionOfId);
      if (!parent || guard.has(parent.id)) break;
      guard.add(parent.id);
      root = parent;
    }

    const ordered: LibraryExercise[] = [];
    let cursor: LibraryExercise | undefined = root;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      ordered.push(cursor);
      cursor = all.find((e) => e.progressionOfId === cursor!.id);
    }
    return ordered.length > 1 ? ordered : [];
  }, [exercise, byId, all]);

  const derivedFrom = exercise.derivedFromExerciseId
    ? byId.get(exercise.derivedFromExerciseId)
    : null;

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <h2 className="text-sm font-semibold leading-snug">{exercise.name}</h2>
          {exercise.aliases.length > 0 && (
            <p className="mt-0.5 text-[11px] text-text-faint">
              {exercise.aliases.join(" · ")}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-text-faint hover:bg-surface-2 hover:text-text"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4 p-4 text-[12px]">
        <Row label="Pattern" value={humanize(exercise.movementPattern)} />
        <Row label="Category" value={humanize(exercise.category)} />
        <Row label="Laterality" value={humanize(exercise.laterality)} />
        {exercise.forceVector && (
          <Row label="Force vector" value={humanize(exercise.forceVector)} />
        )}
        <Row
          label="Emphasis"
          value={humanize(exercise.contractionEmphasis)}
        />
        <Row label="Difficulty" value={`${exercise.difficultyLevel} / 5`} />

        <Section title="Equipment">
          <TagRow values={exercise.equipment} />
        </Section>

        <Section title="Primary muscles">
          <TagRow values={exercise.primaryMuscles} tone="accent" />
        </Section>

        {exercise.secondaryMuscles.length > 0 && (
          <Section title="Secondary muscles">
            <TagRow values={exercise.secondaryMuscles} />
          </Section>
        )}

        <Section title="Tracked metrics">
          <p className="mb-1 text-[11px] text-text-faint">
            Decides which inputs the builder and logger show.
          </p>
          <TagRow values={exercise.trackedMetrics} tone="info" />
        </Section>

        <Section title="Loading">
          <p className="text-text-muted">{humanize(exercise.loadBasis)}</p>
          {derivedFrom && (
            <p className="mt-1 text-[11px] text-text-faint">
              Programmed at {Math.round((exercise.derivedRatio ?? 1) * 100)}% of{" "}
              <button
                onClick={() => onNavigate(derivedFrom)}
                className="text-accent hover:underline"
              >
                {derivedFrom.name}
              </button>
              &apos;s max.
            </p>
          )}
        </Section>

        {chain.length > 0 && (
          <Section title="Progression chain">
            <ol className="space-y-1">
              {chain.map((step, i) => (
                <li key={step.id} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-[10px] text-text-faint">
                    {i + 1}
                  </span>
                  <button
                    onClick={() => onNavigate(step)}
                    className={`truncate text-left ${
                      step.id === exercise.id
                        ? "font-medium text-accent"
                        : "text-text-muted hover:text-text hover:underline"
                    }`}
                  >
                    {step.name}
                  </button>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {exercise.coachingCues.length > 0 && (
          <Section title="Coaching cues">
            <ul className="space-y-1 text-text-muted">
              {exercise.coachingCues.map((c) => (
                <li key={c} className="flex gap-1.5">
                  <span className="text-text-faint">·</span>
                  {c}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {(exercise.defaultTempo || exercise.defaultRestSeconds) && (
          <Section title="Defaults">
            {exercise.defaultTempo && (
              <Row label="Tempo" value={exercise.defaultTempo} />
            )}
            {exercise.defaultRestSeconds && (
              <Row label="Rest" value={`${exercise.defaultRestSeconds}s`} />
            )}
          </Section>
        )}

        {exercise.tags.length > 0 && (
          <Section title="Tags">
            <TagRow values={exercise.tags} />
          </Section>
        )}
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-faint">{label}</span>
      <span className="text-right text-text-muted">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        {title}
      </h3>
      {children}
    </div>
  );
}

function TagRow({
  values,
  tone = "neutral",
}: {
  values: string[];
  tone?: "neutral" | "accent" | "info";
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((v) => (
        <Badge key={v} tone={tone}>
          {humanize(v)}
        </Badge>
      ))}
    </div>
  );
}
