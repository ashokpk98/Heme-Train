import { pgSchema, timestamp, uuid, text } from "drizzle-orm/pg-core";

/**
 * Supabase's `auth.users`, referenced but never managed by us.
 *
 * drizzle.config.ts sets `schemaFilter: ["public"]` so drizzle-kit never tries
 * to create or alter this table — Supabase owns it. It is declared here only so
 * `public.users.id` can carry a real foreign key to it.
 */
export const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }),
});
