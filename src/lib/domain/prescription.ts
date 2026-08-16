/**
 * Prescription resolution.
 *
 * Turns a stored `prescribed_sets` row into what a coach or athlete actually
 * reads: "82.5 kg x 5 @ RPE 8 · 3-1-X-0 · 0.45-0.60 m/s".
 *
 * The design point of HEME's builder is that absolute load, %1RM, RPE/RIR,
 * velocity and tempo are NOT mutually exclusive — a single set can carry all of
 * them. This module decides which one determines the number on the bar and
 * which ones ride along as execution targets.
 *
 * Pure: no database, no React. Shared by the builder preview, the athlete view
 * and (later) report generation.
 */

import type { TrackedMetric } from "@/lib/db/schema/enums";

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

export type PercentOf = "1rm" | "training_max" | "bodyweight" | "e1rm";

export type LoadBasis =
  | "own_1rm"
  | "derived_from_exercise"
  | "bodyweight"
  | "absolute_only";

/** The subset of a `prescribed_sets` row this module needs. */
export interface PrescriptionInput {
  reps?: number | null;
  repMin?: number | null;
  repMax?: number | null;
  isAmrap?: boolean | null;
  clusterReps?: number | null;
  clusterRestSec?: number | null;

  loadKg?: number | null;
  loadPercent?: number | null;
  percentOf?: PercentOf | null;

  rpeTarget?: number | null;
  rirTarget?: number | null;

  velocityTargetMin?: number | null;
  velocityTargetMax?: number | null;
  velocityLossThresholdPct?: number | null;

  tempo?: string | null;
  restSeconds?: number | null;

  durationSec?: number | null;
  distanceM?: number | null;
  calories?: number | null;
  heightCm?: number | null;
}

/** The subset of an `exercises` row this module needs. */
export interface ExerciseContext {
  id: string;
  loadBasis: LoadBasis;
  derivedFromExerciseId?: string | null;
  derivedRatio?: number | null;
  trackedMetrics: TrackedMetric[];
}

export interface AthleteMaxEntry {
  oneRepMaxKg: number;
  trainingMaxKg?: number | null;
}

export interface ResolutionContext {
  /** exerciseId -> current max. Missing entries degrade gracefully. */
  maxes: Record<string, AthleteMaxEntry>;
  bodyweightKg?: number | null;
  /** Smallest achievable load change, in kg. Loads round to a multiple of this. */
  plateIncrementKg?: number;
  unit?: "kg" | "lb";
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

export type LoadSource =
  | "absolute"
  | "percent_1rm"
  | "percent_training_max"
  | "percent_bodyweight"
  | "percent_e1rm"
  | "derived_from_exercise"
  | "bodyweight"
  | null;

export type UnresolvedReason =
  | "no_max_recorded"
  | "no_bodyweight_recorded"
  | "no_source_exercise"
  | "no_load_prescribed";

export interface ResolvedPrescription {
  /** Resolved working load in kg, rounded to the plate increment. */
  loadKg: number | null;
  /** Same load in the caller's display unit. */
  loadDisplay: number | null;
  loadSource: LoadSource;
  /** Set when loadKg is null and a load was expected. */
  unresolvedReason: UnresolvedReason | null;

