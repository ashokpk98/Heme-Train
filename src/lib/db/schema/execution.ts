import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { exercises } from "./exercises";
import { athletes, groups } from "./people";
import { prescribedSets, programs, sessions } from "./programs";
import {
  assignmentStatusEnum,
  loggedSessionStatusEnum,
  maxSourceEnum,
} from "./enums";

/**
 * A program handed to an athlete or a whole group.
 * Exactly one of athleteId / groupId is set.
 */
export const programAssignments = pgTable(
  "program_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").references(() => athletes.id, {
      onDelete: "cascade",
    }),
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    status: assignmentStatusEnum("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("assignments_program_idx").on(t.programId),
    index("assignments_athlete_idx").on(t.athleteId),
    index("assignments_group_idx").on(t.groupId),
  ],
);

/**
 * Athlete maxes. This is what makes %1RM prescriptions resolve to real weights.
 * Rows are append-only so max progression over time is queryable; the newest
 * row per (athlete, exercise) is the current max.
 */
export const athleteMaxes = pgTable(
  "athlete_maxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    valueKg: doublePrecision("value_kg").notNull(),
    source: maxSourceEnum("source").notNull().default("tested"),
    /** For estimated maxes: the set that produced the estimate. */
    repsPerformed: integer("reps_performed"),
    loadPerformedKg: doublePrecision("load_performed_kg"),
    /** Coaches often program off a training max (typically 90% of 1RM). */
    trainingMaxKg: doublePrecision("training_max_kg"),
    testedAt: date("tested_at").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("athlete_maxes_athlete_idx").on(t.athleteId),
    index("athlete_maxes_lookup_idx").on(t.athleteId, t.exerciseId, t.testedAt),
  ],
);

export const loggedSessions = pgTable(
  "logged_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").references(
      () => programAssignments.id,
      { onDelete: "set null" },
    ),
    /** The planned session this execution corresponds to; null for ad-hoc work. */
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: loggedSessionStatusEnum("status").notNull().default("scheduled"),
    /** Session RPE (0-10). sRPE x duration = training load in arbitrary units. */
    sessionRpe: doublePrecision("session_rpe"),
    durationMin: integer("duration_min"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("logged_sessions_athlete_idx").on(t.athleteId),
    index("logged_sessions_date_idx").on(t.date),
  ],
);

/**
 * Actual performance. The nullable `prescribedSetId` join back to the plan is
 * what every compliance and adherence report is built on: prescribed vs actual.
 */
export const loggedSets = pgTable(
  "logged_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loggedSessionId: uuid("logged_session_id")
      .notNull()
      .references(() => loggedSessions.id, { onDelete: "cascade" }),
    prescribedSetId: uuid("prescribed_set_id").references(
      () => prescribedSets.id,
      { onDelete: "set null" },
    ),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    setNumber: integer("set_number").notNull(),

    reps: integer("reps"),
    loadKg: doublePrecision("load_kg"),
    rpe: doublePrecision("rpe"),
    rir: doublePrecision("rir"),
    velocityMs: doublePrecision("velocity_ms"),
    peakVelocityMs: doublePrecision("peak_velocity_ms"),
    durationSec: integer("duration_sec"),
    distanceM: doublePrecision("distance_m"),
    heightCm: doublePrecision("height_cm"),
    calories: integer("calories"),

    completed: boolean("completed").notNull().default(true),
    notes: text("notes"),
    performedAt: timestamp("performed_at", { withTimezone: true }),
  },
  (t) => [
    index("logged_sets_session_idx").on(t.loggedSessionId),
    index("logged_sets_exercise_idx").on(t.exerciseId),
    index("logged_sets_prescribed_idx").on(t.prescribedSetId),
  ],
);

/* ------------------------------- relations ------------------------------ */

export const programAssignmentsRelations = relations(
  programAssignments,
  ({ one, many }) => ({
    program: one(programs, {
      fields: [programAssignments.programId],
      references: [programs.id],
    }),
    athlete: one(athletes, {
      fields: [programAssignments.athleteId],
      references: [athletes.id],
    }),
    group: one(groups, {
      fields: [programAssignments.groupId],
      references: [groups.id],
    }),
    loggedSessions: many(loggedSessions),
  }),
);

export const athleteMaxesRelations = relations(athleteMaxes, ({ one }) => ({
  athlete: one(athletes, {
    fields: [athleteMaxes.athleteId],
    references: [athletes.id],
  }),
  exercise: one(exercises, {
    fields: [athleteMaxes.exerciseId],
    references: [exercises.id],
  }),
}));

export const loggedSessionsRelations = relations(
  loggedSessions,
  ({ one, many }) => ({
    assignment: one(programAssignments, {
      fields: [loggedSessions.assignmentId],
      references: [programAssignments.id],
    }),
    session: one(sessions, {
      fields: [loggedSessions.sessionId],
      references: [sessions.id],
    }),
    athlete: one(athletes, {
      fields: [loggedSessions.athleteId],
      references: [athletes.id],
    }),
    sets: many(loggedSets),
  }),
);

export const loggedSetsRelations = relations(loggedSets, ({ one }) => ({
  loggedSession: one(loggedSessions, {
    fields: [loggedSets.loggedSessionId],
    references: [loggedSessions.id],
  }),
  prescribedSet: one(prescribedSets, {
    fields: [loggedSets.prescribedSetId],
    references: [prescribedSets.id],
  }),
  exercise: one(exercises, {
    fields: [loggedSets.exerciseId],
    references: [exercises.id],
  }),
}));

export type AthleteMax = typeof athleteMaxes.$inferSelect;
export type LoggedSet = typeof loggedSets.$inferSelect;
