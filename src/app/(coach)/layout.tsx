import Link from "next/link";
import { requireCoach } from "@/lib/auth/session";
import { signOut } from "@/app/(auth)/actions";

const NAV = [
  { href: "/programs", label: "Programs" },
  { href: "/library", label: "Exercise Library" },
  { href: "/athletes", label: "Athletes" },
];

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const coach = await requireCoach();
  const initials = coach.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-6 border-b border-border bg-surface px-5">
        <Link href="/programs" className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded bg-accent text-[13px] font-bold text-accent-text">
            H
          </span>
          <span className="text-sm font-semibold tracking-tight">HEME</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-1.5 text-[13px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-xs">
          <div className="text-right leading-tight">
            <p className="text-[12px] text-text">{coach.name}</p>
            <p className="text-[10px] text-text-faint">{coach.orgName}</p>
          </div>
          <span className="grid size-7 place-items-center rounded-full bg-surface-3 text-[11px] font-medium text-text-muted">
            {initials}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-border px-2 py-1 text-[11px] text-text-muted hover:border-accent hover:text-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