  loadText: string;
  volumeText: string;
  /** Execution targets that ride alongside the load: RPE, velocity, tempo. */
  intensityText: string[];
  restText: string | null;
  /** Everything joined into the one line the UI shows. */
  displayText: string;
}

const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Round a load to the nearest achievable plate increment. */
export function roundToIncrement(kg: number, incrementKg: number): number {
  if (!Number.isFinite(incrementKg) || incrementKg <= 0) return kg;
  const rounded = Math.round(kg / incrementKg) * incrementKg;
  // Guard against float dust: 82.50000000000001 -> 82.5
  return Math.round(rounded * 1000) / 1000;
}

/* ------------------------------------------------------------------ *
 * Load resolution
 * ------------------------------------------------------------------ */

interface LoadResult {
  kg: number | null;
  source: LoadSource;
  reason: UnresolvedReason | null;
}

/**
 * Work out the reference weight that a percentage applies to, following the
 * exercise's `loadBasis`. Handles lifts programmed off another lift's max
 * (front squat at 85% of the back squat max).
 */
function referenceLoad(
  exercise: ExerciseContext,
  percentOf: PercentOf,
  ctx: ResolutionContext,
): { kg: number | null; reason: UnresolvedReason | null } {
  if (percentOf === "bodyweight") {
    return ctx.bodyweightKg && ctx.bodyweightKg > 0
      ? { kg: ctx.bodyweightKg, reason: null }
      : { kg: null, reason: "no_bodyweight_recorded" };
  }

  // Which exercise's max do we read?
  let sourceId = exercise.id;
  let ratio = 1;

  if (exercise.loadBasis === "derived_from_exercise") {
    if (!exercise.derivedFromExerciseId) {
      return { kg: null, reason: "no_source_exercise" };
    }
    sourceId = exercise.derivedFromExerciseId;
    ratio = exercise.derivedRatio ?? 1;
  }

  const entry = ctx.maxes[sourceId];
  if (!entry || !Number.isFinite(entry.oneRepMaxKg) || entry.oneRepMaxKg <= 0) {
    return { kg: null, reason: "no_max_recorded" };
  }

  // A training max is an explicitly stored conservative number; fall back to
  // the Wendler-standard 90% when the coach hasn't set one.
  const base =
    percentOf === "training_max"
      ? (entry.trainingMaxKg ?? entry.oneRepMaxKg * 0.9)
      : entry.oneRepMaxKg;

  return { kg: base * ratio, reason: null };
}

function resolveLoad(
  set: PrescriptionInput,
  exercise: ExerciseContext,
  ctx: ResolutionContext,
): LoadResult {
  const increment = ctx.plateIncrementKg ?? 2.5;

  // An explicit absolute load always wins — the coach typed a number.
  if (set.loadKg != null && Number.isFinite(set.loadKg)) {
    return {
      kg: roundToIncrement(set.loadKg, increment),
      source: "absolute",
      reason: null,
    };
  }

  if (set.loadPercent != null && Number.isFinite(set.loadPercent)) {
    const percentOf = set.percentOf ?? "1rm";
    const ref = referenceLoad(exercise, percentOf, ctx);
    if (ref.kg === null) {
      return { kg: null, source: null, reason: ref.reason };
    }

    const raw = ref.kg * (set.loadPercent / 100);
    const source: LoadSource =
      exercise.loadBasis === "derived_from_exercise"
        ? "derived_from_exercise"
        : percentOf === "training_max"
          ? "percent_training_max"
          : percentOf === "bodyweight"
            ? "percent_bodyweight"
            : percentOf === "e1rm"
              ? "percent_e1rm"
              : "percent_1rm";

    return { kg: roundToIncrement(raw, increment), source, reason: null };
  }

  // Bodyweight movements carry a real load even with nothing prescribed.
  if (exercise.loadBasis === "bodyweight") {
    return ctx.bodyweightKg && ctx.bodyweightKg > 0
      ? { kg: ctx.bodyweightKg, source: "bodyweight", reason: null }
      : { kg: null, source: null, reason: "no_bodyweight_recorded" };
  }

  return { kg: null, source: null, reason: "no_load_prescribed" };
}

/* ------------------------------------------------------------------ *
 * Text formatting
 * ------------------------------------------------------------------ */

function formatNumber(n: number): string {
  // 82.5 -> "82.5", 100 -> "100"
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}min` : `${m}min ${s}s`;
}

/** Reps, time, distance — whichever this exercise actually tracks. */
export function formatVolume(
  set: PrescriptionInput,
  exercise: ExerciseContext,
): string {
  const tracks = (m: TrackedMetric) => exercise.trackedMetrics.includes(m);
  const parts: string[] = [];

  if (tracks("reps")) {
    if (set.repMin != null && set.repMax != null) {
      parts.push(`${set.repMin}-${set.repMax}`);
    } else if (set.reps != null) {
      parts.push(set.isAmrap ? `${set.reps}+` : String(set.reps));
    } else if (set.isAmrap) {
      parts.push("AMRAP");
    }
    if (set.clusterReps != null) {
      parts.push(`(cluster ${set.clusterReps})`);
    }
  }

  if (tracks("time") && set.durationSec != null) {
    parts.push(formatDuration(set.durationSec));
  }
  if (tracks("distance") && set.distanceM != null) {
    parts.push(`${formatNumber(set.distanceM)}m`);
  }
  if (tracks("calories") && set.calories != null) {
    parts.push(`${set.calories}cal`);
  }
  if (tracks("height") && set.heightCm != null) {
    parts.push(`${formatNumber(set.heightCm)}cm`);
  }

  return parts.join(" ");
}

/**
 * Execution targets that accompany the load. This is the part competitors drop:
 * RPE, velocity and tempo survive alongside a percentage-based load.
 */
export function formatIntensityTargets(
  set: PrescriptionInput,
  exercise: ExerciseContext,
): string[] {
  const tracks = (m: TrackedMetric) => exercise.trackedMetrics.includes(m);
  const out: string[] = [];

  if (set.rpeTarget != null) out.push(`RPE ${formatNumber(set.rpeTarget)}`);
  if (set.rirTarget != null) out.push(`${formatNumber(set.rirTarget)} RIR`);

  if (tracks("velocity")) {
    const { velocityTargetMin: lo, velocityTargetMax: hi } = set;
    if (lo != null && hi != null) {
      out.push(`${formatNumber(lo)}-${formatNumber(hi)} m/s`);
    } else if (lo != null) {
      out.push(`≥ ${formatNumber(lo)} m/s`);
    } else if (hi != null) {
      out.push(`≤ ${formatNumber(hi)} m/s`);
    }
    if (set.velocityLossThresholdPct != null) {
      out.push(`stop at ${formatNumber(set.velocityLossThresholdPct)}% vel. loss`);
    }
  }

  if (set.tempo) out.push(`tempo ${set.tempo}`);

  return out;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Resolve one prescribed set for one athlete.
 *
 * Degrades gracefully: when no max is on file the load reads "—" and the rest
 * of the prescription (reps, RPE, tempo) still renders, so a coach can build a
 * program before anyone has tested.
 */
export function resolveSet(
  set: PrescriptionInput,
  exercise: ExerciseContext,
  ctx: ResolutionContext,
): ResolvedPrescription {
  const unit = ctx.unit ?? "kg";
  const { kg, source, reason } = resolveLoad(set, exercise, ctx);

  const loadDisplay =
    kg === null ? null : unit === "lb" ? Math.round(kgToLb(kg) * 10) / 10 : kg;

  const tracksLoad = exercise.trackedMetrics.includes("load");

  let loadText: string;
  if (!tracksLoad) {
    loadText = "";
  } else if (loadDisplay === null) {
    // Still show the coach's intent even when it can't be resolved to a number.
    loadText =
      set.loadPercent != null ? `— (${formatNumber(set.loadPercent)}%)` : "—";
  } else {
    const pct =
      set.loadPercent != null && source !== "absolute"
        ? ` (${formatNumber(set.loadPercent)}%)`
        : "";
    loadText = `${formatNumber(loadDisplay)} ${unit}${pct}`;
  }

  const volumeText = formatVolume(set, exercise);
  const intensityText = formatIntensityTargets(set, exercise);
  const restText =
    set.restSeconds != null ? `rest ${formatDuration(set.restSeconds)}` : null;

  const head = [loadText, volumeText].filter(Boolean).join(" × ");
  const tail = intensityText.length ? ` @ ${intensityText.join(" · ")}` : "";
  const displayText = (head + tail).trim() || "—";

  return {
    loadKg: kg,
    loadDisplay,
    loadSource: source,
    unresolvedReason: reason,
    loadText,
    volumeText,
    intensityText,
    restText,
    displayText,
  };
}

/**
 * Volume load for a single set: reps × load. The base unit of nearly every
 * training-load report, so it lives here rather than in a report module.
 */
export function volumeLoad(reps: number | null, loadKg: number | null): number {
  if (reps == null || loadKg == null) return 0;
  return reps * loadKg;
}

/** Total prescribed volume load across a list of resolved sets. */
export function totalVolumeLoad(
  sets: Array<{ reps?: number | null }>,
  resolved: ResolvedPrescription[],
): number {
  return sets.reduce(
    (sum, s, i) => sum + volumeLoad(s.reps ?? null, resolved[i]?.loadKg ?? null),
    0,
  );
}
