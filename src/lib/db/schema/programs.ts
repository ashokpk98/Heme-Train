import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { exercises } from "./exercises";
import { organizations, users } from "./people";
import {
  blockStructureEnum,
  blockTypeEnum,
  microcycleLoadTypeEnum,
  percentOfEnum,
  periodizationModelEnum,
  sessionBlockTypeEnum,
  sessionTypeEnum,
  setTypeEnum,
} from "./enums";

/* ------------------------------------------------------------------ *
 * Macrocycle: the program itself
 * ------------------------------------------------------------------ */

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Owning coach. Programs are a coach's own work by default; RLS hides them
     * from colleagues unless `isOrgShared` is set.
     */
    ownerCoachId: uuid("owner_coach_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Share this program org-wide — intended for reusable templates. */
    isOrgShared: boolean("is_org_shared").notNull().default(false),
    name: text("name").notNull(),
    description: text("description"),
    goal: text("goal"),
    periodizationModel: periodizationModelEnum("periodization_model")
      .notNull()
      .default("none"),
    durationWeeks: integer("duration_weeks").notNull().default(4),
    /** Templates are reusable blueprints; non-templates are working programs. */
    isTemplate: boolean("is_template").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("programs_org_idx").on(t.orgId),
    index("programs_owner_idx").on(t.orgId, t.ownerCoachId),
  ],
);

/* ------------------------------------------------------------------ *
 * Mesocycle
 * ------------------------------------------------------------------ */

export const programBlocks = pgTable(
  "program_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalised by trigger — see supabase/migrations. */
    orgId: uuid("org_id")
      .notNull()
      // DEFAULT NULL keeps this optional for Drizzle inserts; the BEFORE INSERT
      // trigger fills it before the NOT NULL check runs.
      .default(sql`null`)
      .references(() => organizations.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    orderIndex: integer("order_index").notNull(),
    weeks: integer("weeks").notNull().default(4),
    blockType: blockTypeEnum("block_type").notNull().default("accumulation"),
    /** Coarse emphasis dials, 1-5, used for at-a-glance block shape. */
    volumeEmphasis: integer("volume_emphasis").notNull().default(3),
    intensityEmphasis: integer("intensity_emphasis").notNull().default(3),
    notes: text("notes"),
  },
  (t) => [
    index("program_blocks_program_idx").on(t.programId),
    index("program_blocks_rls_idx").on(t.orgId, t.programId),
  ],
);

/* ------------------------------------------------------------------ *
 * Microcycle (a week)
 * ------------------------------------------------------------------ */

export const microcycles = pgTable(
  "microcycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalised by trigger — see supabase/migrations. */
    orgId: uuid("org_id")
      .notNull()
      // DEFAULT NULL keeps this optional for Drizzle inserts; the BEFORE INSERT
      // trigger fills it before the NOT NULL check runs.
      .default(sql`null`)
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Denormalised by trigger. Without it this table sits 3 hops from
     * `organizations` and every RLS check would walk that whole chain per row.
     */
    programId: uuid("program_id")
      .notNull()
      .default(sql`null`)
      .references(() => programs.id, { onDelete: "cascade" }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => programBlocks.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    label: text("label"),
    loadType: microcycleLoadTypeEnum("load_type").notNull().default("load"),
    notes: text("notes"),
  },
  (t) => [
    index("microcycles_block_idx").on(t.blockId),
    index("microcycles_rls_idx").on(t.orgId, t.programId),
  ],
);

/* ------------------------------------------------------------------ *
 * Session (a training day)
 * ------------------------------------------------------------------ */

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalised by trigger — see supabase/migrations. */
    orgId: uuid("org_id")
      .notNull()
      // DEFAULT NULL keeps this optional for Drizzle inserts; the BEFORE INSERT
      // trigger fills it before the NOT NULL check runs.
      .default(sql`null`)
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Denormalised by trigger. Without it this table sits 4 hops from
     * `organizations` and every RLS check would walk that whole chain per row.
     */
    programId: uuid("program_id")
      .notNull()
      .default(sql`null`)
      .references(() => programs.id, { onDelete: "cascade" }),
    microcycleId: uuid("microcycle_id")
      .notNull()
      .references(() => microcycles.id, { onDelete: "cascade" }),
    /** 1 = Monday … 7 = Sunday. */
    dayIndex: integer("day_index").notNull(),
    name: text("name").notNull(),
    sessionType: sessionTypeEnum("session_type").notNull().default("strength"),
    estimatedDurationMin: integer("estimated_duration_min"),
    notes: text("notes"),
  },
  (t) => [
    index("sessions_microcycle_idx").on(t.microcycleId),
    index("sessions_rls_idx").on(t.orgId, t.programId),
  ],
);

