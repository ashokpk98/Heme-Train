"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LibraryExercise } from "@/lib/db/queries/exercises";
import type { ProgramTree } from "@/lib/db/queries/programs";
import type { AthleteMaxEntry, ResolutionContext } from "@/lib/domain/prescription";
import { PROGRESSION_PRESETS } from "@/lib/domain/progression";
import { resolveSet, volumeLoad } from "@/lib/domain/prescription";
import { Badge, DAY_NAMES, EmptyState, humanize } from "@/components/ui";
import { ProgramTreePane } from "./ProgramTree";
import { SessionCanvas } from "./SessionCanvas";
import { PrescriptionInspector } from "./PrescriptionInspector";
import { ExercisePicker } from "./ExercisePicker";
import * as actions from "@/app/(coach)/programs/actions";

export interface AthleteOption {
  id: string;
  firstName: string;
  lastName: string;
  bodyweightKg: number | null;
}

export function ProgramBuilder({
  tree,
  exercises,
  athletes,
  maxesByAthlete,
  plateIncrementKg,
}: {
  tree: ProgramTree;
  exercises: LibraryExercise[];
  athletes: AthleteOption[];
  maxesByAthlete: Record<string, Record<string, AthleteMaxEntry>>;
  plateIncrementKg: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const firstMicro = tree.blocks[0]?.microcycles[0];
  const [microcycleId, setMicrocycleId] = useState<string | null>(
    firstMicro?.id ?? null,
  );
  const [sessionId, setSessionId] = useState<string | null>(
    firstMicro?.sessions[0]?.id ?? null,
  );
  const [selected, setSelected] = useState<{ slotId: string; setId: string } | null>(
    null,
  );
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null);
  const [athleteId, setAthleteId] = useState<string>(athletes[0]?.id ?? "");
  const [presetId, setPresetId] = useState<string>("");

  /* ------------------------------ lookups ------------------------------ */

  const { microcycle, session, block } = useMemo(() => {
    for (const b of tree.blocks) {
      for (const m of b.microcycles) {
        if (m.id !== microcycleId) continue;
        return {
          block: b,
          microcycle: m,
          session: m.sessions.find((s) => s.id === sessionId) ?? m.sessions[0] ?? null,
        };
      }
    }
    return { block: null, microcycle: null, session: null };
  }, [tree, microcycleId, sessionId]);

  const athlete = athletes.find((a) => a.id === athleteId) ?? null;

  const resolution: ResolutionContext = useMemo(
    () => ({
      maxes: maxesByAthlete[athleteId] ?? {},
      bodyweightKg: athlete?.bodyweightKg ?? null,
      plateIncrementKg,
      unit: "kg",
    }),
    [maxesByAthlete, athleteId, athlete, plateIncrementKg],
  );

  const selectedSlot = useMemo(() => {
    if (!selected || !session) return null;
    for (const b of session.blocks) {
      const slot = b.slots.find((s) => s.id === selected.slotId);
      if (slot) return slot;
    }
    return null;
  }, [selected, session]);

  const selectedSet =
    selectedSlot?.sets.find((s) => s.id === selected?.setId) ?? null;

  /** Prescribed volume load for the visible session, against the chosen athlete. */
  const sessionVolume = useMemo(() => {
    if (!session) return 0;
    let total = 0;
    for (const b of session.blocks) {
      for (const slot of b.slots) {
        const ctx = {
          id: slot.exercise.id,
          loadBasis: slot.exercise.loadBasis,
          derivedFromExerciseId: slot.exercise.derivedFromExerciseId,
          derivedRatio: slot.exercise.derivedRatio,
          trackedMetrics: slot.exercise.trackedMetrics,
        };
        // Circuits and EMOMs repeat their sets once per round.
        const rounds = b.structure === "straight" ? 1 : (b.rounds ?? 1);
        for (const set of slot.sets) {
          const r = resolveSet(set, ctx, resolution);
          total += volumeLoad(set.reps, r.loadKg) * rounds;
        }
      }
    }
    return Math.round(total);
  }, [session, resolution]);

  /* ------------------------------ actions ------------------------------ */

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const pid = tree.id;

  /* ------------------------------- render ------------------------------ */

  const usedDays = new Set(microcycle?.sessions.map((s) => s.dayIndex) ?? []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* -------------------------- program header -------------------------- */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-2.5">
        <div className="min-w-0">
          <h1 className="truncate text-[13px] font-semibold">{tree.name}</h1>
          <p className="text-[11px] text-text-faint">
            {tree.durationWeeks} weeks · {tree.goal}
          </p>
        </div>

        <Badge tone="violet">{humanize(tree.periodizationModel)}</Badge>
        {tree.isTemplate && <Badge tone="ok">Template</Badge>}

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-text-faint">
            Preview for
            <select
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              className="rounded border border-border bg-surface px-1.5 py-1 text-[11px] text-text"
            >
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName}
                </option>
              ))}
            </select>
          </label>

          {pending && (
            <span className="text-[11px] text-text-faint">Saving…</span>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <ProgramTreePane
          tree={tree}
          selectedMicrocycleId={microcycleId}
          selectedSessionId={session?.id ?? null}
          onSelectMicrocycle={(id) => {
            setMicrocycleId(id);
            setSessionId(null);
            setSelected(null);
          }}
          onSelectSession={(mId, sId) => {
            setMicrocycleId(mId);
            setSessionId(sId);
            setSelected(null);
          }}
        />

        {/* ---------------------------- canvas ---------------------------- */}
        <section className="flex min-w-0 flex-1 flex-col">
          {microcycle && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-2">
              <span className="text-[11px] font-medium">
                {block?.name} · Week {microcycle.weekNumber}
              </span>
              {microcycle.loadType !== "load" && (
                <Badge tone={microcycle.loadType === "test" ? "ok" : "warn"}>
                  {humanize(microcycle.loadType)}
                </Badge>
              )}

              {/* Day tabs */}
              <div className="flex items-center gap-1">
                {microcycle.sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSessionId(s.id);
                      setSelected(null);
                    }}
                    className={`rounded px-2 py-1 text-[11px] transition-colors ${
                      s.id === session?.id
                        ? "bg-accent text-accent-text"
                        : "text-text-muted hover:bg-surface-3"
                    }`}
                  >
                    {DAY_NAMES[s.dayIndex] ?? `D${s.dayIndex}`}
                  </button>
                ))}
                {[1, 2, 3, 4, 5, 6, 7]
                  .filter((d) => !usedDays.has(d))
                  .slice(0, 1)
                  .map((d) => (
                    <button
                      key={d}
                      onClick={() =>
                        run(() => actions.addSession(pid, microcycle.id, d))
                      }
                      title={`Add a session on ${DAY_NAMES[d]}`}
                      className="rounded border border-dashed border-border px-2 py-1 text-[11px] text-text-faint hover:border-accent hover:text-accent"
                    >
                      + Day
                    </button>
                  ))}
              </div>

              {/* ---------------------- bulk operations ---------------------- */}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] text-text-faint">
                  Volume load {sessionVolume.toLocaleString()} kg
                </span>

                <select
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                  title="Progression applied when copying across weeks"
                  className="rounded border border-border bg-surface px-1.5 py-1 text-[11px] text-text-muted"
                >
                  <option value="">No progression</option>
                  {PROGRESSION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() =>
                    run(() =>
                      actions.propagateWeek(
                        pid,
                        microcycle.id,
                        presetId || undefined,
                      ),
                    )
                  }
                  disabled={(block?.weeks ?? 1) < 2}
                  title="Copy this week into the rest of the block, applying the selected progression"
                  className="rounded bg-accent px-2 py-1 text-[11px] font-medium text-accent-text hover:bg-accent-hover disabled:opacity-40"
                >
                  Copy across weeks
                </button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!session ? (
              <EmptyState
                title="No session selected"
                hint="Pick a day from the tree, or add one to this week."
              />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input
                    key={session.id}
                    defaultValue={session.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== session.name) {
                        run(() =>
                          actions.updateSession(pid, session.id, { name: v }),
                        );
                      }
                    }}
                    className="rounded border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-semibold hover:border-border focus:border-accent focus:outline-none"
                  />
                  <select
                    value={session.sessionType}
                    onChange={(e) =>
                      run(() =>
                        actions.updateSession(pid, session.id, {
                          sessionType: e.target.value as never,
                        }),
                      )
                    }
                    className="rounded border border-border bg-surface px-1.5 py-1 text-[11px] text-text-muted"
                  >
                    {[
                      "strength",
                      "power",
                      "hypertrophy",
                      "conditioning",
                      "recovery",
                      "testing",
                      "skill",
                      "rest",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {humanize(t)}
                      </option>
                    ))}
                  </select>
                  {session.estimatedDurationMin && (
                    <span className="text-[11px] text-text-faint">
                      ~{session.estimatedDurationMin} min
                    </span>
                  )}
                  <button
                    onClick={() => run(() => actions.deleteSession(pid, session.id))}
                    className="ml-auto rounded border border-border px-2 py-1 text-[11px] text-text-faint hover:border-accent hover:text-accent"
                  >
                    Delete session
                  </button>
                </div>

                <SessionCanvas
                  session={session}
                  resolution={resolution}
                  selectedSetId={selected?.setId ?? null}
                  onSelectSet={(slotId, setId) => setSelected({ slotId, setId })}
                  onAddSlot={(blockId) => setPickerBlockId(blockId)}
                  onDeleteSlot={(slotId) => {
                    if (selected?.slotId === slotId) setSelected(null);
                    run(() => actions.deleteSlot(pid, slotId));
                  }}
                  onReorderSlots={(blockId, ids) =>
                    run(() => actions.reorderSlots(pid, blockId, ids))
                  }
                  onUpdateBlock={(blockId, patch) =>
                    run(() => actions.updateSessionBlock(pid, blockId, patch))
                  }
                  onDeleteBlock={(blockId) => {
                    setSelected(null);
                    run(() => actions.deleteSessionBlock(pid, blockId));
                  }}
                  onAddBlock={() =>
                    run(() => actions.addSessionBlock(pid, session.id))
                  }
                />
              </>
            )}
          </div>
        </section>

        {/* --------------------------- inspector --------------------------- */}
        <aside className="w-80 shrink-0 overflow-hidden border-l border-border bg-surface">
          {selectedSlot && selectedSet ? (
            <PrescriptionInspector
              key={selectedSet.id}
              slot={selectedSlot}
              set={selectedSet}
              resolution={resolution}
              onSave={(setId, patch) => actions.updateSet(pid, setId, patch)}
              onDelete={(setId) => {
                setSelected(null);
                run(() => actions.deleteSet(pid, setId));
              }}
              onAddSet={(slotId) => run(() => actions.addSet(pid, slotId))}
            />
          ) : (
            <div className="p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
                Prescription
              </h3>
              <p className="mt-2 text-[12px] text-text-muted">
                Select a set to edit its prescription.
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
                Load, RPE/RIR, velocity and tempo can all be prescribed on the
                same set — they are not mutually exclusive. Which inputs appear
                is driven by the exercise&apos;s tracked metrics.
              </p>
            </div>
          )}
        </aside>
      </div>

      {pickerBlockId && (
        <ExercisePicker
          exercises={exercises}
          onClose={() => setPickerBlockId(null)}
          onPick={(exerciseId) =>
            run(() => actions.addSlot(pid, pickerBlockId, exerciseId))
          }
        />
      )}
    </div>
  );
}
