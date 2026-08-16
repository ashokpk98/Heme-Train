import type { ReactNode } from "react";

/** Small semantic building blocks shared across the coach console. */

const TONES = {
  neutral: "bg-surface-3 text-text-muted",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Turns snake_case enum values into readable labels. */
export function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b1rm\b/i, "1RM")
    .replace(/\bRpe\b/, "RPE")
    .replace(/\bAmrap\b/, "AMRAP")
    .replace(/\bEmom\b/, "EMOM")
    .replace(/\bGpp\b/, "GPP")
    .replace(/\bSpp\b/, "SPP");
}

/** Colour-codes the session-block type so a session reads at a glance. */
export function blockTone(blockType: string): Tone {
  switch (blockType) {
    case "warmup":
    case "activation":
      return "warn";
    case "power":
      return "violet";
    case "main_strength":
      return "accent";
    case "conditioning":
      return "info";
    case "cooldown":
      return "ok";
    default:
      return "neutral";
  }
}

export function sessionTone(sessionType: string): Tone {
  switch (sessionType) {
    case "strength":
      return "accent";
    case "power":
      return "violet";
    case "hypertrophy":
      return "info";
    case "conditioning":
      return "warn";
    case "testing":
      return "ok";
    default:
      return "neutral";
  }
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm text-text-muted">{title}</p>
      {hint ? <p className="mt-1 text-xs text-text-faint">{hint}</p> : null}
    </div>
  );
}

export const DAY_NAMES = [
  "",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
