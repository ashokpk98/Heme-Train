/**
 * Progression rules.
 *
 * A coach builds week 1, then says "carry this across the block". These rules
 * describe how a prescription changes week to week, which is what turns a
 * single session into a mesocycle.
 *
 * Pure: takes a set, returns a new set. No mutation, no database.
 */

import type { PrescriptionInput } from "./prescription";

export type ProgressionRule =
  /** Add a fixed number of kg to the absolute load each week. */
  | { kind: "linear_absolute"; incrementKg: number }
  /** Add a fixed number of percentage points to %1RM each week. */
  | { kind: "linear_percent"; incrementPercent: number }
  /** Explicit %1RM per week, e.g. [70, 75, 80, 65] — the last week deloads. */
  | { kind: "percent_ramp"; weeklyPercents: number[] }
  /** Explicit RPE target per week, e.g. [7, 8, 9, 6]. */
  | { kind: "rpe_ramp"; weeklyRpe: number[] }
  /** Explicit rep target per week, e.g. [5, 5, 3, 5]. */
  | { kind: "rep_ramp"; weeklyReps: number[] }
  /**
   * Double progression: climb the rep range first, then add load and reset.
   * The classic hypertrophy/accessory driver.
   */
  | {
      kind: "double_progression";
      repMin: number;
      repMax: number;
      incrementKg: number;
    };

export interface ProgressionOptions {
  /** Cap so a long block can't ramp into nonsense. */
  maxPercent?: number;
  maxRpe?: number;
}

/**
 * Apply a rule to produce week `weekOffset`'s version of a set.
 * `weekOffset` is 0-based: 0 returns the set unchanged.
 */
export function progressSet(
  set: PrescriptionInput,
  rule: ProgressionRule,
  weekOffset: number,
  options: ProgressionOptions = {},
): PrescriptionInput {
  if (weekOffset <= 0) return { ...set };

  const maxPercent = options.maxPercent ?? 100;
  const maxRpe = options.maxRpe ?? 10;

  switch (rule.kind) {
    case "linear_absolute": {
      if (set.loadKg == null) return { ...set };
      return { ...set, loadKg: set.loadKg + rule.incrementKg * weekOffset };
    }

    case "linear_percent": {
      if (set.loadPercent == null) return { ...set };
      return {
        ...set,
        loadPercent: Math.min(
          maxPercent,
          set.loadPercent + rule.incrementPercent * weekOffset,
        ),
      };
    }

    case "percent_ramp": {
      const pct = rule.weeklyPercents[weekOffset];
      // Past the end of the ramp the prescription simply holds.
      if (pct == null) return { ...set };
      return { ...set, loadPercent: Math.min(maxPercent, pct) };
    }

    case "rpe_ramp": {
      const rpe = rule.weeklyRpe[weekOffset];
      if (rpe == null) return { ...set };
      return { ...set, rpeTarget: Math.min(maxRpe, rpe) };
    }

    case "rep_ramp": {
      const reps = rule.weeklyReps[weekOffset];
      if (reps == null) return { ...set };
      return { ...set, reps };
    }

    case "double_progression": {
      const span = rule.repMax - rule.repMin;
      if (span < 0) return { ...set };
      // Each cycle walks repMin -> repMax, then bumps load and starts over.
      const cycleLength = span + 1;
      const cycle = Math.floor(weekOffset / cycleLength);
      const step = weekOffset % cycleLength;
      return {
        ...set,
        reps: rule.repMin + step,
        repMin: null,
        repMax: null,
        loadKg:
          set.loadKg == null
            ? null
            : set.loadKg + rule.incrementKg * cycle,
      };
    }
  }
}

/**
 * Expand one week's sets across `weeks` weeks.
 * Returns an array indexed by week offset, each holding that week's sets.
 */
export function projectAcrossWeeks(
  sets: PrescriptionInput[],
  rule: ProgressionRule,
  weeks: number,
  options: ProgressionOptions = {},
): PrescriptionInput[][] {
  return Array.from({ length: Math.max(0, weeks) }, (_, week) =>
    sets.map((s) => progressSet(s, rule, week, options)),
  );
}

/* ------------------------------------------------------------------ *
 * Presets for the periodization models coaches actually use
 * ------------------------------------------------------------------ */

export interface ProgressionPreset {
  id: string;
  label: string;
  description: string;
  rule: ProgressionRule;
}

export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  {
    id: "linear_2_5kg",
    label: "Linear +2.5 kg/week",
    description: "Add 2.5 kg to the bar each week. Novice linear progression.",
    rule: { kind: "linear_absolute", incrementKg: 2.5 },
  },
  {
    id: "linear_2_5pct",
    label: "Linear +2.5%/week",
    description: "Add 2.5 percentage points of 1RM each week.",
    rule: { kind: "linear_percent", incrementPercent: 2.5 },
  },
  {
    id: "accumulation_4wk",
    label: "Accumulation 70/75/80/65%",
    description:
      "Three loading weeks into a deload. Standard block accumulation wave.",
    rule: { kind: "percent_ramp", weeklyPercents: [70, 75, 80, 65] },
  },
  {
    id: "intensification_4wk",
    label: "Intensification 80/85/90/70%",
    description: "Heavier transmutation block feeding into a realization week.",
    rule: { kind: "percent_ramp", weeklyPercents: [80, 85, 90, 70] },
  },
  {
    id: "wendler_531",
    label: "5/3/1 wave 65/75/85%",
    description:
      "Wendler's three-week wave off a training max, then a deload week.",
    rule: { kind: "percent_ramp", weeklyPercents: [65, 75, 85, 60] },
  },
  {
    id: "rpe_ramp_4wk",
    label: "RPE ramp 7/8/9/6",
    description:
      "Autoregulated block: effort climbs three weeks, then backs off.",
    rule: { kind: "rpe_ramp", weeklyRpe: [7, 8, 9, 6] },
  },
  {
    id: "double_prog_8_12",
    label: "Double progression 8-12 reps",
    description:
      "Climb 8 to 12 reps, then add 2.5 kg and reset. Accessory driver.",
    rule: {
      kind: "double_progression",
      repMin: 8,
      repMax: 12,
      incrementKg: 2.5,
    },
  },
];

export function presetById(id: string): ProgressionPreset | undefined {
  return PROGRESSION_PRESETS.find((p) => p.id === id);
}
