import { relations } from "drizzle-orm";
import {
  date,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  athleteStatusEnum,
  groupTypeEnum,
  sexEnum,
  userRoleEnum,
} from "./enums";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Display unit for loads across the org: "kg" | "lb". */
  unitSystem: text("unit_system").notNull().default("kg"),
  /** Smallest load change achievable with available plates, in kg. */
  plateIncrementKg: doublePrecision("plate_increment_kg").notNull().default(2.5),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull().default("coach"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_org_email_idx").on(t.orgId, t.email)],
);

export const athletes = pgTable(
  "athletes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Set once the athlete has their own login; null for coach-managed athletes. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    dateOfBirth: date("date_of_birth"),
    sex: sexEnum("sex"),
    heightCm: doublePrecision("height_cm"),
    bodyweightKg: doublePrecision("bodyweight_kg"),
    sport: text("sport"),
    position: text("position"),
    status: athleteStatusEnum("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("athletes_org_idx").on(t.orgId)],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: groupTypeEnum("type").notNull().default("team"),
    sport: text("sport"),
    season: text("season"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("groups_org_idx").on(t.orgId)],
);

/** Roster history: `leftAt` is null while the athlete is currently in the group. */
export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => athletes.id, { onDelete: "cascade" }),
    joinedAt: date("joined_at").notNull(),
    leftAt: date("left_at"),
  },
  (t) => [
    index("group_members_group_idx").on(t.groupId),
    index("group_members_athlete_idx").on(t.athleteId),
  ],
);

/* ------------------------------- relations ------------------------------ */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  athletes: many(athletes),
  groups: many(groups),
}));

export const athletesRelations = relations(athletes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [athletes.orgId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [athletes.userId], references: [users.id] }),
  memberships: many(groupMembers),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [groups.orgId],
    references: [organizations.id],
  }),
  members: many(groupMembers),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  athlete: one(athletes, {
    fields: [groupMembers.athleteId],
    references: [athletes.id],
  }),
}));
