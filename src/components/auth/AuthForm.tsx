"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import type { AuthState } from "@/app/(auth)/actions";

type Action = (state: AuthState, formData: FormData) => Promise<AuthState>;

/**
 * The fixture the seed creates. Shown as click-to-fill so the isolation model
 * can be checked in the live app without hunting for credentials.
 * The first two deliberately share an organisation.
 */
const demoAccounts = [
  { email: "a1@heme.test", note: "Alex Reid · 2 athletes" },
  { email: "a2@heme.test", note: "Jordan Six · same org" },
  { email: "b1@heme.test", note: "Sam Okafor · other org" },
];
const DEMO_PASSWORD = "heme-demo-1234";

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "signin" | "signup";
  action: Action;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const isSignUp = mode === "signup";

  /** Fills the seeded credentials so a tester does not have to type them. */
  function fill(email: string) {
    const form = formRef.current;
    if (!form) return;
    const emailInput = form.elements.namedItem("email") as HTMLInputElement | null;
    const passwordInput = form.elements.namedItem("password") as HTMLInputElement | null;
    if (emailInput) emailInput.value = email;
    if (passwordInput) passwordInput.value = DEMO_PASSWORD;
    emailInput?.focus();
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h1 className="text-[15px] font-semibold">
        {isSignUp ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-0.5 mb-4 text-[12px] text-text-faint">
        {isSignUp
          ? "You'll get your own workspace. Only you can see your athletes."
          : "Welcome back."}
      </p>

      {next && <input type="hidden" name="next" value={next} />}

      {isSignUp && (
        <>
          <Field label="Your name">
            <input
              name="name"
              required
              autoComplete="name"
              className="field field-focus"
            />
          </Field>
          <Field label="Team or gym name" hint="optional">
            <input
              name="orgName"
              autoComplete="organization"
              placeholder="Defaults to your name"
              className="field field-focus"
            />
          </Field>
        </>
      )}

      <Field label="Email">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="field field-focus"
        />
      </Field>

      <Field label="Password" hint={isSignUp ? "8 characters minimum" : undefined}>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          className="field field-focus"
        />
      </Field>

      {state.error && (
        <p
          role="alert"
          className="mt-3 rounded border border-accent/40 bg-accent-soft px-2 py-1.5 text-[12px] text-accent"
        >
          {state.error}
        </p>
      )}
      {state.notice && (
        <p
          role="status"
          className="mt-3 rounded border border-ok/40 bg-ok-soft px-2 py-1.5 text-[12px] text-ok"
        >
          {state.notice}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded bg-accent py-2 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending
          ? isSignUp
            ? "Creating account…"
            : "Signing in…"
          : isSignUp
            ? "Create account"
            : "Sign in"}
      </button>

      {!isSignUp && demoAccounts.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-text-faint">
            Seeded test accounts
          </p>
          <div className="space-y-1">
            {demoAccounts.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => fill(a.email)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] text-text-muted hover:bg-surface-2 hover:text-text"
              >
                <code className="text-[11px]">{a.email}</code>
                <span className="ml-auto text-text-faint">{a.note}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-text-faint">
            Click to fill, then press Sign in. The first two share an
            organisation — their athlete lists should not overlap.
          </p>
        </div>
      )}

      <p className="mt-3 text-center text-[12px] text-text-faint">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-[11px] text-text-muted">
        {label}
        {hint && <span className="ml-1 text-text-faint">({hint})</span>}
      </span>
      {children}
    </label>
  );
}
