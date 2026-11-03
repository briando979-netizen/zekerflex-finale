import type { ReactNode } from "react";
import Link from "next/link";
import { PERIOD_OPTIONS, type Period } from "@/lib/admin/period";
import { percentOf } from "@/lib/admin/format";

// ---------------------------------------------------------------------------
// De bouwstenen van de dashboards in de beheeromgeving. Werkt op de server: wat
// een browser nodig heeft (grafieken, tabellen) staat in kit-client.tsx. Kleuren
// komen uit de tokens op .admin-scope, zodat licht en donker vanzelf kloppen.
// ---------------------------------------------------------------------------

export type Tone = "ok" | "warn" | "crit" | "plan" | "trust" | "money" | "neutral";

const TONE_INK: Record<Tone, string> = {
  ok: "var(--a-ok)",
  warn: "var(--a-warn)",
  crit: "var(--a-crit)",
  plan: "var(--a-plan)",
  trust: "var(--a-trust)",
  money: "var(--a-money)",
  neutral: "var(--a-dim)",
};
const TONE_SOFT: Record<Tone, string> = {
  ok: "var(--a-ok-soft)",
  warn: "var(--a-warn-soft)",
  crit: "var(--a-crit-soft)",
  plan: "var(--a-plan-soft)",
  trust: "var(--a-trust-soft)",
  money: "var(--a-money-soft)",
  neutral: "var(--a-elev)",
};