/* ------------------------------------------------------------------ *
 * Session block — where supersets and circuits live
 * ------------------------------------------------------------------ */

export const sessionBlocks = pgTable(
  "session_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalised by trigger — see supabase/migrations. */
    orgId: uuid("org_id")
      .notNull()
      // DEFAULT NULL keeps this optional for Drizzle inserts; the BEFORE INSERT
      // trigger fills it before the NOT NULL check runs.
      .default(sql`null`)
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Denormalised by trigger. Without it this table sits 5 hops from
     * `organizations` and every RLS check would walk that whole chain per row.
     */
    programId: uuid("program_id")
      .notNull()
      .default(sql`null`)
      .references(() => programs.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    name: text("name"),
    orderIndex: integer("order_index").notNull(),
    blockType: sessionBlockTypeEnum("block_type").notNull().default("main_strength"),
    /**
     * Grouping is a property of the block, not a flag bolted onto exercises.
     * A superset is a block with structure = "superset" holding 2 slots.
     */
    structure: blockStructureEnum("structure").notNull().default("straight"),
    /** For circuit / emom / amrap / interval structures. */
    rounds: integer("rounds"),
    restBetweenRoundsSec: integer("rest_between_rounds_sec"),
    timeCapSec: integer("time_cap_sec"),
    /** EMOM interval length. */
    workIntervalSec: integer("work_interval_sec"),
    notes: text("notes"),
  },
  (t) => [
    index("session_blocks_session_idx").on(t.sessionId),
    index("session_blocks_rls_idx").on(t.orgId, t.programId),
  ],
);

/* ------------------------------------------------------------------ *
 * Exercise slot — one exercise's place inside a session block
 * ------------------------------------------------------------------ */

export const exerciseSlots = pgTable(
  "exercise_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalised by trigger — see supabase/migrations. */
    orgId: uuid("org_id")
      .notNull()
      // DEFAULT NULL keeps this optional for Drizzle inserts; the BEFORE INSERT
      // trigger fills it before the NOT NULL check runs.
      .default(sql`null`)
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Denormalised by trigger. Without it this table sits 6 hops from
     * `organizations` and every RLS check would walk that whole chain per row.
     */
    programId: uuid("program_id")
      .notNull()
      .default(sql`null`)
      .references(() => programs.id, { onDelete: "cascade" }),
    sessionBlockId: uuid("session_block_id")
      .notNull()
      .references(() => sessionBlocks.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    orderIndex: integer("order_index").notNull(),
    /** Coach-facing label: A1, A2, B1 … derived from block order + slot order. */
    letterLabel: text("letter_label"),
    notes: text("notes"),
    coachingCues: text("coaching_cues").array().$type<string[]>().notNull().default([]),
    /** Slots sharing a group id are interchangeable substitutions. */
    substitutionGroupId: uuid("substitution_group_id"),
  },
  (t) => [
    index("exercise_slots_block_idx").on(t.sessionBlockId),
    index("exercise_slots_exercise_idx").on(t.exerciseId),
    index("exercise_slots_rls_idx").on(t.orgId, t.programId),
  ],
);

/* ------------------------------------------------------------------ *
 * Prescribed set — every loading method can coexist on one row
 * ------------------------------------------------------------------ */

