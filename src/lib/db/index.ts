import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/heme";

// Next.js dev server hot-reloads modules; cache the client so we don't leak
// a new connection pool on every reload.
const globalForDb = globalThis as unknown as {
  __hemeClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__hemeClient ?? postgres(connectionString, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__hemeClient = client;
}

/**
 * Service-role connection. **Bypasses row level security.**
 *
 * Reserved for work that legitimately spans tenants: the seed script, auth
 * callbacks, and admin tooling. Never use it to serve a page or a server
 * action — use `withUserId` / `withCoach` so the database enforces isolation.
 */
export const db = drizzle(client, { schema });

export type Db = typeof db;
export type ScopedDb = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run queries as a specific signed-in user, with RLS applied.
 *
 * Opens a transaction, publishes the user id as the request JWT claims that
 * `public.auth_uid()` reads, then drops to the `authenticated` role for the
 * remainder of the transaction. Both settings are transaction-local, so a
 * pooled connection cannot leak one user's scope into the next request.
 *
 * Because the role is switched, every policy is evaluated for real. A query
 * that forgets a filter returns nothing rather than another coach's client.
 *
 * Takes the user id explicitly rather than reading the session, so the RLS
 * test suite can exercise it as any user.
 */
export async function withUserId<T>(
  userId: string,
  fn: (tx: ScopedDb) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify({
        sub: userId,
        role: "authenticated",
      })}, true)`,
    );
    // `set local role` takes no parameters, and the value is a fixed literal.
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

export { schema };