export function PageHead({ title, subtitle, actions, meta }: { title: string; subtitle?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 lg:mb-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight sm:text-[1.625rem]" style={{ color: "var(--a-text)" }}>
            {title}
          </h1>
          {meta}
        </div>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--a-mute)" }}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  footer,
  children,
  className = "",
  flush = false,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Geen binnenruimte, voor tabellen en lijsten die tot de rand lopen. */
  flush?: boolean;
}) {
  return (
    <section className={`a-panel flex min-w-0 flex-col overflow-hidden ${className}`}>
      {title ? (
        <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5 ${flush ? "pb-3" : ""}`}>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>{subtitle}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className={`min-w-0 flex-1 ${flush ? "" : "px-4 pb-4 pt-3 sm:px-5 sm:pb-5"}`}>{children}</div>
      {footer ? (
        <div className="px-4 py-2.5 text-xs sm:px-5" style={{ borderTop: "1px solid var(--a-border)", color: "var(--a-mute)" }}>
          {footer}
        </div>
      ) : null}
    </section>
  );
}

// Tekst op de zachte labelachtergrond: groen en amber een tint donkerder (globals.css,
// --a-ok-ink/--a-warn-ink), anders halen ze geen 4,5:1. Grafieken houden TONE_INK.
const PILL_INK: Record<Tone, string> = { ...TONE_INK, ok: "var(--a-ok-ink)", warn: "var(--a-warn-ink)" };

/** Status: altijd woord plus stip, nooit alleen kleur. */
export function Pill({ tone = "neutral", children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: PILL_INK[tone], background: TONE_SOFT[tone] }}>
      {dot && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: "currentColor" }} />}
      {children}
    </span>
  );
}

/** Een melding tussen de panelen: wat er net gebeurde, of waar je op moet letten. */
export function Notice({ tone = "neutral", children, role = "status" }: { tone?: Tone; children: ReactNode; role?: "status" | "alert" }) {
  return (
    <p role={role} className="rounded-lg px-4 py-2.5 text-[0.8125rem]" style={{ color: tone === "neutral" ? "var(--a-dim)" : "var(--a-text)", background: TONE_SOFT[tone], boxShadow: `inset 3px 0 0 ${tone === "neutral" ? "var(--a-border-strong)" : TONE_INK[tone]}` }}>
      {children}
    </p>
  );
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium" style={{ color: "var(--a-text)" }}>{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-sm text-xs" style={{ color: "var(--a-mute)" }}>{body}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <span className="grid flex-shrink-0 place-items-center rounded-full font-semibold" style={{ width: size, height: size, fontSize: size * 0.34, background: "var(--a-elev)", color: "var(--a-dim)" }} aria-hidden>
      {initials}
    </span>
  );
}

/** Naam met tweede regel, zoals in tabellen. */
export function NameCell({ name, sub, href }: { name: string; sub?: ReactNode; href?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} />
      <span className="min-w-0">
        {href ? (
          <Link href={href} className="block truncate font-medium hover:underline" style={{ color: "var(--a-text)" }}>{name}</Link>
        ) : (
          <span className="block truncate font-medium" style={{ color: "var(--a-text)" }}>{name}</span>
        )}
        {sub ? <span className="block truncate text-xs" style={{ color: "var(--a-mute)" }}>{sub}</span> : null}
      </span>
    </span>
  );
}

// --- Cijfers -----------------------------------------------------------------

/** Verloop in het klein: grijze lijn, de laatste stip in de actiekleur. */
export function Spark({ data, width = 76, height = 26 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2 || data.every((v) => v === 0)) return null;
  const max = Math.max(...data);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = data[data.length - 1]!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0" aria-hidden>
      <path d={line} fill="none" stroke="var(--a-other)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width - 1} cy={y(last)} r="2.5" fill="var(--a-s1)" stroke="var(--a-panel)" strokeWidth="1" />
    </svg>
  );
}

/** Pijl plus getal: de kleur zegt of het goed of slecht is, de pijl waar het heen gaat. */
export function Delta({ value, goodWhen = "up", suffix = "%" }: { value: number | null | undefined; goodWhen?: "up" | "down"; suffix?: string }) {
  if (value === null || value === undefined) return null;
  const flat = value === 0;
  const good = goodWhen === "up" ? value > 0 : value < 0;
  const color = flat ? "var(--a-mute)" : good ? "var(--a-ok)" : "var(--a-crit)";
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color }}>
      <span aria-hidden>{flat ? "→" : value > 0 ? "↗" : "↘"}</span>
      {value > 0 ? "+" : ""}{value.toLocaleString("nl-NL")}{suffix}
    </span>
  );
}

export interface KpiProps {
  label: string;
  value: ReactNode;
  delta?: number | null;
  goodWhen?: "up" | "down";
  hint?: ReactNode;
  spark?: number[];
  href?: string;
  tone?: Tone;
}

function KpiCell({ label, value, delta, goodWhen = "up", hint, spark, tone }: KpiProps) {
  return (
    <>
      <p className="text-[0.8125rem] leading-snug" style={{ color: "var(--a-mute)" }}>{label}</p>
      <p className="mt-1.5 truncate text-[1.5rem] font-semibold leading-tight tracking-tight sm:text-[1.625rem]" style={{ color: tone ? TONE_INK[tone] : "var(--a-text)" }}>{value}</p>
      {(delta !== undefined && delta !== null) || hint || spark ? (
        <div className="mt-1.5 flex min-h-[1.375rem] items-center justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs" style={{ color: "var(--a-mute)" }}>
            <Delta value={delta} goodWhen={goodWhen} />
            {hint ? <span className="min-w-0">{hint}</span> : null}
          </p>
          {spark ? <Spark data={spark} width={52} height={22} /> : null}
        </div>
      ) : null}
    </>
  );
}

/** Een rij kerncijfers in één kaart, gescheiden door haarlijnen. */
export function KpiStrip({ items, className = "" }: { items: KpiProps[]; className?: string }) {
  const cols = items.length >= 6 ? "lg:grid-cols-6" : items.length === 5 ? "lg:grid-cols-5" : items.length === 3 ? "lg:grid-cols-3" : items.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-4";
  return (
    <section className={`a-panel a-kpis grid grid-cols-2 gap-px overflow-hidden ${cols} ${className}`} style={{ background: "var(--a-border)" }}>
      {items.map((item) =>
        item.href ? (
          <Link key={item.label} href={item.href} className="min-w-0 p-4 transition-colors hover:bg-[var(--a-panel-2)] sm:p-5" style={{ background: "var(--a-panel)" }}>
            <KpiCell {...item} />
          </Link>
        ) : (
          <div key={item.label} className="min-w-0 p-4 sm:p-5" style={{ background: "var(--a-panel)" }}>
            <KpiCell {...item} />
          </div>
        ),
      )}
    </section>
  );
}

/** De periodekeuze: één rij boven alles wat hij bepaalt. */
export function PeriodTabs({ period, basePath, extra }: { period: Period; basePath: string; extra?: Record<string, string> }) {
  return (
    <nav aria-label="Periode" className="inline-flex rounded-lg p-0.5" style={{ background: "var(--a-elev)" }}>
      {PERIOD_OPTIONS.map((days) => {
        const active = period.days === days;
        const query = new URLSearchParams({ ...extra, periode: String(days) }).toString();
        return (
          <Link
            key={days}
            href={`${basePath}?${query}`}
            scroll={false}
            aria-current={active ? "true" : undefined}
            className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
            style={active ? { background: "var(--a-panel)", color: "var(--a-text)", boxShadow: "var(--a-shadow-sm)" } : { color: "var(--a-mute)" }}
          >
            {days === 365 ? "12 mnd" : `${days} d`}
          </Link>
        );
      })}
    </nav>
  );
}

// --- Verdelingen -------------------------------------------------------------

/** Vergelijken op grootte: één kleur, de lengte zegt het. Getal altijd zichtbaar. */
export function BarList({ rows, emptyText = "Nog geen gegevens." }: { rows: { label: ReactNode; value: number; display?: ReactNode; href?: string; key?: string }[]; emptyText?: string }) {
  if (rows.length === 0) return <p className="py-4 text-sm" style={{ color: "var(--a-mute)" }}>{emptyText}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((row, i) => {
        const inner = (
          <>
            <span className="mb-1 flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="min-w-0 truncate" style={{ color: "var(--a-dim)" }}>{row.label}</span>
              <span className="num flex-shrink-0 font-medium" style={{ color: "var(--a-text)" }}>{row.display ?? row.value}</span>
            </span>
            <span className="block h-1.5 overflow-hidden rounded-full" style={{ background: "var(--a-elev)" }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100)}%`, background: "var(--a-s1)" }} />
            </span>
          </>
        );
        return (
          <li key={row.key ?? i}>
            {row.href ? <Link href={row.href} className="block rounded transition-opacity hover:opacity-80">{inner}</Link> : inner}
          </li>
        );
      })}
    </ul>
  );
}

