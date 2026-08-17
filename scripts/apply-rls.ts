/**
 * Applies supabase/migrations/*.sql through the app's own connection.
 *
 * This runs as part of `npm run db:push` and not as a one-off, because
 * `drizzle-kit push` emits `DISABLE ROW LEVEL SECURITY` for every table that
 * does not declare RLS in the Drizzle schema. Pushing a schema change would
 * otherwise quietly turn isolation off while leaving the policies in place, so
 * the database still *looks* configured. The migration ends with a check that
 * raises if RLS is not active, so a regression fails the command instead.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

async function main() {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/heme";

  const sql = postgres(connectionString, { max: 1 });

  try {
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.warn("No migrations found in supabase/migrations.");
      return;
    }

    for (const file of files) {
      const text = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await sql.unsafe(text);
      console.log(`  · applied ${file}`);
    }

    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relrowsecurity
        and c.relforcerowsecurity
    `;
    console.log(`  · row level security active on ${count} tables`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Failed to apply migrations:", err);
  process.exit(1);
});
