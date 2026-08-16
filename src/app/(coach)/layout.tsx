import Link from "next/link";

const NAV = [
  { href: "/programs", label: "Programs" },
  { href: "/library", label: "Exercise Library" },
  { href: "/athletes", label: "Athletes" },
];

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

        <div className="ml-auto flex items-center gap-3 text-xs text-text-faint">
          <span>HEME Performance</span>
          <span className="grid size-7 place-items-center rounded-full bg-surface-3 text-[11px] font-medium text-text-muted">
            HC
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
