/**
 * Starter program templates — one per periodization model coaches actually use.
 *
 * A template describes week 1 of each block plus a progression rule; the seeder
 * expands that across the block's weeks using the same `progressSet` the
 * builder's "apply across weeks" button calls. One source of truth for how a
 * program grows.
 */

import type { ProgressionRule } from "@/lib/domain/progression";
import type { PrescriptionInput } from "@/lib/domain/prescription";

type BlockType =
  | "accumulation"
  | "transmutation"
  | "realization"
  | "deload"
  | "taper"
  | "gpp"
  | "spp"
  | "in_season"
  | "off_season"
  | "pre_season"
  | "return_to_play";

type SessionType =
  | "strength"
  | "power"
  | "hypertrophy"
  | "conditioning"
  | "recovery"
  | "testing"
  | "skill"
  | "rest";

type SessionBlockType =
  | "warmup"
  | "activation"
  | "power"
  | "main_strength"
  | "accessory"
  | "conditioning"
  | "cooldown";

type Structure =
  | "straight"
  | "superset"
  | "triset"
  | "circuit"
  | "complex"
  | "contrast"
  | "emom"
  | "amrap"
  | "for_time"
  | "interval";

type LoadType = "load" | "unload" | "deload" | "test";

export interface TemplateSet extends PrescriptionInput {
  notes?: string | null;
  setType?:
    | "warmup"
    | "ramp"
    | "working"
    | "top"
    | "backoff"
    | "drop"
    | "cluster"
    | "rest_pause"
    | "amrap"
    | "technique";
}

export interface TemplateSlot {
  /** Slug from the exercise library. */
  exercise: string;
  notes?: string;
  sets: TemplateSet[];
}

export interface TemplateSessionBlock {
  name?: string;
  type: SessionBlockType;
  structure?: Structure;
  rounds?: number;
  restBetweenRoundsSec?: number;
  timeCapSec?: number;
  workIntervalSec?: number;
  notes?: string;
  slots: TemplateSlot[];
}

export interface TemplateSession {
  dayIndex: number;
  name: string;
  type: SessionType;
  durationMin?: number;
  notes?: string;
  blocks: TemplateSessionBlock[];
}

export interface TemplateBlock {
  name: string;
  type: BlockType;
  weeks: number;
  volumeEmphasis?: number;
  intensityEmphasis?: number;
  /** Per-week load type; index 0 is week 1. Defaults to all "load". */
  weekLoadTypes?: LoadType[];
  /** Applied to every set to generate weeks 2..n. */
  progression?: ProgressionRule;
  notes?: string;
  sessions: TemplateSession[];
}

export interface ProgramTemplate {
  name: string;
  description: string;
  goal: string;
  model:
    | "linear"
    | "block"
    | "undulating_daily"
    | "undulating_weekly"
    | "conjugate"
    | "concurrent"
    | "reverse_linear"
    | "autoregulated"
    | "none";
  blocks: TemplateBlock[];
}

/* ------------------------------------------------------------------ *
 * Reusable pieces
 * ------------------------------------------------------------------ */

const GENERAL_WARMUP: TemplateSessionBlock = {
  name: "Movement prep",
  type: "warmup",
  structure: "circuit",
  rounds: 2,
  restBetweenRoundsSec: 30,
  slots: [
    { exercise: "worlds-greatest-stretch", sets: [{ reps: 5 }] },
    { exercise: "glute-bridge-march", sets: [{ reps: 10 }] },
    { exercise: "band-pull-apart", sets: [{ reps: 15 }] },
  ],
};

const SPRINT_WARMUP: TemplateSessionBlock = {
  name: "Sprint prep",
  type: "warmup",
  structure: "circuit",
  rounds: 2,
  restBetweenRoundsSec: 45,
  slots: [
    { exercise: "a-skip", sets: [{ distanceM: 20 }] },
    { exercise: "b-skip", sets: [{ distanceM: 20 }] },
    { exercise: "pogo-hop", sets: [{ reps: 15 }] },
  ],
};

