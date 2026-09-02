import type { ReactNode } from "react";
import Link from "next/link";
import type { MarketplaceShift } from "@/lib/dashboard/marketplace";
import { shiftCategory } from "@/lib/shifts/category";
import { formatMinutes, MODE_ORDER, type TravelModeKey } from "@/lib/geo/travel-modes";
import { money, moneyExact, dateTime } from "@/components/app/ui";

// ---------------------------------------------------------------------------
// Premium shift card — photo header, match ring, multi-modal travel chips,
// pay + duration. Presentational; `action` is the (client) apply control.
// ---------------------------------------------------------------------------

function ModeIcon({ mode }: { mode: TravelModeKey }) {
  const p = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none" } as const;
  if (mode === "transit")
    return (
      <svg {...p}>
        <rect x="5" y="3" width="14" height="13" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <path d="M5 11h14M9 20l-2 2M15 20l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8.5" cy="13.5" r="1" fill="currentColor" />
        <circle cx="15.5" cy="13.5" r="1" fill="currentColor" />
      </svg>
    );
  if (mode === "driving")
    return (
      <svg {...p}>
        <path d="M4 13l1.5-5A2 2 0 0 1 7.4 6.5h9.2a2 2 0 0 1 1.9 1.5L20 13M4 13h16v4H4v-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="7.5" cy="17" r="1.5" fill="currentColor" />
        <circle cx="16.5" cy="17" r="1.5" fill="currentColor" />
      </svg>
    );
  if (mode === "bicycling")
    return (
      <svg {...p}>
        <circle cx="6" cy="17" r="3.5" stroke="currentColor" strokeWidth="2" />
        <circle cx="18" cy="17" r="3.5" stroke="currentColor" strokeWidth="2" />
        <path d="M6 17l4-7h5l3 7M10 10l-1-3h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  return (
    <svg {...p}>
      <circle cx="13" cy="4.5" r="1.8" fill="currentColor" />
      <path d="M13 8v5l3 3M13 13l-3 2-1 4M13 10l-4-1 1 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TravelChips({ travel }: { travel: NonNullable<MarketplaceShift["travel"]> }) {
  const shown = MODE_ORDER.filter((m) => {
    const e = travel.byMode[m];
    if (m === "walking") return e.distanceKm <= 6;
    if (m === "bicycling") return e.distanceKm <= 20;
    return true;
  });
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((m) => {
        const e = travel.byMode[m];
        const isFast = m === travel.fastest.mode;
        return (
          <span
            key={m}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${
              isFast
                ? "bg-brand-50 text-brand-700 ring-1 ring-brand-500/25"
                : "bg-paper-soft text-neutralx-500"
            }`}
            title={`${e.label} · ${e.distanceKm} km`}
          >
            <ModeIcon mode={m} />
            {e.minutes}′
          </span>
        );
      })}
    </div>
  );
}

const OFFER_LABEL: Record<string, string> = {
  pending: "in afwachting",
  accepted: "geaccepteerd",
  declined: "afgewezen",
  withdrawn: "ingetrokken",
};

export function ShiftCard({
  shift,
  href,
  action,
  compact = false,
  ribbon,
  footerOverride,
  dim = false,
}: {
  shift: MarketplaceShift;
  href: string;
  action?: ReactNode;
  compact?: boolean;
  /** corner ribbon on the photo, e.g. "Vervanging" or a status */
  ribbon?: { label: string; tone?: "amber" | "brand" | "neutral" | "crit" };
  /** replaces the Details + action footer entirely (e.g. a non-clickable status) */
  footerOverride?: ReactNode;
  dim?: boolean;
}) {
  const cat = shiftCategory(shift.title, shift.skill);
  const seatsFree = shift.positions - shift.taken;
  const score = shift.match ? Math.round(shift.match.score * 100) : null;
  const ribbonBg =
    ribbon?.tone === "amber"
      ? "rgba(180,83,9,.92)"
      : ribbon?.tone === "crit"
        ? "rgba(185,28,28,.92)"
        : ribbon?.tone === "neutral"
          ? "rgba(12,14,18,.75)"
          : "rgba(14,92,74,.92)";

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift ${
        dim ? "opacity-70" : ""
      }`}
    >
      {/* photo */}
      <Link href={href} className="relative block aspect-[16/9] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cat.photo}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
        <span
          className="absolute left-3 top-3 rounded-full px-2 py-1 text-[11px] font-semibold text-white backdrop-blur"
          style={{ background: `${cat.accent}cc` }}
        >
          {cat.label}
        </span>
        {ribbon ? (
          <span
            className="absolute right-3 top-3 rounded-full px-2 py-1 text-[11px] font-bold text-white backdrop-blur"
            style={{ background: ribbonBg }}
          >
            {ribbon.label}
          </span>
        ) : score !== null ? (
          <span
            className="absolute right-3 top-3 rounded-full px-2 py-1 text-[11px] font-bold text-white backdrop-blur"
            style={{ background: score >= 80 ? "rgba(14,92,74,.85)" : "rgba(12,14,18,.6)" }}
            title={shift.match?.reasons.join(" · ")}
          >
            {score}% match
          </span>
        ) : null}
        {shift.isReplacement && !ribbon && (
          <span className="absolute left-3 top-11 rounded-full bg-warn/90 px-2 py-1 text-[11px] font-bold text-white backdrop-blur">
            Vervanging
          </span>
        )}
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between text-white">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold leading-tight drop-shadow">{shift.title}</p>
            <p className="truncate text-xs text-white/80">
              {shift.branch} · {shift.city}
              {shift.travel ? ` · ${shift.travel.distanceKm} km` : ""}
            </p>
          </div>
          <span className="num flex-shrink-0 rounded-lg bg-white/15 px-2 py-1 text-sm font-bold backdrop-blur">
            {moneyExact(shift.hourlyRateCents)}/u
          </span>
        </div>
      </Link>

      {/* body */}
      <div className="flex flex-1 flex-col p-4">
        {(shift.series || shift.myOffer || shift.replacementNote) && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {shift.series && shift.series.total > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                📅 {shift.series.total} dagen beschikbaar
              </span>
            )}
            {shift.myOffer && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn">
                Tegenbod {moneyExact(shift.myOffer.proposedRateCents)}/u · {OFFER_LABEL[shift.myOffer.status] ?? shift.myOffer.status}
              </span>
            )}
            {shift.replacementNote && (
              <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-500">
                {shift.replacementNote}
              </span>
            )}
          </div>
        )}
        {shift.travel && <TravelChips travel={shift.travel} />}

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <div>
            <dt className="text-[11px] text-neutralx-400">Wanneer</dt>
            <dd className="text-ink-soft">{dateTime(shift.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-neutralx-400">Duur</dt>
            <dd className="text-ink-soft">
              {shift.hours} u{shift.breakMinutes ? ` · ${shift.breakMinutes}m pauze` : ""}
            </dd>
          </div>
          {!compact && (
            <>
              <div>
                <dt className="text-[11px] text-neutralx-400">Geschat bruto</dt>
                <dd className="num font-semibold text-brand-600">{money(shift.grossCents)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-neutralx-400">Snelste route</dt>
                <dd className="text-ink-soft">
                  {shift.travel ? `${shift.travel.fastest.label} · ${formatMinutes(shift.travel.fastest.minutes)}` : "—"}
                </dd>
              </div>
            </>
          )}
        </dl>

        {shift.match?.belowDesiredRate && (
          <p className="mt-2 text-[11px] font-medium text-warn">Onder je richttarief</p>
        )}
        {shift.workedHereBefore > 0 && (
          <p className="mt-1 text-[11px] text-neutralx-400">Je werkte hier al {shift.workedHereBefore}×</p>
        )}

        <div className="mt-auto pt-4">
          {footerOverride ?? (
            <div className="flex items-end justify-between">
              <span className="num text-xs text-neutralx-400">
                {seatsFree} van {shift.positions} plek{shift.positions === 1 ? "" : "ken"} vrij
              </span>
              <div className="flex items-center gap-2">
                <Link href={href} className="btn-ghost px-3 py-1.5 text-xs">
                  Details
                </Link>
                {action}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** A visible-but-not-clickable status button ("special voor jou"). */
export function ShiftStatusButton({
  label,
  hint,
  tone = "neutral",
}: {
  label: string;
  hint?: string;
  tone?: "ok" | "warn" | "crit" | "neutral" | "brand";
}) {
  const style: Record<string, string> = {
    ok: "bg-ok/10 text-ok",
    warn: "bg-warn/10 text-warn",
    crit: "bg-crit/10 text-crit",
    brand: "bg-brand-50 text-brand-700",
    neutral: "bg-paper-soft text-neutralx-600",
  };
  return (
    <div className="flex w-full items-center justify-between gap-2">
      {hint ? <span className="text-[11px] text-neutralx-400">{hint}</span> : <span />}
      <span
        aria-disabled
        className={`inline-flex cursor-default select-none items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${style[tone]}`}
      >
        {label}
      </span>
    </div>
  );
}
