import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HEME — Program Builder",
  description:
    "Strength & conditioning program builder, monitoring and analysis for coaches.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
     * `suppressHydrationWarning` on these two elements only.
     *
     * Browser extensions (password managers, translators, writing assistants,
     * AI sidebars) inject attributes into <html> and <body> after the server
     * HTML lands but before React hydrates — things like
     * `__processed_<uuid>__="true"`. React then sees a DOM that differs from
     * what it rendered and logs a hydration error that no application change
     * can fix.
     *
     * The suppression is deliberately scoped: it applies one level deep only,
     * and neither of these elements renders dynamic content, so nothing real
     * can hide behind it. Mismatches anywhere inside `children` still surface
     * normally.
     */
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