export const prescribedSets = pgTable(
  "prescribed_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Denormalised by trigger — see supabase/migrations. */
    orgId: uuid("org_id")
      .notNull()
      // DEFAULT NULL keeps this optional for Drizzle inserts; the BEFORE INSERT
      // trigger fills it before the NOT NULL check runs.
      .default(sql`null`)
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * Denormalised by trigger. Without it this table sits 7 hops from
     * `organizations` and every RLS check would walk that whole chain per row.
     */
    programId: uuid("program_id")
      .notNull()
      .default(sql`null`)
      .references(() => programs.id, { onDelete: "cascade" }),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => exerciseSlots.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull(),
    setType: setTypeEnum("set_type").notNull().default("working"),

    /* ------------------------------ volume ------------------------------- */
    reps: integer("reps"),
    repMin: integer("rep_min"),
    repMax: integer("rep_max"),
    isAmrap: boolean("is_amrap").notNull().default(false),
    clusterReps: integer("cluster_reps"),
    clusterRestSec: integer("cluster_rest_sec"),

    /* ---------------------------- absolute load -------------------------- */
    loadKg: doublePrecision("load_kg"),

    /* --------------------------- percentage load ------------------------- */
    loadPercent: doublePrecision("load_percent"),
    percentOf: percentOfEnum("percent_of"),

    /* --------------------------- autoregulation -------------------------- */
    rpeTarget: doublePrecision("rpe_target"),
    rirTarget: doublePrecision("rir_target"),

    /* ------------------------------ velocity ----------------------------- */
    velocityTargetMin: doublePrecision("velocity_target_min"),
    velocityTargetMax: doublePrecision("velocity_target_max"),
    velocityLossThresholdPct: doublePrecision("velocity_loss_threshold_pct"),

    /* ----------------------------- execution ----------------------------- */
    /** 4-digit eccentric-pause-concentric-pause, e.g. "3-1-X-0". */
    tempo: text("tempo"),
    restSeconds: integer("rest_seconds"),

    /* -------------------------- non-load metrics ------------------------- */
    durationSec: integer("duration_sec"),
    distanceM: doublePrecision("distance_m"),
    calories: integer("calories"),
    heightCm: doublePrecision("height_cm"),

    notes: text("notes"),
  },
  (t) => [
    index("prescribed_sets_slot_idx").on(t.slotId),
    index("prescribed_sets_rls_idx").on(t.orgId, t.programId),
  ],
);

/* ------------------------------- relations ------------------------------ */

export const programsRelations = relations(programs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [programs.orgId],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [programs.createdById],
    references: [users.id],
  }),
  blocks: many(programBlocks),
}));

export const programBlocksRelations = relations(
  programBlocks,
  ({ one, many }) => ({
    program: one(programs, {
      fields: [programBlocks.programId],
      references: [programs.id],
    }),
    microcycles: many(microcycles),
  }),
);

export const microcyclesRelations = relations(microcycles, ({ one, many }) => ({
  block: one(programBlocks, {
    fields: [microcycles.blockId],
    references: [programBlocks.id],
  }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  microcycle: one(microcycles, {
    fields: [sessions.microcycleId],
    references: [microcycles.id],
  }),
  blocks: many(sessionBlocks),
}));

export const sessionBlocksRelations = relations(
  sessionBlocks,
  ({ one, many }) => ({
    session: one(sessions, {
      fields: [sessionBlocks.sessionId],
      references: [sessions.id],
    }),
    slots: many(exerciseSlots),
  }),
);

export const exerciseSlotsRelations = relations(
  exerciseSlots,
  ({ one, many }) => ({
    sessionBlock: one(sessionBlocks, {
      fields: [exerciseSlots.sessionBlockId],
      references: [sessionBlocks.id],
    }),
    exercise: one(exercises, {
      fields: [exerciseSlots.exerciseId],
      references: [exercises.id],
    }),
    sets: many(prescribedSets),
  }),
);

export const prescribedSetsRelations = relations(prescribedSets, ({ one }) => ({
  slot: one(exerciseSlots, {
    fields: [prescribedSets.slotId],
    references: [exerciseSlots.id],
  }),
}));

export type Program = typeof programs.$inferSelect;
export type ProgramBlock = typeof programBlocks.$inferSelect;
export type Microcycle = typeof microcycles.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionBlock = typeof sessionBlocks.$inferSelect;
export type ExerciseSlot = typeof exerciseSlots.$inferSelect;
export type PrescribedSet = typeof prescribedSets.$inferSelect;
export type NewPrescribedSet = typeof prescribedSets.$inferInsert;
