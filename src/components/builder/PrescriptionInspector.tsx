"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { TreeSet, TreeSlot } from "@/lib/db/queries/programs";
import {
  type ExerciseContext,
  type ResolutionContext,
  resolveSet,
} from "@/lib/domain/prescription";
import { Badge, humanize } from "@/components/ui";
import type { SetPatch } from "@/app/(coach)/programs/actions";

const SET_TYPES = [
  "warmup",
  "ramp",
  "working",
  "top",
  "backoff",
  "drop",
  "cluster",
  "rest_pause",
  "amrap",
  "technique",
] as const;

const PERCENT_OF = ["1rm", "training_max", "bodyweight", "e1rm"] as const;

type Draft = SetPatch;

export function PrescriptionInspector({
  slot,
  set,
  resolution,
  onSave,
  onDelete,
  onAddSet,
}: {
  slot: TreeSlot;
  set: TreeSet;
  resolution: ResolutionContext;
  onSave: (setId: string, patch: SetPatch) => void;
  onDelete: (setId: string) => void;
  onAddSet: (slotId: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>({});
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Fields edited but not yet written. The debounce cancels the previous timer,
   * so the flush has to send everything accumulated since the last save — not
   * just the field that happened to be edited last.
   */
  const unsaved = useRef<Draft>({});
  const setIdRef = useRef(set.id);

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = unsaved.current;
    unsaved.current = {};
    if (Object.keys(patch).length === 0) return;
    const targetId = setIdRef.current;
    startTransition(() => onSave(targetId, patch));
  }

  // Write any pending edits before switching to a different set, then reset.
  useEffect(() => {
    if (setIdRef.current !== set.id) {
      flush();
      setIdRef.current = set.id;
      setDraft({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.id]);

  // Don't lose the last keystrokes if the component unmounts mid-debounce.
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = <K extends keyof Draft>(key: K): Draft[K] =>
    key in draft ? draft[key] : (set[key as keyof TreeSet] as Draft[K]);

  function change(patch: Draft) {
    setDraft((d) => ({ ...d, ...patch }));
    unsaved.current = { ...unsaved.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    // Debounced so typing a percentage doesn't fire a write per keystroke.
    timer.current = setTimeout(flush, 400);
  }

  const exercise = slot.exercise;
  const tracks = (m: string) => exercise.trackedMetrics.includes(m as never);

  const exerciseCtx: ExerciseContext = {
    id: exercise.id,
    loadBasis: exercise.loadBasis,
    derivedFromExerciseId: exercise.derivedFromExerciseId,
    derivedRatio: exercise.derivedRatio,
    trackedMetrics: exercise.trackedMetrics,
  };

  // Preview reflects unsaved edits immediately.
  const merged = { ...set, ...draft };
  const resolved = resolveSet(merged, exerciseCtx, resolution);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-text-faint">
              {slot.letterLabel} · Set {set.setNumber}
            </p>
            <h3 className="truncate text-[13px] font-semibold">
              {exercise.name}
            </h3>
          </div>
          {pending && (
            <span className="shrink-0 text-[10px] text-text-faint">Saving…</span>
          )}
        </div>

        {/* Live preview of what the athlete will read. */}
        <div className="mt-2 rounded border border-border bg-surface-2 p-2">
          <p className="text-[10px] uppercase tracking-wide text-text-faint">
            Athlete sees
          </p>
          <p className="mt-0.5 font-mono text-[12px] leading-snug">
            {resolved.displayText}
          </p>
          {resolved.unresolvedReason === "no_max_recorded" && (
            <p className="mt-1 text-[10px] text-warn">
              No max on file — load resolves once one is recorded.
            </p>
          )}
          {resolved.loadSource === "derived_from_exercise" && (
            <p className="mt-1 text-[10px] text-text-faint">
              Derived from the source lift&apos;s max ×{" "}
              {exercise.derivedRatio ?? 1}.
            </p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Field label="Set type">
          <select
            value={(value("setType") as string) ?? "working"}
            onChange={(e) => change({ setType: e.target.value as never })}
            className="field field-focus"
          >
            {SET_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
        </Field>

        {/* ------------------------------ volume ---------------------------- */}
        {tracks("reps") && (
          <Group title="Volume">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Reps">
                <NumberInput
                  value={value("reps") as number | null}
                  onChange={(v) => change({ reps: v })}
                />
              </Field>
              <Field label="Min">
                <NumberInput
                  value={value("repMin") as number | null}
                  onChange={(v) => change({ repMin: v })}
                />
              </Field>
              <Field label="Max">
                <NumberInput
                  value={value("repMax") as number | null}
                  onChange={(v) => change({ repMax: v })}
                />
              </Field>
            </div>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
              <input
                type="checkbox"
                checked={Boolean(value("isAmrap"))}
                onChange={(e) => change({ isAmrap: e.target.checked })}
              />
              AMRAP (as many reps as possible)
            </label>
          </Group>
        )}

        {/* ------------------------------- load ----------------------------- */}
        {tracks("load") && (
          <Group
            title="Load"
            hint="Absolute weight overrides a percentage when both are set."
          >
            <div className="grid grid-cols-2 gap-2">
              <Field label="Absolute (kg)">
                <NumberInput
                  step={0.5}
                  value={value("loadKg") as number | null}
                  onChange={(v) => change({ loadKg: v })}
                />
              </Field>
              <Field label="Percent (%)">
                <NumberInput
                  step={0.5}
                  value={value("loadPercent") as number | null}
                  onChange={(v) => change({ loadPercent: v })}
                />
              </Field>
            </div>
            <Field label="Percent of">
              <select
                value={(value("percentOf") as string) ?? ""}
                onChange={(e) =>
                  change({
                    percentOf: (e.target.value || null) as never,
                  })
                }
                className="field field-focus"
              >
                <option value="">—</option>
                {PERCENT_OF.map((p) => (
                  <option key={p} value={p}>
                    {humanize(p)}
                  </option>
                ))}
              </select>
            </Field>
          </Group>
        )}

        {/* -------------------------- autoregulation ------------------------ */}
        <Group
          title="Autoregulation"
          hint="Rides alongside the load rather than replacing it."
        >
          <div className="grid grid-cols-2 gap-2">
            <Field label="RPE target">
              <NumberInput
                step={0.5}
                max={10}
                value={value("rpeTarget") as number | null}
                onChange={(v) => change({ rpeTarget: v })}
              />
            </Field>
            <Field label="RIR target">
              <NumberInput
                step={1}
                value={value("rirTarget") as number | null}
                onChange={(v) => change({ rirTarget: v })}
              />
            </Field>
          </div>
        </Group>

        {/* ------------------------------ velocity -------------------------- */}
        {tracks("velocity") && (
          <Group title="Velocity (VBT)">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Min (m/s)">
                <NumberInput
                  step={0.05}
                  value={value("velocityTargetMin") as number | null}
                  onChange={(v) => change({ velocityTargetMin: v })}
                />
              </Field>
              <Field label="Max (m/s)">
                <NumberInput
                  step={0.05}
                  value={value("velocityTargetMax") as number | null}
                  onChange={(v) => change({ velocityTargetMax: v })}
                />
              </Field>
            </div>
            <Field label="Stop at velocity loss (%)">
              <NumberInput
                step={1}
                value={value("velocityLossThresholdPct") as number | null}
                onChange={(v) => change({ velocityLossThresholdPct: v })}
              />
            </Field>
          </Group>
        )}

        {/* ------------------------- non-load metrics ----------------------- */}
        {(tracks("time") || tracks("distance") || tracks("calories") || tracks("height")) && (
          <Group title="Other metrics">
            <div className="grid grid-cols-2 gap-2">
              {tracks("time") && (
                <Field label="Duration (s)">
                  <NumberInput
                    value={value("durationSec") as number | null}
                    onChange={(v) => change({ durationSec: v })}
                  />
                </Field>
              )}
              {tracks("distance") && (
                <Field label="Distance (m)">
                  <NumberInput
                    value={value("distanceM") as number | null}
                    onChange={(v) => change({ distanceM: v })}
                  />
                </Field>
              )}
              {tracks("calories") && (
                <Field label="Calories">
                  <NumberInput
                    value={value("calories") as number | null}
                    onChange={(v) => change({ calories: v })}
                  />
                </Field>
              )}
              {tracks("height") && (
                <Field label="Height (cm)">
                  <NumberInput
                    value={value("heightCm") as number | null}
                    onChange={(v) => change({ heightCm: v })}
                  />
                </Field>
              )}
            </div>
          </Group>
        )}

        {/* ----------------------------- execution -------------------------- */}
        <Group title="Execution">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tempo" hint="ecc-pause-con-pause">
              <input
                value={(value("tempo") as string) ?? ""}
                onChange={(e) => change({ tempo: e.target.value || null })}
                placeholder="3-1-X-0"
                className="field field-focus font-mono"
              />
            </Field>
            <Field label="Rest (s)">
              <NumberInput
                step={15}
                value={value("restSeconds") as number | null}
                onChange={(v) => change({ restSeconds: v })}
              />
            </Field>
          </div>
        </Group>

        <Group title="Notes">
          <textarea
            value={(value("notes") as string) ?? ""}
            onChange={(e) => change({ notes: e.target.value || null })}
            rows={2}
            placeholder="Coaching note for this set…"
            className="field field-focus resize-y"
          />
        </Group>

        <div className="mt-4 flex gap-2 border-t border-border pt-3">
          <button
            onClick={() => onAddSet(slot.id)}
            className="flex-1 rounded border border-border px-2 py-1.5 text-[11px] text-text-muted hover:bg-surface-2 hover:text-text"
          >
            + Add set
          </button>
          <button
            onClick={() => onDelete(set.id)}
            className="rounded border border-border px-2 py-1.5 text-[11px] text-text-faint hover:border-accent hover:text-accent"
          >
            Delete set
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          <span className="text-[10px] text-text-faint">Tracks:</span>
          {exercise.trackedMetrics.map((m) => (
            <Badge key={m} tone="info">
              {humanize(m)}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- primitives ------------------------------ */

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 border-t border-border pt-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-text-faint">
        {title}
      </h4>
      {hint && <p className="mb-1.5 mt-0.5 text-[10px] text-text-faint">{hint}</p>}
      <div className={hint ? "" : "mt-1.5"}>{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-1.5 block">
      <span className="mb-0.5 block text-[10px] text-text-faint">
        {label}
        {hint && <span className="ml-1 opacity-70">({hint})</span>}
      </span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
  max,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      step={step}
      max={max}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? null : Number(raw));
      }}
      className="field field-focus"
    />
  );
}
