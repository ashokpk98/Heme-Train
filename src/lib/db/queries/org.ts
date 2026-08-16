import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";

/**
 * Slice 1 runs without auth: every page resolves to the single seeded org.
 * Real auth replaces just this function — `org_id` is already on every
 * tenant-scoped table, so nothing else has to change.
 */
export async function getDemoOrg() {
  const [org] = await db.select().from(organizations).limit(1);
  return org ?? null;
}
