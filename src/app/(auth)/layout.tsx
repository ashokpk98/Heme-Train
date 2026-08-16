export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded bg-accent text-sm font-bold text-accent-text">
            H
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">HEME</p>
            <p className="text-[11px] text-text-faint">
              Program builder &amp; athlete monitoring
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
