import { drizzle } from "drizzle-orm/postgres-js";
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

export const db = drizzle(client, { schema });
export { schema };
export type Db = typeof db;
