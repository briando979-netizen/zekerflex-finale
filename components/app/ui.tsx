import type { ReactNode } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Shared app UI kit. Server-safe (no "use client") — animations are pure CSS.
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  action,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="animate-count-blur-in">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-[1.7rem] font-bold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        <span className="mt-2 block h-1 w-14 rounded-full bg-gradient-to-r from-brand-500 to-brand-mint" />
        {subtitle ? <p className="mt-3 text-sm text-neutralx-600">{subtitle}</p> : null}
      </div>
      {action ? <div className="animate-count-blur-in">{action}</div> : null}
    </div>
  );
}

const TONE_ACCENT: Record<string, string> = {
  default: "from-neutralx-400/50 via-neutralx-400/20 to-transparent",
  brand: "from-brand-mint via-brand-500 to-transparent",
  warn: "from-warn via-warn/50 to-transparent",
  crit: "from-crit via-crit/50 to-transparent",
};
const TONE_WASH: Record<string, string> = {
  default: "",
  brand: "bg-gradient-to-br from-brand-50/70 to-transparent",
  warn: "bg-gradient-to-br from-warn/[0.06] to-transparent",
  crit: "bg-gradient-to-br from-crit/[0.06] to-transparent",
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "default",
  trend,
  spark,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "brand" | "warn" | "crit";
  /** signed percentage vs previous period */
  trend?: number;
  /** tiny series, oldest → newest */
  spark?: number[];
  icon?: ReactNode;
}) {
  const accent = TONE_ACCENT[tone] ?? TONE_ACCENT.default;
  const numColor =
    tone === "brand" ? "text-brand-600" : tone === "warn" ? "text-warn" : tone === "crit" ? "text-crit" : "text-ink";

  return (
    <div className={`surface surface-hover group overflow-hidden p-5 ${TONE_WASH[tone] ?? ""}`}>
      <span className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${accent}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-neutralx-500">{label}</p>
        {icon ? (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-paper-soft text-neutralx-400">{icon}</span>
        ) : trend !== undefined ? (
          <TrendBadge value={trend} />
        ) : null}
      </div>
      <p
        className={`num mt-2.5 animate-count-blur-in font-display text-[2rem] font-bold leading-none tracking-tight transition-transform duration-300 group-hover:-translate-y-0.5 ${numColor}`}
      >
        {value}
      </p>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        {hint ? <p className="text-xs text-neutralx-400">{hint}</p> : <span />}
        {spark && spark.length > 1 ? <Sparkline data={spark} tone={tone} /> : null}
      </div>
    </div>
  );
}

export function TrendBadge({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        up ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"
      }`}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

export function Sparkline({
  data,
  tone = "default",
  width = 76,
  height = 26,
}: {
  data: number[];
  tone?: "default" | "brand" | "warn" | "crit";
  width?: number;
  height?: number;
}) {
  const stroke = tone === "warn" ? "#B45309" : tone === "crit" ? "#B91C1C" : "#0E5C4A";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)] as const);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  const last = pts[pts.length - 1]!;
  const id = `sg${Math.round(min)}${Math.round(max)}${data.length}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} />
    </svg>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hair bg-gradient-to-b from-white to-paper-soft/40 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          {icon ? <span className="text-brand-500">{icon}</span> : null}
          <div>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {subtitle ? <p className="text-xs text-neutralx-400">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="px-5 py-14 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-paper-soft text-neutralx-400">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <p className="font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-neutralx-500">{body}</p>
      {cta ? (
        <Link href={cta.href} className="btn-primary mt-4">
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

const PILL: Record<string, string> = {
  ok: "pill-ok",
  warn: "pill-warn",
  crit: "pill-crit",
  neutral: "pill-neutral",
};

export function StatusPill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return <span className={PILL[tone]}>{children}</span>;
}

export function money(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function moneyExact(cents: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function dateShort(d: Date | string): string {
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function dateTime(d: Date | string): string {
  return new Date(d).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
