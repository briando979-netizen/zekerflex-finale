import type { ReactNode } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Admin UI primitives — the aniq-style dark surface kit. Server-safe.
// All colour comes from CSS vars set on .admin-scope (see globals.css).
// ---------------------------------------------------------------------------

export function APageHeader({
  title,
  subtitle,
  badge,
  action,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-[1.85rem] font-bold leading-tight tracking-tight" style={{ color: "var(--a-text)" }}>
            {title}
          </h1>
          {badge ? (
            <span
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}
            >
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-2 text-sm" style={{ color: "var(--a-mute)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function AButton({
  children,
  href,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  icon,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const cls = `a-btn ${variant === "primary" ? "a-btn-primary" : "a-btn-ghost"}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} style={disabled ? { opacity: 0.5 } : undefined}>
      {icon}
      {children}
    </button>
  );
}

const STAT_TREND: Record<string, string> = {
  up: "#4ade80",
  down: "#fca5a5",
  flat: "var(--a-mute)",
};

export function AStat({
  label,
  value,
  icon,
  trend,
  trendDir = "up",
  watermark,
  sub,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  /** e.g. "12.5" or "+5%" */
  trend?: string;
  trendDir?: "up" | "down" | "flat";
  watermark?: ReactNode;
  sub?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4"
      style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}
    >
      {watermark ? (
        <span className="pointer-events-none absolute -bottom-3 -right-3 opacity-[0.06]" style={{ color: "var(--a-text)" }}>
          {watermark}
        </span>
      ) : null}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {icon ? (
            <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
              {icon}
            </span>
          ) : null}
          <span className="text-[0.8rem]" style={{ color: "var(--a-mute)" }}>
            {label}
          </span>
        </div>
        <span className="a-handle text-xs">⣿</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="num font-display text-[1.65rem] font-bold leading-none" style={{ color: "var(--a-text)" }}>
          {value}
        </span>
        {trend ? (
          <span className="num flex items-center gap-1 text-xs font-semibold" style={{ color: STAT_TREND[trendDir] }}>
            {trendDir === "up" ? "↗" : trendDir === "down" ? "↘" : "→"} {trend}
          </span>
        ) : sub ? (
          <span className="text-xs" style={{ color: "var(--a-mute)" }}>
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function APanel({
  title,
  subtitle,
  action,
  children,
  className = "",
  pad = true,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl ${className}`}
      style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
              {title}
            </h2>
            {subtitle ? (
              <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function ASectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--a-mute)" }}>
      {children}
    </p>
  );
}

const PILL_TONE: Record<string, { fg: string; bg: string }> = {
  ok: { fg: "#4ade80", bg: "rgba(16,185,129,0.15)" },
  warn: { fg: "#fbbf24", bg: "rgba(245,158,11,0.15)" },
  crit: { fg: "#fca5a5", bg: "rgba(248,113,113,0.15)" },
  neutral: { fg: "var(--a-dim)", bg: "var(--a-elev)" },
};

export function APill({ tone = "neutral", children }: { tone?: keyof typeof PILL_TONE; children: ReactNode }) {
  const t = PILL_TONE[tone] ?? PILL_TONE.neutral!;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: t.fg, background: t.bg }}
    >
      {tone !== "neutral" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.fg }} />}
      {children}
    </span>
  );
}
