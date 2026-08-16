import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Supabase owns the `auth` schema. We reference auth.users for a foreign key
  // but must never generate DDL against it.
  schemaFilter: ["public"],
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/heme",
  },
  verbose: true,
  strict: false,
});
