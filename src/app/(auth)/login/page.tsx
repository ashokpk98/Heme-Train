import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { describeKey, getSupabaseConfig } from "@/lib/env";
import { signIn } from "../actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { url, key } = getSupabaseConfig();
  const keyInfo = describeKey(key);
  const configured = Boolean(url) && keyInfo.present;

  // A blank sign-in form on a misconfigured deployment is the worst outcome:
  // it looks fine and fails on submit with nothing to act on. Say what is
  // missing instead.
  if (!configured) {
    return (
      <div className="rounded-lg border border-warn/40 bg-warn-soft/40 p-5">
        <h1 className="text-[15px] font-semibold">Setup needed</h1>
        <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
          Sign-in is unavailable because the Supabase credentials are not
          readable by the running app.
        </p>

        <ul className="mt-3 space-y-1.5 text-[12px]">
          <Item
            ok={Boolean(url)}
            label="NEXT_PUBLIC_SUPABASE_URL"
            detail={url ? "set" : "missing"}
          />
          <Item
            ok={keyInfo.present}
            label="NEXT_PUBLIC_SUPABASE_ANON_KEY"
            detail={
              keyInfo.present
                ? `set (${keyInfo.format})`
                : "missing — NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY also accepted"
            }
          />
        </ul>

        <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
          On Vercel, <code>NEXT_PUBLIC_*</code> variables are baked in at build
          time — after adding them you must <strong>redeploy</strong>, not just
          restart. Visit{" "}
          <Link href="/api/health" className="text-accent hover:underline">
            /api/health
          </Link>{" "}
          for a full diagnosis including the database connection.
        </p>
      </div>
    );
  }

  return <AuthForm mode="signin" action={signIn} next={next} />;
}

function Item({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className={ok ? "text-ok" : "text-accent"}>{ok ? "✓" : "✕"}</span>
      <span>
        <code className="text-[11px]">{label}</code>
        <span className="ml-1.5 text-text-faint">— {detail}</span>
      </span>
    </li>
  );
}
