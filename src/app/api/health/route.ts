import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  describeDatabaseUrl,
  describeKey,
  getSupabaseConfig,
} from "@/lib/env";

/**
 * Deployment diagnostics: `GET /api/health`.
 *
 * Exists because the two ways this app fails on a fresh deployment are both
 * silent — a browser-facing key under an unexpected env var name, and a
 * Postgres URL whose password was not percent-encoded (which mis-parses rather
 * than erroring). Neither is visible from the UI, so this reports both.
 *
 * Deliberately contains no secrets: key *formats* and lengths, never values;
 * the database host and name, never the password. Still worth deleting or
 * gating before this app carries real client data.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const { url, key, keySource } = getSupabaseConfig();
  const keyInfo = describeKey(key);
  const dbInfo = describeDatabaseUrl();

  const problems: string[] = [];
  const checks: Record<string, unknown> = {};

  /* ----------------------------- configuration ---------------------------- */

  if (!url) {
    problems.push(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Sign-in cannot work without it.",
    );
  }
  if (!keyInfo.present) {
    problems.push(
      "No browser-facing Supabase key found. Set NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "(or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY). Remember to redeploy after " +
        "changing Vercel environment variables — they are read at build time.",
    );
  }
  if (keyInfo.format === "secret_do_not_use") {
    problems.push(
      "The key in a NEXT_PUBLIC_ variable is a service_role key. That is a " +
        "full-access credential exposed to the browser. Replace it with the " +
        "anon/publishable key and rotate the service role key immediately.",
    );
  }
  if (keyInfo.format === "unrecognised") {
    problems.push(
      "The Supabase key is neither an anon JWT nor an sb_publishable_ key.",
    );
  }
  if (dbInfo.hint) problems.push(dbInfo.hint);

  checks.supabase = {
    urlSet: Boolean(url),
    urlHost: url ? safeHost(url) : null,
    keySource,
    keyFormat: keyInfo.format,
    keyLength: keyInfo.length,
  };
  checks.database = {
    urlSet: dbInfo.present,
    host: dbInfo.host,
    port: dbInfo.port,
    user: dbInfo.user,
    database: dbInfo.database,
    looksMisencoded: dbInfo.looksMisencoded,
  };

  /* ------------------------------ live checks ----------------------------- */

  // Does the database answer, and does it have the seed in it?
  try {
    const rows = await db.execute<{
      exercises: number;
      coaches: number;
      athletes: number;
      programs: number;
      rls_tables: number;
    }>(sql`
      select
        (select count(*)::int from public.exercises where org_id is null) as exercises,
        (select count(*)::int from public.users)                          as coaches,
        (select count(*)::int from public.athletes)                       as athletes,
        (select count(*)::int from public.programs)                       as programs,
        (select count(*)::int from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relrowsecurity and c.relforcerowsecurity)              as rls_tables
    `);
    const r = rows[0];
    checks.data = { reachable: true, ...r };

    if (r.rls_tables !== 17) {
      problems.push(
        `Row level security is active on ${r.rls_tables} tables, expected 17. ` +
          "Re-run supabase/dist/01_schema.sql, or npm run db:rls.",
      );
    }
    if (r.exercises === 0) problems.push("No exercises found — the seed has not been applied.");
    if (r.coaches === 0) problems.push("No coach profiles found — the seed has not been applied.");
  } catch (err) {
    checks.data = {
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
    problems.push(
      "Cannot reach the database. Check DATABASE_URL — for Supabase use the " +
        "pooled connection string, with the password percent-encoded.",
    );
  }

  // Is the auth service reachable? A 200 here means sign-in should work.
  if (url) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      checks.auth = { reachable: res.ok, status: res.status };
      if (!res.ok) {
        problems.push(`Supabase auth health check returned ${res.status}.`);
      }
    } catch (err) {
      checks.auth = {
        reachable: false,
        error: err instanceof Error ? err.message : String(err),
      };
      problems.push("Cannot reach Supabase auth. Check NEXT_PUBLIC_SUPABASE_URL.");
    }
  }

  const ok = problems.length === 0;

  return NextResponse.json(
    {
      ok,
      summary: ok
        ? "Configuration looks correct. Sign in at /login."
        : `${problems.length} problem${problems.length === 1 ? "" : "s"} found.`,
      problems,
      checks,
      loginUrl: "/login",
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}

function safeHost(raw: string): string | null {
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}
