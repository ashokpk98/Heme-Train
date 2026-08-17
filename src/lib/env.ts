/**
 * Configuration resolution and validation.
 *
 * Both of the failure modes this guards against are silent, which is why they
 * get explicit checks rather than being left to fail at the point of use:
 *
 *  1. Supabase's current dashboard hands out a *publishable* key
 *     (`sb_publishable_…`) where it used to hand out an anon JWT, and suggests
 *     the env var name `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Reading only
 *     `NEXT_PUBLIC_SUPABASE_ANON_KEY` means a correctly-configured project
 *     looks unconfigured. Both names are accepted.
 *
 *  2. A Postgres URL whose password contains `/`, `@`, `:` or `#` must be
 *     percent-encoded. If it is not, `postgres()` does not throw — it silently
 *     parses the wrong host, port, user and database, then fails much later
 *     with an error that points nowhere near the real cause. `describeDatabaseUrl`
 *     detects that shape.
 */

export interface SupabaseConfig {
  url: string;
  /** Anon JWT or publishable key — either works as the browser-facing key. */
  key: string;
  /** Which env var the key came from, for diagnostics. */
  keySource: string | null;
}

const KEY_VARS = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  // Accepted for completeness; some templates use these names.
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
] as const;

export function getSupabaseConfig(): SupabaseConfig {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";

  let key = "";
  let keySource: string | null = null;
  for (const name of KEY_VARS) {
    const value = process.env[name];
    if (value) {
      key = value;
      keySource = name;
      break;
    }
  }

  return { url, key, keySource };
}

export function isAuthConfigured(): boolean {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}

/** Shape of a browser-facing key, without revealing it. */
export function describeKey(key: string): {
  present: boolean;
  format: "anon_jwt" | "publishable" | "secret_do_not_use" | "unrecognised" | "missing";
  length: number;
} {
  if (!key) return { present: false, format: "missing", length: 0 };
  if (key.startsWith("sb_publishable_")) {
    return { present: true, format: "publishable", length: key.length };
  }
  // A secret key in a browser-facing variable is a full-access leak, not merely
  // an unrecognised format — it must be called out as such.
  if (key.startsWith("sb_secret_")) {
    return { present: true, format: "secret_do_not_use", length: key.length };
  }
  if (!key.startsWith("eyJ")) {
    return { present: true, format: "unrecognised", length: key.length };
  }
  // Same for a service-role JWT.
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { role?: string };
    if (payload.role === "service_role") {
      return { present: true, format: "secret_do_not_use", length: key.length };
    }
  } catch {
    // Not a decodable JWT; fall through.
  }
  return { present: true, format: "anon_jwt", length: key.length };
}

export interface DatabaseUrlReport {
  present: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  database: string | null;
  /** True when the URL parses into something that cannot be a real target. */
  looksMisencoded: boolean;
  hint: string | null;
}

/**
 * Parses DATABASE_URL the way the driver will, and flags the mis-encoded
 * password case that otherwise fails silently.
 */
export function describeDatabaseUrl(
  raw = process.env.DATABASE_URL,
): DatabaseUrlReport {
  if (!raw) {
    return {
      present: false,
      host: null,
      port: null,
      user: null,
      database: null,
      looksMisencoded: false,
      hint: "DATABASE_URL is not set.",
    };
  }

  let host: string | null = null;
  let port: number | null = null;
  let user: string | null = null;
  let database: string | null = null;

  try {
    const u = new URL(raw);
    host = u.hostname || null;
    port = u.port ? Number(u.port) : null;
    user = decodeURIComponent(u.username || "") || null;
    database = decodeURIComponent(u.pathname.replace(/^\//, "")) || null;
  } catch {
    return {
      present: true,
      host: null,
      port: null,
      user: null,
      database: null,
      looksMisencoded: true,
      hint: "DATABASE_URL is not a parseable URL.",
    };
  }

  // The tell-tale signs of an unencoded password: the leftover text lands in
  // the database name, and the real host ends up inside it.
  const misencoded =
    Boolean(database && /[@/:]/.test(database)) ||
    Boolean(database && database.includes(".com")) ||
    !host;

  let hint: string | null = null;
  if (misencoded) {
    hint =
      "DATABASE_URL looks mis-encoded: the password almost certainly contains " +
      "a reserved character (/ @ : #) that must be percent-encoded — / becomes " +
      "%2F, @ becomes %40. As written, the driver parses the wrong host, port " +
      "and database and fails with an unrelated error.";
  } else if (host?.includes("pooler.supabase.com") && port !== 6543 && port !== 5432) {
    hint = `Unexpected pooler port ${port}. Transaction pooler is 6543, session pooler is 5432.`;
  }

  return { present: true, host, port, user, database, looksMisencoded: misencoded, hint };
}
