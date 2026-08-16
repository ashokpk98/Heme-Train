import { pgEnum } from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export const userRoleEnum = pgEnum("user_role", ["owner", "coach", "athlete"]);

export const sexEnum = pgEnum("sex", ["male", "female", "other"]);

export const athleteStatusEnum = pgEnum("athlete_status", [
  "active",
  "injured",
  "rehab",
  "inactive",
  "archived",
]);

/** A 1:1 personal-training client is simply an athlete in an `individual` group. */
export const groupTypeEnum = pgEnum("group_type", [
  "team",
  "squad",
  "small_group",
  "individual",
]);

/* ------------------------------------------------------------------ *
 * Exercise taxonomy
 * ------------------------------------------------------------------ */

export const movementPatternEnum = pgEnum("movement_pattern", [
  "squat",
  "hinge",
  "lunge",
  "vertical_push",
  "horizontal_push",
  "vertical_pull",
  "horizontal_pull",
  "carry",
  "rotation",
  "anti_rotation",
  "anti_extension",
  "anti_lateral_flexion",
  "gait",
  "jump_land",
  "throw",
  "sprint",
  "olympic",
  "isolation",
  "mobility",
]);

export const exerciseCategoryEnum = pgEnum("exercise_category", [
  "main_lift",
  "accessory",
  "corrective",
  "plyometric",
  "conditioning",
  "mobility",
  "warmup",
  "skill",
]);

export const lateralityEnum = pgEnum("laterality", [
  "bilateral",
  "unilateral",
  "alternating",
]);

export const forceVectorEnum = pgEnum("force_vector", [
  "vertical",
  "horizontal",
  "lateral",
  "rotational",
]);

export const contractionEmphasisEnum = pgEnum("contraction_emphasis", [
  "concentric",
  "eccentric",
  "isometric",
  "ballistic",
  "mixed",
]);

/**
 * How load is prescribed for this exercise.
 * `derived_from_exercise` covers lifts programmed as a % of another lift's max
 * (e.g. front squat at 85% of the back squat max).
 */
export const loadBasisEnum = pgEnum("load_basis", [
  "own_1rm",
  "derived_from_exercise",
  "bodyweight",
  "absolute_only",
]);

/* ------------------------------------------------------------------ *
 * Planning hierarchy
 * ------------------------------------------------------------------ */

export const periodizationModelEnum = pgEnum("periodization_model", [
  "linear",
  "block",
  "undulating_daily",
  "undulating_weekly",
  "conjugate",
  "concurrent",
  "reverse_linear",
  "autoregulated",
  "none",
]);

export const blockTypeEnum = pgEnum("block_type", [
  "accumulation",
  "transmutation",
  "realization",
  "deload",
  "taper",
  "gpp",
  "spp",
  "in_season",
  "off_season",
  "pre_season",
  "return_to_play",
]);

export const microcycleLoadTypeEnum = pgEnum("microcycle_load_type", [
  "load",
  "unload",
  "deload",
  "test",
]);

export const sessionTypeEnum = pgEnum("session_type", [
  "strength",
  "power",
  "hypertrophy",
  "conditioning",
  "recovery",
  "testing",
  "skill",
  "rest",
]);

export const sessionBlockTypeEnum = pgEnum("session_block_type", [
  "warmup",
  "activation",
  "power",
  "main_strength",
  "accessory",
  "conditioning",
  "cooldown",
]);

/**
 * How the exercises inside a session block relate to each other.
 * Supersets/circuits are a property of the block, not a flag on an exercise.
 */
export const blockStructureEnum = pgEnum("block_structure", [
  "straight",
  "superset",
  "triset",
  "circuit",
  "complex",
  "contrast",
  "emom",
  "amrap",
  "for_time",
  "interval",
]);

export const setTypeEnum = pgEnum("set_type", [
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
]);

/** What `load_percent` is a percentage of. */
export const percentOfEnum = pgEnum("percent_of", [
  "1rm",
  "training_max",
  "bodyweight",
  "e1rm",
]);

/* ------------------------------------------------------------------ *
 * Assignment & execution
 * ------------------------------------------------------------------ */

export const assignmentStatusEnum = pgEnum("assignment_status", [
  "scheduled",
  "active",
  "completed",
  "paused",
  "cancelled",
]);

export const maxSourceEnum = pgEnum("max_source", [
  "tested",
  "estimated",
  "manual",
]);

export const loggedSessionStatusEnum = pgEnum("logged_session_status", [
  "scheduled",
  "in_progress",
  "completed",
  "partial",
  "missed",
  "skipped",
]);

/* ------------------------------------------------------------------ *
 * Array-column value types (stored as text[] for flexibility)
 * ------------------------------------------------------------------ */

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "machine",
  "cable",
  "band",
  "bodyweight",
  "sled",
  "med_ball",
  "slam_ball",
  "specialty_bar",
  "trap_bar",
  "safety_squat_bar",
  "ez_bar",
  "plate",
  "box",
  "bench",
  "rack",
  "pull_up_bar",
  "dip_station",
  "suspension_trainer",
  "swiss_ball",
  "foam_roller",
  "rower",
  "bike",
  "treadmill",
  "ski_erg",
  "assault_bike",
  "jump_rope",
  "hurdle",
  "cone",
  "landmine",
  "chains",
  "ghd",
  "reverse_hyper",
  "none",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const MUSCLES = [
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "adductors",
  "abductors",
  "erectors",
  "lats",
  "traps",
  "rhomboids",
  "rear_delts",
  "side_delts",
  "front_delts",
  "pecs",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "hip_flexors",
  "serratus",
  "rotator_cuff",
  "tibialis",
  "neck",
  "full_body",
] as const;
export type Muscle = (typeof MUSCLES)[number];

/**
 * Which inputs the builder and the athlete logger render for an exercise.
 * A sled push tracks load + distance; a plank tracks time; a CMJ tracks height.
 * Without this the UI would show a weight box next to a plank.
 */
export const TRACKED_METRICS = [
  "load",
  "reps",
  "time",
  "distance",
  "velocity",
  "height",
  "calories",
  "rpe",
  "tempo",
  "rounds",
  "band_level",
  "incline",
  "watts",
  "heart_rate",
] as const;
export type TrackedMetric = (typeof TRACKED_METRICS)[number];
