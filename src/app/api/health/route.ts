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

/** The seeded fixture account, also offered click-to-fill on the login form. */
const PROBE_EMAIL = "a1@heme.test";
const PROBE_PASSWORD = "heme-demo-1234";

export async function GET(request: Request) {
  const probeSignIn =
    new URL(request.url).searchParams.get("signin") === "1";
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

  /*
   * Is the auth service reachable, and does it accept our key?
   *
   * Every `/auth/v1/*` endpoint — health included — requires the `apikey`
   * header. Omitting it returns 401 regardless of how healthy the project is,
   * so a probe without it reports a broken deployment for a working one. The
   * header therefore serves double duty: it makes the reachability answer
   * meaningful, and a 401 *with* it is a real signal that the key was revoked
   * (which happens when a project switches to the new `sb_publishable_`
   * format and disables the legacy JWTs).
   */
  if (url) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
        headers: key ? { apikey: key, authorization: `Bearer ${key}` } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      checks.auth = { reachable: res.ok, status: res.status };
      if (res.status === 401) {
        problems.push(
          "Supabase auth rejected the browser key (401). The key is present but " +
            "not valid for this project — most often because the project was " +
            "switched to the new sb_publishable_ key format, which disables the " +
            "legacy anon JWT. Copy the current publishable key from " +
            "Settings → API Keys and set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
        );
      } else if (!res.ok) {
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

  /*
   * Can a seeded coach actually sign in?
   *
   * The one thing nothing else here proves. The coach accounts were inserted
   * as SQL rows with a bcrypt hash rather than created through Supabase's
   * signup API, so "the database has 3 coaches" and "a coach can log in" are
   * genuinely separate claims — a missing `auth.identities` row or an unset
   * `email_confirmed_at` satisfies the first and fails the second.
   *
   * Opt-in via `?signin=1`, not run by default: Supabase rate-limits the token
   * endpoint per IP, and a diagnostic that quietly spends that budget would
   * make real sign-ins fail with 429 — the opposite of helping. The password
   * used is the fixture one already printed on the login form, so this
   * discloses nothing new.
   */
  if (probeSignIn && url && key) {
    try {
      const res = await fetch(
        `${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: key,
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: PROBE_EMAIL,
            password: PROBE_PASSWORD,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        },
      );
      const body = (await res.json().catch(() => null)) as {
        access_token?: string;
        error_code?: string;
        msg?: string;
        error_description?: string;
      } | null;

      // Nothing from the session is retained — no cookie is set and the token
      // is never echoed, only whether one was issued.
      checks.signIn = {
        email: PROBE_EMAIL,
        status: res.status,
        tokenIssued: Boolean(body?.access_token),
        errorCode: body?.error_code ?? null,
      };

      if (!res.ok) {
        const detail = body?.msg ?? body?.error_description ?? `HTTP ${res.status}`;
        if (res.status === 429) {
          problems.push(
            `Sign-in probe rate-limited (429): ${detail}. This is the probe ` +
              "hitting Supabase's per-IP limit, not a broken account — wait a " +
              "few minutes, then sign in at /login normally.",
          );
        } else if (body?.error_code === "email_not_confirmed") {
          problems.push(
            "The seeded coach exists but its email is unconfirmed, so sign-in " +
              "is refused. Fix with: update auth.users set email_confirmed_at = " +
              "now() where email like '%@heme.test';",
          );
        } else {
          problems.push(
            `Seeded coach ${PROBE_EMAIL} could not sign in (${res.status}): ` +
              `${detail}. Re-run supabase/dist/02a_seed.sql, or create an ` +
              "account at /signup instead — that path uses Supabase's own API.",
          );
        }
      }
    } catch (err) {
      checks.signIn = {
        email: PROBE_EMAIL,
        reachable: false,
        error: err instanceof Error ? err.message : String(err),
      };
      problems.push("The sign-in probe could not reach Supabase auth.");
    }
  }

  const ok = problems.length === 0;

  return NextResponse.json(
    {
      ok,
      summary: ok
        ? probeSignIn
          ? `Configuration looks correct and ${PROBE_EMAIL} signed in successfully.`
          : "Configuration looks correct. Sign in at /login."
        : `${problems.length} problem${problems.length === 1 ? "" : "s"} found.`,
      problems,
      checks,
      loginUrl: "/login",
      ...(probeSignIn
        ? {}
        : { hint: "Add ?signin=1 to also test whether a seeded coach can log in." }),
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
