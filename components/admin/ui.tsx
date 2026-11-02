import type { ReactNode } from "react";
import Link from "next/link";
import { PageHead, Panel, Pill } from "@/components/admin/kit";

// ---------------------------------------------------------------------------
// De oudere bouwstenen van de beheeromgeving. Ze tonen nu dezelfde stijl als de
// kit (components/admin/kit.tsx), zodat pagina's die ze nog gebruiken er net zo
// uitzien. Nieuwe pagina's gebruiken de kit rechtstreeks.
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
  return <PageHead title={title} subtitle={subtitle} actions={action} meta={badge ? <Pill dot={false}>{badge}</Pill> : undefined} />;
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
  const cls = `a-button ${variant === "primary" ? "a-button-primary" : ""}`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {icon}
      {children}
    </button>
  );
}

const STAT_TREND: Record<string, string> = {
  up: "var(--a-ok)",
  down: "var(--a-crit)",
  flat: "var(--a-mute)",
};

export function AStat({
  label,
  value,
  icon,
  trend,
  trendDir = "up",
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
    <div className="a-panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>{label}</span>
        {icon ? <span className="flex-shrink-0 [&>svg]:h-4 [&>svg]:w-4" style={{ color: "var(--a-mute)" }}>{icon}</span> : null}
      </div>
      <p className="mt-1.5 truncate text-[1.5rem] font-semibold leading-tight tracking-tight" style={{ color: "var(--a-text)" }}>{value}</p>
      {trend ? (
        <p className="mt-1.5 text-xs font-semibold" style={{ color: STAT_TREND[trendDir] }}>
          {trendDir === "up" ? "↗" : trendDir === "down" ? "↘" : "→"} {trend}
        </p>
      ) : sub ? (
        <p className="mt-1.5 text-xs" style={{ color: "var(--a-mute)" }}>{sub}</p>
      ) : null}
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
    <Panel title={title} subtitle={subtitle} actions={action} className={className} flush={!pad}>
      {children}
    </Panel>
  );
}

export function ASectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
      {children}
    </p>
  );
}

export function APill({ tone = "neutral", children }: { tone?: "ok" | "warn" | "crit" | "neutral"; children: ReactNode }) {
  return <Pill tone={tone}>{children}</Pill>;
}
