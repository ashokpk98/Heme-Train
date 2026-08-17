/**
 * `npm run auth:doctor` — diagnose, then repair, the seeded coach logins.
 *
 * Why this exists as a script rather than more SQL.
 *
 * diagnose-auth.sql proved the database rows are correct: the stored bcrypt
 * hash verifies against the fixture password, the email is confirmed, the
 * identity and profile rows exist, nothing is banned or soft-deleted. And
 * sign-in was still refused. That combination means the fault is no longer
 * something SQL can see — it is in how Supabase's auth service interprets a row
 * that was written by hand rather than by the service itself.
 *
 * So this stops asserting facts about the row and asks the auth service
 * directly. Two phases:
 *
 *   1. Attempt a real sign-in for each fixture account and print the *actual*
 *      status and error code. The login form cannot show these — it collapses
 *      every failure into one message on purpose, because distinguishing "no
 *      such user" from "wrong password" would let anyone enumerate accounts.
 *      That protection is correct and it is exactly what has made this opaque,
 *      so the diagnosis has to come from outside the form.
 *
 *   2. For anything that failed, set the password through the Admin API and
 *      retry. This is the part SQL cannot do: it makes GoTrue hash and store
 *      the password with its own code path, so the account stops being a
 *      hand-written row and becomes indistinguishable from one created by
 *      signup — which we know works, because a self-registered account signs in
 *      fine. User ids are preserved, so every seeded athlete, group and program
 *      stays attached to its coach.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env.local for phase 2 only. Phase 1 runs
 * with the public key alone. Remove the service key again when you are done —
 * nothing else in the app reads it except the seeder.
 */

import { createClient } from "@supabase/supabase-js";
import { SEED_COACHES, SEED_PASSWORD } from "../src/lib/db/seed/coaches";
import { describeKey, getSupabaseConfig } from "../src/lib/env";

interface Attempt {
  ok: boolean;
  status?: number;
  code?: string;
  message?: string;
}

/** Signs in with the public key, exactly as the browser does. */
async function trySignIn(
  url: string,
  key: string,
  email: string,
): Promise<Attempt> {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: SEED_PASSWORD,
  });
  if (error) {
    return {
      ok: false,
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }
  return { ok: Boolean(data.session) };
}

function describeAttempt(a: Attempt): string {
  if (a.ok) return "OK";
  const bits = [
    a.status !== undefined ? `HTTP ${a.status}` : null,
    a.code ?? null,
    a.message ?? null,
  ].filter(Boolean);
  return bits.join(" · ") || "failed";
}

/** Maps the auth service's own error code to what to do about it. */
function interpret(a: Attempt): string | null {
  if (a.ok) return null;
  switch (a.code) {
    case "invalid_credentials":
      return "The auth service rejected the password even though the stored hash verifies in SQL. This is the case phase 2 fixes.";
    case "email_not_confirmed":
      return "The account exists but is unconfirmed. Phase 2 confirms it.";
    case "email_provider_disabled":
      return "Email/password sign-in is turned off for this project. Enable it under Authentication → Sign In / Providers → Email. No script can work around this.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Rate limited by Supabase, not rejected. Wait a few minutes and re-run; repeated failed attempts cause this.";
    case "user_banned":
      return "The account is banned until a future timestamp.";
    default:
      if (a.status === 401)
        return "The public key was rejected. If this project enabled the new sb_publishable_ keys, the legacy anon JWT is disabled — copy the current key from Settings → API Keys.";
      return null;
  }
}

async function main() {
  const { url, key, keySource } = getSupabaseConfig();
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or the public key in .env.local.",
    );
    process.exit(1);
  }

  console.log("Project :", new URL(url).host);
  console.log("Key     :", `${keySource} (${describeKey(key).format})`);
  console.log("Password:", SEED_PASSWORD);
  console.log();

  const emails = SEED_COACHES.map((c) => c.email);

  /* ---------------------------- phase 1: ask ---------------------------- */

  console.log("Phase 1 — what does the auth service actually say?\n");
  const before = new Map<string, Attempt>();
  for (const email of emails) {
    const attempt = await trySignIn(url, key, email);
    before.set(email, attempt);
    console.log(`  ${email.padEnd(16)} ${describeAttempt(attempt)}`);
  }

  const failing = emails.filter((e) => !before.get(e)!.ok);

  const notes = new Set<string>();
  for (const email of failing) {
    const note = interpret(before.get(email)!);
    if (note) notes.add(note);
  }
  if (notes.size) {
    console.log();
    for (const note of notes) console.log(`  → ${note}`);
  }

  if (failing.length === 0) {
    console.log("\nAll three seeded accounts sign in. Nothing to repair.");
    console.log("If the login form still refuses them, the form is talking to");
    console.log("a different project than this script — compare /api/health.");
    return;
  }

  /* --------------------------- phase 2: repair --------------------------- */

  console.log(`\nPhase 2 — repairing ${failing.length} account(s).\n`);

  if (!serviceKey) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY is not set, so the password cannot be reset\n" +
        "through the Admin API. Add it to .env.local (Settings → API Keys →\n" +
        "service_role), re-run, then remove it again.",
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // No lookup-by-email in the admin API, so page through. A fixture project is
  // small; this is not a hot path.
  const byEmail = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.error("Could not list users:", error.message);
      console.error(
        "A 401 here means the service_role key is wrong or was rotated.",
      );
      process.exit(1);
    }
    for (const u of data.users) if (u.email) byEmail.set(u.email, u.id);
    if (data.users.length < 200) break;
  }

  let repaired = 0;
  for (const email of failing) {
    const id = byEmail.get(email);
    if (!id) {
      console.log(`  ${email.padEnd(16)} no such account — run 02a_seed.sql`);
      continue;
    }

    const { error } = await admin.auth.admin.updateUserById(id, {
      password: SEED_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      console.log(`  ${email.padEnd(16)} admin update failed: ${error.message}`);
      continue;
    }

    const after = await trySignIn(url, key, email);
    console.log(
      `  ${email.padEnd(16)} password reset by Supabase → ${describeAttempt(after)}`,
    );
    if (after.ok) repaired++;
  }

  console.log();
  if (repaired === failing.length) {
    console.log(
      `All ${repaired} account(s) now sign in. Try the login form again.`,
    );
    console.log(
      "Then remove SUPABASE_SERVICE_ROLE_KEY from .env.local — only the",
    );
    console.log("seeder needs it, and it bypasses every RLS policy.");
  } else {
    console.log(
      "Some accounts still refuse to sign in after the auth service itself set",
    );
    console.log(
      "the password. That points at project configuration rather than data —",
    );
    console.log(
      "check Authentication → Sign In / Providers → Email is enabled, and that",
    );
    console.log("/api/health reports the same project this script just used.",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
