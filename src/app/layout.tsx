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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
