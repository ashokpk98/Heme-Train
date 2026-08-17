"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, isAuthConfigured } from "@/lib/auth/server";

export interface AuthState {
  error?: string;
  notice?: string;
}

const credentials = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const signUpInput = credentials.extend({
  name: z.string().min(1, "Enter your name."),
  orgName: z.string().optional(),
});

/** Only allow same-origin relative paths, so `?next=` can't be an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/programs";
}

const NOT_CONFIGURED =
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.";

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isAuthConfigured()) return { error: NOT_CONFIGURED };

  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  // Deliberately not distinguishing "no such user" from "wrong password" —
  // that difference is an account-enumeration oracle.
  if (error) return { error: "Email or password is incorrect." };

  revalidatePath("/", "layout");
  redirect(safeNext(formData.get("next")));
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isAuthConfigured()) return { error: NOT_CONFIGURED };

  const parsed = signUpInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
    orgName: formData.get("orgName") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { email, password, name, orgName } = parsed.data;
  const supabase = await createClient();

  // The organisation and the coach profile are created by the
  // `handle_new_user()` trigger from this metadata, inside the same
  // transaction as the auth user — so signup cannot half-succeed.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, org_name: orgName ?? null } },
  });

  if (error) return { error: error.message };

  // No session means the project requires email confirmation.
  if (!data.session) {
    return {
      notice: `Check ${email} for a confirmation link, then sign in.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/programs");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
