"use client";

import { useMemo, useState } from "react";
import type { LibraryExercise } from "@/lib/db/queries/exercises";
import { Badge, humanize } from "@/components/ui";

/** Modal exercise search used when adding a slot to a session block. */
export function ExercisePicker({
  exercises,
  onPick,
  onClose,
}: {
  exercises: LibraryExercise[];
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pattern, setPattern] = useState<string | null>(null);

  const patterns = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of exercises) {
      counts.set(e.movementPattern, (counts.get(e.movementPattern) ?? 0) + 1);
    }
    return [...counts.keys()].sort();
  }, [exercises]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter((e) => (pattern ? e.movementPattern === pattern : true))
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 120);
  }, [exercises, query, pattern]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the exercise library…"
            className="field field-focus"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => setPattern(null)}
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                pattern === null
                  ? "bg-accent-soft text-accent"
                  : "text-text-faint hover:bg-surface-2"
              }`}
            >
              All
            </button>
            {patterns.map((p) => (
              <button
                key={p}
                onClick={() => setPattern(p === pattern ? null : p)}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  p === pattern
                    ? "bg-accent-soft text-accent"
                    : "text-text-faint hover:bg-surface-2"
                }`}
              >
                {humanize(p)}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                onPick(e.id);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-surface-2"
            >
              <span className="flex-1 truncate text-[13px]">{e.name}</span>
              <Badge tone="info">{humanize(e.movementPattern)}</Badge>
              <span className="w-28 shrink-0 truncate text-right text-[10px] text-text-faint">
                {e.equipment.map(humanize).join(", ")}
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="p-6 text-center text-xs text-text-faint">
              Nothing matches that search.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