const SLOT = (n: number) => `var(--a-s${((n - 1) % 8) + 1})`;

/** Deel van het geheel: gestapelde balk met witruimte tussen de delen en een legenda met getallen. */
export function StackBar({ segments, format = (v) => String(v), emptyText = "Nog geen gegevens." }: { segments: { label: string; value: number; tone?: Tone; slot?: number }[]; format?: (value: number) => string; emptyText?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <p className="py-2 text-sm" style={{ color: "var(--a-mute)" }}>{emptyText}</p>;
  const colorOf = (seg: { tone?: Tone; slot?: number }, i: number) => (seg.tone ? TONE_INK[seg.tone] : SLOT(seg.slot ?? i + 1));
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segments.map((s) => `${s.label}: ${format(s.value)}`).join(", ")}>
        {segments.map((seg, i) => (seg.value > 0 ? <span key={seg.label} title={`${seg.label}: ${format(seg.value)}`} style={{ width: `${(seg.value / total) * 100}%`, background: colorOf(seg, i) }} /> : null))}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-[0.8125rem]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(17rem, 100%), 1fr))" }}>
        {segments.map((seg, i) => (
          <li key={seg.label} className="flex items-center gap-2">
            <span className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ background: colorOf(seg, i) }} aria-hidden />
            <span className="min-w-0 flex-1 truncate" style={{ color: "var(--a-dim)" }}>{seg.label}</span>
            <span className="num font-medium" style={{ color: "var(--a-text)" }}>{format(seg.value)}</span>
            <span className="num w-9 text-right text-xs" style={{ color: "var(--a-mute)" }}>{percentOf(seg.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Een verhouding tegenover een grens. */
export function Meter({ label, value, max, display, tone = "ok" }: { label: ReactNode; value: number; max: number; display?: ReactNode; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === "neutral" ? "var(--a-s1)" : TONE_INK[tone];
  return (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="min-w-0 truncate" style={{ color: "var(--a-dim)" }}>{label}</span>
        <span className="num flex-shrink-0 font-medium" style={{ color: "var(--a-text)" }}>{display ?? `${value} / ${max}`}</span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--a-elev)" }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** Stappen na elkaar: één kleur die lichter wordt, met het percentage dat doorstroomt. */
export function Funnel({ stages }: { stages: { label: string; value: number; href?: string }[] }) {
  const top = Math.max(stages[0]?.value ?? 0, 1);
  const OPACITY = [100, 86, 72, 60, 50, 42];
  return (
    <ol className="space-y-2">
      {stages.map((stage, i) => {
        const prev = i > 0 ? stages[i - 1]!.value : null;
        const row = (
          <>
            <span className="mb-1 flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="min-w-0 truncate" style={{ color: "var(--a-dim)" }}>{stage.label}</span>
              <span className="flex flex-shrink-0 items-baseline gap-2">
                {prev !== null && prev > 0 && <span className="num text-xs" style={{ color: "var(--a-mute)" }}>{percentOf(stage.value, prev)}% door</span>}
                <span className="num font-medium" style={{ color: "var(--a-text)" }}>{stage.value}</span>
              </span>
            </span>
            <span className="block h-5 overflow-hidden rounded" style={{ background: "var(--a-elev)" }}>
              <span className="block h-full rounded" style={{ width: `${Math.max(stage.value > 0 ? 1.5 : 0, (stage.value / top) * 100)}%`, background: `color-mix(in srgb, var(--a-s1) ${OPACITY[Math.min(i, OPACITY.length - 1)]}%, var(--a-panel))` }} />
            </span>
          </>
        );
        return <li key={stage.label}>{stage.href ? <Link href={stage.href} className="block transition-opacity hover:opacity-80">{row}</Link> : row}</li>;
      })}
    </ol>
  );
}

/** Tijdlijn van wat er gebeurde. */
export function Feed({ items, emptyText = "Nog geen activiteit." }: { items: { key: string; text: ReactNode; meta?: ReactNode; tone?: Tone; href?: string }[]; emptyText?: string }) {
  if (items.length === 0) return <p className="py-4 text-sm" style={{ color: "var(--a-mute)" }}>{emptyText}</p>;
  return (
    <ul>
      {items.map((item) => {
        const row = (
          <span className="flex gap-3 py-2">
            <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: item.tone ? TONE_INK[item.tone] : "var(--a-axis)" }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem]" style={{ color: "var(--a-text)" }}>{item.text}</span>
              {item.meta ? <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{item.meta}</span> : null}
            </span>
          </span>
        );
        return <li key={item.key}>{item.href ? <Link href={item.href} className="block rounded transition-opacity hover:opacity-75">{row}</Link> : row}</li>;
      })}
    </ul>
  );
}

/** Label en waarde onder elkaar, voor detailpagina's. */
export function InfoList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y" style={{ borderColor: "var(--a-border)" }}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-2 text-[0.8125rem]" style={{ borderColor: "var(--a-border)" }}>
          <dt className="flex-shrink-0" style={{ color: "var(--a-mute)" }}>{row.label}</dt>
          <dd className="min-w-0 truncate text-right font-medium" style={{ color: "var(--a-text)" }}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
