import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./people";
import {
  contractionEmphasisEnum,
  type Equipment,
  exerciseCategoryEnum,
  forceVectorEnum,
  lateralityEnum,
  loadBasisEnum,
  movementPatternEnum,
  type Muscle,
  type TrackedMetric,
} from "./enums";

/**
 * The exercise library.
 *
 * `orgId` is nullable on purpose:
 *   NULL     -> global system library, visible to every org
 *   set      -> a coach's custom exercise, private to that org
 */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),

    name: text("name").notNull(),
    slug: text("slug").notNull(),
    aliases: text("aliases").array().$type<string[]>().notNull().default([]),
    description: text("description"),

    /* ------------------------------ taxonomy ----------------------------- */
    movementPattern: movementPatternEnum("movement_pattern").notNull(),
    category: exerciseCategoryEnum("category").notNull(),
    laterality: lateralityEnum("laterality").notNull().default("bilateral"),
    forceVector: forceVectorEnum("force_vector"),
    contractionEmphasis: contractionEmphasisEnum("contraction_emphasis")
      .notNull()
      .default("mixed"),

    equipment: text("equipment").array().$type<Equipment[]>().notNull().default([]),
    primaryMuscles: text("primary_muscles")
      .array()
      .$type<Muscle[]>()
      .notNull()
      .default([]),
    secondaryMuscles: text("secondary_muscles")
      .array()
      .$type<Muscle[]>()
      .notNull()
      .default([]),

    /* --------------------------- prescription ---------------------------- */
    /**
     * Which inputs the builder and logger render for this exercise.
     * Drives the whole prescription UI — see TRACKED_METRICS.
     */
    trackedMetrics: text("tracked_metrics")
      .array()
      .$type<TrackedMetric[]>()
      .notNull()
      .default(["load", "reps"]),

    loadBasis: loadBasisEnum("load_basis").notNull().default("absolute_only"),
    /** When loadBasis = derived_from_exercise: which lift's max to read. */
    derivedFromExerciseId: uuid("derived_from_exercise_id").references(
      (): AnyPgColumn => exercises.id,
      { onDelete: "set null" },
    ),
    /** Typical ratio to the source lift, e.g. front squat ≈ 0.85 of back squat. */
    derivedRatio: doublePrecision("derived_ratio"),
    /** Can this exercise hold a 1RM record? */
    isMaxTestable: boolean("is_max_testable").notNull().default(false),

    /* ---------------------- progression / regression ---------------------- */
    /**
     * Self-referencing regression -> progression chain.
     * `progressionOfId` points at the easier variant this exercise progresses from
     * (box squat -> goblet squat -> back squat). Powers "regress this exercise".
     */
    progressionOfId: uuid("progression_of_id").references(
      (): AnyPgColumn => exercises.id,
      { onDelete: "set null" },
    ),
    /** Ordering within a progression chain; lower is easier. */
    difficultyLevel: integer("difficulty_level").notNull().default(3),

    /* ------------------------------ defaults ----------------------------- */
    defaultTempo: text("default_tempo"),
    defaultRestSeconds: integer("default_rest_seconds"),

    /* ------------------------------- media ------------------------------- */
    videoUrl: text("video_url"),
    thumbnailUrl: text("thumbnail_url"),
    coachingCues: text("coaching_cues").array().$type<string[]>().notNull().default([]),
    contraindications: text("contraindications")
      .array()
      .$type<string[]>()
      .notNull()
      .default([]),
    tags: text("tags").array().$type<string[]>().notNull().default([]),

    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Per-org custom exercises: slug unique within the org.
    uniqueIndex("exercises_org_slug_idx")
      .on(t.orgId, t.slug)
      .where(sql`${t.orgId} is not null`),
    // Global library: Postgres treats NULLs as distinct, so (org_id, slug)
    // alone would permit duplicate global slugs. This partial index closes that.
    uniqueIndex("exercises_global_slug_idx")
      .on(t.slug)
      .where(sql`${t.orgId} is null`),
    index("exercises_pattern_idx").on(t.movementPattern),
    index("exercises_category_idx").on(t.category),
    index("exercises_name_idx").on(t.name),
  ],
);

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [exercises.orgId],
    references: [organizations.id],
  }),
  derivedFrom: one(exercises, {
    fields: [exercises.derivedFromExerciseId],
    references: [exercises.id],
    relationName: "derivedFrom",
  }),
  progressionOf: one(exercises, {
    fields: [exercises.progressionOfId],
    references: [exercises.id],
    relationName: "progressionChain",
  }),
  progressions: many(exercises, { relationName: "progressionChain" }),
}));

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
