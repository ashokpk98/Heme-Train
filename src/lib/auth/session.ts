import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, withUserId, type ScopedDb } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { createClient, isAuthConfigured } from "./server";

export interface Coach {
  id: string;
  email: string;
  name: string;
  role: "owner" | "coach" | "athlete";
  orgId: string;
  orgName: string;
  unitSystem: string;
  plateIncrementKg: number;
}

/**
 * The signed-in coach, or null.
 *
 * `getUser()` is used rather than `getSession()` because it revalidates the JWT
 * with Supabase; the cookie alone is not trustworthy.
 *
 * The profile lookup runs on the service connection — it is the one query that
 * legitimately precedes RLS, since `current_org_id()` is derived from its
 * result. It is keyed by the verified auth user id, so it cannot leak.
 *
 * `cache()` dedupes this across a single render pass.
 */
export const getCoach = cache(async (): Promise<Coach | null> => {
  // Treated as signed out rather than throwing, so a project without
  // credentials lands on the login page and shows a clear setup message
  // instead of a stack trace.
  if (!isAuthConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      orgId: users.orgId,
      orgName: organizations.name,
      unitSystem: organizations.unitSystem,
      plateIncrementKg: organizations.plateIncrementKg,
    })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(eq(users.id, user.id))
    .limit(1);

  return row ?? null;
});

/** Same, but redirects to the login page when signed out. */
export async function requireCoach(): Promise<Coach> {
  const coach = await getCoach();
  if (!coach) redirect("/login");
  return coach;
}

/**
 * Run queries as the signed-in coach with RLS enforced.
 *
 * This is the only way pages and server actions should touch the database.
 * The callback receives both the scoped transaction and the coach, since most
 * callers need the org's unit settings anyway.
 */
export async function withCoach<T>(
  fn: (tx: ScopedDb, coach: Coach) => Promise<T>,
): Promise<T> {
  const coach = await requireCoach();
  return withUserId(coach.id, (tx) => fn(tx, coach));
}