/* ------------------------------------------------------------------ *
 * 1. Linear periodization
 * ------------------------------------------------------------------ */

const LINEAR: ProgramTemplate = {
  name: "Linear Periodization — 4 Week Strength",
  description:
    "Classic Matveyev progression: volume falls as intensity climbs across four weeks, closing with a deload. Best fit for novice to early-intermediate lifters.",
  goal: "Maximal strength",
  model: "linear",
  blocks: [
    {
      name: "Strength Accumulation",
      type: "accumulation",
      weeks: 4,
      volumeEmphasis: 4,
      intensityEmphasis: 3,
      weekLoadTypes: ["load", "load", "load", "deload"],
      progression: { kind: "percent_ramp", weeklyPercents: [70, 75, 80, 65] },
      sessions: [
        {
          dayIndex: 1,
          name: "Lower — Squat Focus",
          type: "strength",
          durationMin: 75,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Main lift",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "back-squat",
                  sets: [
                    { setType: "warmup", reps: 5, loadPercent: 40, percentOf: "1rm", restSeconds: 60 },
                    { setType: "warmup", reps: 3, loadPercent: 55, percentOf: "1rm", restSeconds: 60 },
                    { setType: "working", reps: 5, loadPercent: 70, percentOf: "1rm", rpeTarget: 7, tempo: "3-0-X-0", restSeconds: 180 },
                    { setType: "working", reps: 5, loadPercent: 70, percentOf: "1rm", rpeTarget: 7.5, tempo: "3-0-X-0", restSeconds: 180 },
                    { setType: "working", reps: 5, loadPercent: 70, percentOf: "1rm", rpeTarget: 8, tempo: "3-0-X-0", restSeconds: 180 },
                  ],
                },
              ],
            },
            {
              name: "Posterior chain pair",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "romanian-deadlift", sets: [{ reps: 8, rpeTarget: 7, tempo: "3-1-1-0" }] },
                { exercise: "bulgarian-split-squat", sets: [{ reps: 10, rpeTarget: 7 }] },
              ],
            },
            {
              name: "Core",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 60,
              slots: [
                { exercise: "pallof-press", sets: [{ reps: 10 }] },
                { exercise: "plank", sets: [{ durationSec: 45 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 3,
          name: "Upper — Press Focus",
          type: "strength",
          durationMin: 70,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Main lift",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "bench-press",
                  sets: [
                    { setType: "warmup", reps: 5, loadPercent: 40, percentOf: "1rm", restSeconds: 60 },
                    { setType: "working", reps: 5, loadPercent: 70, percentOf: "1rm", rpeTarget: 7, restSeconds: 180 },
                    { setType: "working", reps: 5, loadPercent: 70, percentOf: "1rm", rpeTarget: 7.5, restSeconds: 180 },
                    { setType: "working", reps: 5, loadPercent: 70, percentOf: "1rm", rpeTarget: 8, restSeconds: 180 },
                  ],
                },
              ],
            },
            {
              name: "Push / pull pair",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "barbell-row", sets: [{ reps: 8, rpeTarget: 7 }] },
                { exercise: "seated-dumbbell-shoulder-press", sets: [{ reps: 10, rpeTarget: 7 }] },
              ],
            },
            {
              name: "Arms & shoulder health",
              type: "accessory",
              structure: "triset",
              rounds: 3,
              restBetweenRoundsSec: 60,
              slots: [
                { exercise: "face-pull", sets: [{ reps: 15 }] },
                { exercise: "dumbbell-curl", sets: [{ reps: 12 }] },
                { exercise: "triceps-pushdown", sets: [{ reps: 12 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 5,
          name: "Lower — Hinge Focus",
          type: "strength",
          durationMin: 75,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Main lift",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "deadlift",
                  sets: [
                    { setType: "warmup", reps: 5, loadPercent: 45, percentOf: "1rm", restSeconds: 90 },
                    { setType: "working", reps: 4, loadPercent: 70, percentOf: "1rm", rpeTarget: 7.5, restSeconds: 240 },
                    { setType: "working", reps: 4, loadPercent: 70, percentOf: "1rm", rpeTarget: 8, restSeconds: 240 },
                    { setType: "working", reps: 4, loadPercent: 70, percentOf: "1rm", rpeTarget: 8, restSeconds: 240 },
                  ],
                },
              ],
            },
            {
              name: "Accessory",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "barbell-hip-thrust", sets: [{ reps: 10, rpeTarget: 7 }] },
                { exercise: "nordic-hamstring-curl", sets: [{ reps: 5, tempo: "5-0-1-0" }] },
              ],
            },
            {
              name: "Carry finisher",
              type: "conditioning",
              structure: "straight",
              slots: [
                { exercise: "farmers-carry", sets: [{ distanceM: 40, restSeconds: 90 }, { distanceM: 40, restSeconds: 90 }, { distanceM: 40 }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 2. Block periodization
 * ------------------------------------------------------------------ */

const BLOCK: ProgramTemplate = {
  name: "Block Periodization — Accumulation to Realization",
  description:
    "Issurin-style sequencing: a hypertrophy-biased accumulation block, a heavier transmutation block, then a realization week to express the strength built.",
  goal: "Peak maximal strength",
  model: "block",
  blocks: [
    {
      name: "Accumulation",
      type: "accumulation",
      weeks: 4,
      volumeEmphasis: 5,
      intensityEmphasis: 2,
      weekLoadTypes: ["load", "load", "load", "deload"],
      progression: { kind: "percent_ramp", weeklyPercents: [65, 70, 75, 60] },
      notes: "High volume, moderate intensity. Build work capacity and tissue.",
      sessions: [
        {
          dayIndex: 1,
          name: "Squat Volume",
          type: "hypertrophy",
          durationMin: 80,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Main lift",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "back-squat",
                  sets: [
                    { setType: "working", reps: 8, loadPercent: 65, percentOf: "1rm", rpeTarget: 7, restSeconds: 150 },
                    { setType: "working", reps: 8, loadPercent: 65, percentOf: "1rm", rpeTarget: 7.5, restSeconds: 150 },
                    { setType: "working", reps: 8, loadPercent: 65, percentOf: "1rm", rpeTarget: 8, restSeconds: 150 },
                    { setType: "working", reps: 8, loadPercent: 65, percentOf: "1rm", rpeTarget: 8, restSeconds: 150 },
                  ],
                },
              ],
            },
            {
              name: "Accessory",
              type: "accessory",
              structure: "superset",
              rounds: 4,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "leg-press", sets: [{ repMin: 10, repMax: 12, rpeTarget: 8 }] },
                { exercise: "lying-leg-curl", sets: [{ repMin: 10, repMax: 12, rpeTarget: 8 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 2,
          name: "Upper Volume",
          type: "hypertrophy",
          durationMin: 75,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Press",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "bench-press",
                  sets: [
                    { setType: "working", reps: 8, loadPercent: 65, percentOf: "1rm", rpeTarget: 7, restSeconds: 150 },
                    { setType: "working", reps: 8, loadPercent: 65, percentOf: "1rm", rpeTarget: 8, restSeconds: 150 },
                    { setType: "working", reps: 8, loadPercent: 65, percentOf: "1rm", rpeTarget: 8, restSeconds: 150 },
                  ],
                },
              ],
            },
            {
              name: "Pull volume",
              type: "accessory",
              structure: "superset",
              rounds: 4,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "chest-supported-row", sets: [{ repMin: 10, repMax: 12, rpeTarget: 8 }] },
                { exercise: "lat-pulldown", sets: [{ repMin: 10, repMax: 12, rpeTarget: 8 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 4,
          name: "Hinge Volume",
          type: "hypertrophy",
          durationMin: 75,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Main lift",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "trap-bar-deadlift",
                  sets: [
                    { setType: "working", reps: 6, loadPercent: 65, percentOf: "1rm", rpeTarget: 7, restSeconds: 180 },
                    { setType: "working", reps: 6, loadPercent: 65, percentOf: "1rm", rpeTarget: 8, restSeconds: 180 },
                    { setType: "working", reps: 6, loadPercent: 65, percentOf: "1rm", rpeTarget: 8, restSeconds: 180 },
                  ],
                },
              ],
            },
            {
              name: "Posterior chain",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "romanian-deadlift", sets: [{ reps: 10, rpeTarget: 8, tempo: "3-1-1-0" }] },
                { exercise: "back-extension", sets: [{ reps: 12 }] },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "Transmutation",
      type: "transmutation",
      weeks: 3,
      volumeEmphasis: 3,
      intensityEmphasis: 4,
      weekLoadTypes: ["load", "load", "load"],
      progression: { kind: "percent_ramp", weeklyPercents: [80, 85, 87.5] },
      notes: "Volume drops, intensity climbs. Convert size into usable strength.",
      sessions: [
        {
          dayIndex: 1,
          name: "Squat Intensity",
          type: "strength",
          durationMin: 75,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Main lift",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "back-squat",
                  sets: [
                    { setType: "ramp", reps: 3, loadPercent: 65, percentOf: "1rm", restSeconds: 120 },
                    { setType: "working", reps: 3, loadPercent: 80, percentOf: "1rm", rpeTarget: 8, velocityTargetMin: 0.5, restSeconds: 210 },
                    { setType: "working", reps: 3, loadPercent: 80, percentOf: "1rm", rpeTarget: 8.5, velocityTargetMin: 0.45, restSeconds: 210 },
                    { setType: "working", reps: 3, loadPercent: 80, percentOf: "1rm", rpeTarget: 9, velocityTargetMin: 0.45, restSeconds: 210 },
                  ],
                },
              ],
            },
            {
              name: "Accessory",
              type: "accessory",
              structure: "straight",
              slots: [
                { exercise: "bulgarian-split-squat", sets: [{ reps: 8, rpeTarget: 8, restSeconds: 90 }, { reps: 8, rpeTarget: 8, restSeconds: 90 }, { reps: 8, rpeTarget: 8 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 3,
          name: "Bench Intensity",
          type: "strength",
          durationMin: 70,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Main lift",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "bench-press",
                  sets: [
                    { setType: "ramp", reps: 3, loadPercent: 65, percentOf: "1rm", restSeconds: 120 },
                    { setType: "working", reps: 3, loadPercent: 80, percentOf: "1rm", rpeTarget: 8, restSeconds: 210 },
                    { setType: "working", reps: 3, loadPercent: 80, percentOf: "1rm", rpeTarget: 8.5, restSeconds: 210 },
                    { setType: "working", reps: 3, loadPercent: 80, percentOf: "1rm", rpeTarget: 9, restSeconds: 210 },
                  ],
                },
              ],
            },
            {
              name: "Accessory",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "close-grip-bench-press", sets: [{ reps: 6, rpeTarget: 8 }] },
                { exercise: "single-arm-dumbbell-row", sets: [{ reps: 10 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 5,
          name: "Deadlift Intensity",
          type: "strength",
          durationMin: 70,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Main lift",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "deadlift",
                  sets: [
                    { setType: "ramp", reps: 3, loadPercent: 65, percentOf: "1rm", restSeconds: 150 },
                    { setType: "working", reps: 2, loadPercent: 80, percentOf: "1rm", rpeTarget: 8, restSeconds: 240 },
                    { setType: "working", reps: 2, loadPercent: 80, percentOf: "1rm", rpeTarget: 8.5, restSeconds: 240 },
                    { setType: "working", reps: 2, loadPercent: 80, percentOf: "1rm", rpeTarget: 9, restSeconds: 240 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "Realization",
      type: "realization",
      weeks: 1,
      volumeEmphasis: 1,
      intensityEmphasis: 5,
      weekLoadTypes: ["test"],
      notes: "Open the taps. Work up to a heavy single on each competition lift.",
      sessions: [
        {
          dayIndex: 1,
          name: "Squat Test",
          type: "testing",
          durationMin: 60,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Work to a top single",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "back-squat",
                  sets: [
                    { setType: "ramp", reps: 3, loadPercent: 70, percentOf: "1rm", restSeconds: 150 },
                    { setType: "ramp", reps: 2, loadPercent: 85, percentOf: "1rm", restSeconds: 180 },
                    { setType: "top", reps: 1, loadPercent: 95, percentOf: "1rm", rpeTarget: 9, restSeconds: 300 },
                    { setType: "top", reps: 1, loadPercent: 100, percentOf: "1rm", rpeTarget: 9.5, restSeconds: 300 },
                  ],
                },
              ],
            },
          ],
        },
        {
          dayIndex: 4,
          name: "Bench & Deadlift Test",
          type: "testing",
          durationMin: 75,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Bench top single",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "bench-press",
                  sets: [
                    { setType: "ramp", reps: 2, loadPercent: 85, percentOf: "1rm", restSeconds: 180 },
                    { setType: "top", reps: 1, loadPercent: 100, percentOf: "1rm", rpeTarget: 9.5, restSeconds: 300 },
                  ],
                },
              ],
            },
            {
              name: "Deadlift top single",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "deadlift",
                  sets: [
                    { setType: "ramp", reps: 2, loadPercent: 85, percentOf: "1rm", restSeconds: 210 },
                    { setType: "top", reps: 1, loadPercent: 100, percentOf: "1rm", rpeTarget: 9.5, restSeconds: 300 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 3. Daily undulating periodization
 * ------------------------------------------------------------------ */

const DUP: ProgramTemplate = {
  name: "Daily Undulating Periodization — 3 Day",
  description:
    "Heavy, moderate and light days inside the same week, so strength, hypertrophy and power qualities are all trained without waiting for a block to end. Strong fit for intermediates.",
  goal: "Concurrent strength and hypertrophy",
  model: "undulating_daily",
  blocks: [
    {
      name: "DUP Wave",
      type: "accumulation",
      weeks: 4,
      volumeEmphasis: 4,
      intensityEmphasis: 4,
      weekLoadTypes: ["load", "load", "load", "deload"],
      progression: { kind: "linear_percent", incrementPercent: 2.5 },
      sessions: [
        {
          dayIndex: 1,
          name: "Heavy Day — 3-5 reps",
          type: "strength",
          durationMin: 75,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Squat heavy",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "back-squat",
                  sets: [
                    { setType: "working", reps: 4, loadPercent: 82.5, percentOf: "1rm", rpeTarget: 8, velocityTargetMin: 0.45, restSeconds: 210 },
                    { setType: "working", reps: 4, loadPercent: 82.5, percentOf: "1rm", rpeTarget: 8.5, restSeconds: 210 },
                    { setType: "working", reps: 4, loadPercent: 82.5, percentOf: "1rm", rpeTarget: 9, restSeconds: 210 },
                  ],
                },
              ],
            },
            {
              name: "Bench heavy",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "bench-press",
                  sets: [
                    { setType: "working", reps: 4, loadPercent: 82.5, percentOf: "1rm", rpeTarget: 8, restSeconds: 180 },
                    { setType: "working", reps: 4, loadPercent: 82.5, percentOf: "1rm", rpeTarget: 8.5, restSeconds: 180 },
                    { setType: "working", reps: 4, loadPercent: 82.5, percentOf: "1rm", rpeTarget: 9, restSeconds: 180 },
                  ],
                },
              ],
            },
          ],
        },
        {
          dayIndex: 3,
          name: "Power Day — speed work",
          type: "power",
          durationMin: 60,
          blocks: [
            SPRINT_WARMUP,
            {
              name: "Contrast pair",
              type: "power",
              structure: "contrast",
              rounds: 5,
              restBetweenRoundsSec: 180,
              notes:
                "Heavy squat potentiates the jump. Rest 20-30s between the pair.",
              slots: [
                { exercise: "back-squat", sets: [{ reps: 3, loadPercent: 85, percentOf: "1rm", velocityTargetMin: 0.4 }] },
                { exercise: "countermovement-jump", sets: [{ reps: 3 }] },
              ],
            },
            {
              name: "Olympic speed",
              type: "power",
              structure: "straight",
              slots: [
                {
                  exercise: "hang-power-clean",
                  sets: [
                    { setType: "working", reps: 3, loadPercent: 70, percentOf: "1rm", velocityTargetMin: 1.3, velocityLossThresholdPct: 10, restSeconds: 150 },
                    { setType: "working", reps: 3, loadPercent: 70, percentOf: "1rm", velocityTargetMin: 1.3, velocityLossThresholdPct: 10, restSeconds: 150 },
                    { setType: "working", reps: 3, loadPercent: 70, percentOf: "1rm", velocityTargetMin: 1.3, velocityLossThresholdPct: 10, restSeconds: 150 },
                  ],
                },
              ],
            },
          ],
        },
        {
          dayIndex: 5,
          name: "Hypertrophy Day — 8-12 reps",
          type: "hypertrophy",
          durationMin: 80,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Volume squat",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "front-squat",
                  sets: [
                    { setType: "working", repMin: 8, repMax: 10, loadPercent: 65, percentOf: "1rm", rpeTarget: 8, restSeconds: 120 },
                    { setType: "working", repMin: 8, repMax: 10, loadPercent: 65, percentOf: "1rm", rpeTarget: 8, restSeconds: 120 },
                    { setType: "working", repMin: 8, repMax: 10, loadPercent: 65, percentOf: "1rm", rpeTarget: 8.5, restSeconds: 120 },
                  ],
                },
              ],
            },
            {
              name: "Upper volume",
              type: "accessory",
              structure: "superset",
              rounds: 4,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "incline-dumbbell-press", sets: [{ repMin: 10, repMax: 12, rpeTarget: 8 }] },
                { exercise: "single-arm-dumbbell-row", sets: [{ repMin: 10, repMax: 12, rpeTarget: 8 }] },
              ],
            },
            {
              name: "Arms",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 60,
              slots: [
                { exercise: "dumbbell-curl", sets: [{ repMin: 10, repMax: 12 }] },
                { exercise: "triceps-pushdown", sets: [{ repMin: 12, repMax: 15 }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 4. Conjugate
 * ------------------------------------------------------------------ */

const CONJUGATE: ProgramTemplate = {
  name: "Conjugate — Max Effort / Dynamic Effort",
  description:
    "Westside-style rotation. Max-effort and dynamic-effort days for upper and lower each week, so no strength quality detrains while another is being built.",
  goal: "Maximal and explosive strength",
  model: "conjugate",
  blocks: [
    {
      name: "Conjugate Wave",
      type: "accumulation",
      weeks: 3,
      volumeEmphasis: 3,
      intensityEmphasis: 5,
      weekLoadTypes: ["load", "load", "load"],
      progression: { kind: "percent_ramp", weeklyPercents: [50, 55, 60] },
      notes:
        "Dynamic-effort percentages wave 50/55/60%. Max-effort lifts rotate every 1-3 weeks to avoid accommodation.",
      sessions: [
        {
          dayIndex: 1,
          name: "Max Effort Lower",
          type: "strength",
          durationMin: 80,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Work to a heavy single",
              type: "main_strength",
              structure: "straight",
              notes: "Rotate the ME lift every 1-3 weeks: box squat, pin squat, good morning.",
              slots: [
                {
                  exercise: "box-squat",
                  sets: [
                    { setType: "ramp", reps: 3, loadPercent: 70, percentOf: "1rm", restSeconds: 180 },
                    { setType: "ramp", reps: 1, loadPercent: 85, percentOf: "1rm", restSeconds: 240 },
                    { setType: "top", reps: 1, loadPercent: 92.5, percentOf: "1rm", rpeTarget: 9.5, restSeconds: 300 },
                  ],
                },
              ],
            },
            {
              name: "Supplemental",
              type: "accessory",
              structure: "superset",
              rounds: 4,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "good-morning", sets: [{ reps: 8, rpeTarget: 8 }] },
                { exercise: "reverse-hyper", sets: [{ reps: 12 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 2,
          name: "Max Effort Upper",
          type: "strength",
          durationMin: 75,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Work to a heavy single",
              type: "main_strength",
              structure: "straight",
              slots: [
                {
                  exercise: "floor-press",
                  sets: [
                    { setType: "ramp", reps: 3, loadPercent: 70, percentOf: "1rm", restSeconds: 180 },
                    { setType: "top", reps: 1, loadPercent: 92.5, percentOf: "1rm", rpeTarget: 9.5, restSeconds: 300 },
                  ],
                },
              ],
            },
            {
              name: "Supplemental",
              type: "accessory",
              structure: "superset",
              rounds: 4,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "close-grip-bench-press", sets: [{ reps: 8, rpeTarget: 8 }] },
                { exercise: "barbell-row", sets: [{ reps: 10 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 4,
          name: "Dynamic Effort Lower",
          type: "power",
          durationMin: 60,
          blocks: [
            SPRINT_WARMUP,
            {
              name: "Speed squat",
              type: "power",
              structure: "emom",
              rounds: 10,
              workIntervalSec: 45,
              notes: "Every 45 seconds: 2 explosive reps. Bar speed is the target, not the load.",
              slots: [
                {
                  exercise: "box-squat",
                  sets: [
                    { setType: "working", reps: 2, loadPercent: 50, percentOf: "1rm", velocityTargetMin: 0.8, velocityLossThresholdPct: 10 },
                  ],
                },
              ],
            },
            {
              name: "Jump work",
              type: "power",
              structure: "straight",
              slots: [
                { exercise: "broad-jump", sets: [{ reps: 3, restSeconds: 90 }, { reps: 3, restSeconds: 90 }, { reps: 3 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 6,
          name: "Dynamic Effort Upper",
          type: "power",
          durationMin: 55,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Speed bench",
              type: "power",
              structure: "emom",
              rounds: 9,
              workIntervalSec: 40,
              slots: [
                {
                  exercise: "bench-press",
                  sets: [
                    { setType: "working", reps: 3, loadPercent: 50, percentOf: "1rm", velocityTargetMin: 0.75, velocityLossThresholdPct: 10 },
                  ],
                },
              ],
            },
            {
              name: "Med ball power",
              type: "power",
              structure: "straight",
              slots: [
                { exercise: "med-ball-chest-pass", sets: [{ reps: 5, restSeconds: 60 }, { reps: 5, restSeconds: 60 }, { reps: 5 }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 5. Upper / lower hypertrophy — the personal-training staple
 * ------------------------------------------------------------------ */

const UPPER_LOWER: ProgramTemplate = {
  name: "Upper / Lower Hypertrophy — 4 Day",
  description:
    "Four-day upper/lower split driven by double progression rather than percentages, so it works for clients who have never tested a 1RM. The default starting point for general personal-training clients.",
  goal: "Hypertrophy and general strength",
  model: "undulating_weekly",
  blocks: [
    {
      name: "Hypertrophy Block",
      type: "accumulation",
      weeks: 6,
      volumeEmphasis: 5,
      intensityEmphasis: 3,
      weekLoadTypes: ["load", "load", "load", "load", "load", "deload"],
      progression: {
        kind: "double_progression",
        repMin: 8,
        repMax: 12,
        incrementKg: 2.5,
      },
      notes:
        "Work the top of the rep range on every set, then add load and reset. No 1RM required.",
      sessions: [
        {
          dayIndex: 1,
          name: "Upper A — Push Focus",
          type: "hypertrophy",
          durationMin: 70,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Primary press",
              type: "main_strength",
              structure: "straight",
              slots: [
                { exercise: "dumbbell-bench-press", sets: [{ reps: 8, rpeTarget: 8, restSeconds: 120 }, { reps: 8, rpeTarget: 8, restSeconds: 120 }, { reps: 8, rpeTarget: 8.5, restSeconds: 120 }] },
              ],
            },
            {
              name: "Push / pull pair",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "seated-dumbbell-shoulder-press", sets: [{ reps: 10, rpeTarget: 8 }] },
                { exercise: "lat-pulldown", sets: [{ reps: 10, rpeTarget: 8 }] },
              ],
            },
            {
              name: "Arms & delts",
              type: "accessory",
              structure: "triset",
              rounds: 3,
              restBetweenRoundsSec: 60,
              slots: [
                { exercise: "lateral-raise", sets: [{ reps: 15 }] },
                { exercise: "triceps-pushdown", sets: [{ reps: 12 }] },
                { exercise: "face-pull", sets: [{ reps: 15 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 2,
          name: "Lower A — Squat Focus",
          type: "hypertrophy",
          durationMin: 70,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Primary squat",
              type: "main_strength",
              structure: "straight",
              slots: [
                { exercise: "goblet-squat", sets: [{ reps: 10, rpeTarget: 8, restSeconds: 120 }, { reps: 10, rpeTarget: 8, restSeconds: 120 }, { reps: 10, rpeTarget: 8.5, restSeconds: 120 }] },
              ],
            },
            {
              name: "Unilateral & hamstring",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "bulgarian-split-squat", sets: [{ reps: 10, rpeTarget: 8 }] },
                { exercise: "lying-leg-curl", sets: [{ reps: 12, rpeTarget: 8 }] },
              ],
            },
            {
              name: "Core & calves",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 60,
              slots: [
                { exercise: "standing-calf-raise", sets: [{ reps: 15 }] },
                { exercise: "side-plank", sets: [{ durationSec: 30 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 4,
          name: "Upper B — Pull Focus",
          type: "hypertrophy",
          durationMin: 70,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Primary pull",
              type: "main_strength",
              structure: "straight",
              slots: [
                { exercise: "chest-supported-row", sets: [{ reps: 10, rpeTarget: 8, restSeconds: 120 }, { reps: 10, rpeTarget: 8, restSeconds: 120 }, { reps: 10, rpeTarget: 8.5, restSeconds: 120 }] },
              ],
            },
            {
              name: "Vertical pair",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "assisted-pull-up", sets: [{ reps: 8, rpeTarget: 8 }] },
                { exercise: "incline-dumbbell-press", sets: [{ reps: 10, rpeTarget: 8 }] },
              ],
            },
            {
              name: "Arms",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 60,
              slots: [
                { exercise: "hammer-curl", sets: [{ reps: 12 }] },
                { exercise: "overhead-triceps-extension", sets: [{ reps: 12 }] },
              ],
            },
          ],
        },
        {
          dayIndex: 5,
          name: "Lower B — Hinge Focus",
          type: "hypertrophy",
          durationMin: 70,
          blocks: [
            GENERAL_WARMUP,
            {
              name: "Primary hinge",
              type: "main_strength",
              structure: "straight",
              slots: [
                { exercise: "romanian-deadlift", sets: [{ reps: 10, rpeTarget: 8, tempo: "3-1-1-0", restSeconds: 120 }, { reps: 10, rpeTarget: 8, tempo: "3-1-1-0", restSeconds: 120 }, { reps: 10, rpeTarget: 8.5, tempo: "3-1-1-0", restSeconds: 120 }] },
              ],
            },
            {
              name: "Glute & quad pair",
              type: "accessory",
              structure: "superset",
              rounds: 3,
              restBetweenRoundsSec: 90,
              slots: [
                { exercise: "barbell-hip-thrust", sets: [{ reps: 12, rpeTarget: 8 }] },
                { exercise: "leg-press", sets: [{ reps: 12, rpeTarget: 8 }] },
              ],
            },
            {
              name: "Conditioning finisher",
              type: "conditioning",
              structure: "interval",
              rounds: 6,
              restBetweenRoundsSec: 60,
              slots: [
                { exercise: "assault-bike-intervals", sets: [{ durationSec: 30, rpeTarget: 8 }] },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  LINEAR,
  BLOCK,
  DUP,
  CONJUGATE,
  UPPER_LOWER,
];
