import type { ReactNode } from "react";
import Link from "next/link";
import type { MarketplaceShift } from "@/lib/dashboard/marketplace";
import { shiftCategory } from "@/lib/shifts/category";
import { money, moneyExact } from "@/components/app/ui";
import { SaveShiftHeart } from "@/components/app/SaveShiftHeart";

// ---------------------------------------------------------------------------
// Shift card — YoungOnes-style: photo header with the category + a save heart,
// then company · title · when/where, badges and the pay line.
// Presentational; `action` / `footerOverride` drive the apply control.
// ---------------------------------------------------------------------------

const OFFER_LABEL: Record<string, string> = {
  pending: "in afwachting",
  accepted: "geaccepteerd",
  declined: "afgewezen",
  withdrawn: "ingetrokken",
};

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function whenLabel(start: Date, end: Date): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = `${WD[s.getDay()]} ${s.getDate()} ${MON[s.getMonth()]}.`;
  const t = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${day} · ${t(s)}–${t(e)}`;
}

export function ShiftCard({
  shift,
  href,
  action,
  compact = false,
  ribbon,
  footerOverride,
  idReminder = false,
  dim = false,
}: {
  shift: MarketplaceShift;
  href: string;
  action?: ReactNode;
  compact?: boolean;
  ribbon?: { label: string; tone?: "amber" | "brand" | "neutral" | "crit" };
  /** pass `null` to hide the footer entirely; omit for the default seats + apply row */
  footerOverride?: ReactNode;
  /** show a "Neem je ID mee" badge (used on confirmed klussen) */
  idReminder?: boolean;
  dim?: boolean;
}) {
  const cat = shiftCategory(shift.title, shift.skill);
  const score = shift.match ? Math.round(shift.match.score * 100) : null;
  const special = score !== null && score >= 78;
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
      <div className="relative aspect-[16/9] overflow-hidden">
        <Link href={href} className="block h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cat.photo}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
        </Link>
        <span
          className="absolute left-3 top-3 rounded-full px-2 py-1 text-[11px] font-semibold text-white backdrop-blur"
          style={{ background: `${cat.accent}cc` }}
        >
          {cat.label}
        </span>
        <div className="absolute right-3 top-3">
          <SaveShiftHeart shiftId={shift.id} />
        </div>
        {ribbon && (
          <span
            className="absolute left-3 bottom-3 rounded-full px-2 py-1 text-[11px] font-bold text-white backdrop-blur"
            style={{ background: ribbonBg }}
          >
            {ribbon.label}
          </span>
        )}
        <span className="num absolute bottom-3 right-3 rounded-lg bg-white/15 px-2 py-1 text-sm font-bold text-white backdrop-blur">
          {moneyExact(shift.hourlyRateCents)}/u
        </span>
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col p-4">
        <Link href={href} className="block">
          <p className="text-xs font-semibold text-brand-600">{shift.branch}</p>
          <p className="mt-0.5 font-display text-base font-bold leading-snug text-ink">{shift.title}</p>
        </Link>

        <p className="mt-2 text-xs text-neutralx-500">
          {whenLabel(shift.startsAt, shift.endsAt)}
          {" · "}
          {shift.city}
          {shift.travel ? ` · ${shift.travel.distanceKm} km` : ""}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {special && (
            <span className="rounded border border-crit/30 px-1.5 py-0.5 text-[11px] font-semibold text-crit">
              Speciaal voor jou
            </span>
          )}
          <span className="rounded border border-brand-500/40 px-1.5 py-0.5 text-[11px] font-semibold text-brand-600">
            Freelance
          </span>
          {idReminder && (
            <span className="rounded border border-hairstrong px-1.5 py-0.5 text-[11px] font-semibold text-neutralx-600">
              Neem je ID mee
            </span>
          )}
          {shift.series && shift.series.total > 1 && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
              +{shift.series.total} dagen
            </span>
          )}
          {shift.myOffer && (
            <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn">
              {shift.myOffer.proposedRateCents === shift.hourlyRateCents
                ? "Reactie verstuurd"
                : `Tegenbod ${moneyExact(shift.myOffer.proposedRateCents)}/u`}{" "}
              · {OFFER_LABEL[shift.myOffer.status] ?? shift.myOffer.status}
            </span>
          )}
          {shift.replacementNote && !ribbon && (
            <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-500">{shift.replacementNote}</span>
          )}
        </div>

        {shift.match?.belowDesiredRate && (
          <p className="mt-2 text-[11px] font-medium text-warn">Onder je richttarief</p>
        )}
        {shift.workedHereBefore > 0 && (
          <p className="mt-1 text-[11px] text-neutralx-400">Je werkte hier al {shift.workedHereBefore}×</p>
        )}

        <div className="mt-3 flex items-end justify-between border-t border-hair pt-3">
          <div>
            <p className="num font-display text-lg font-bold text-ink">{moneyExact(shift.hourlyRateCents)} / uur</p>
            {!compact && <p className="text-[11px] text-neutralx-400">Verdien ~ {money(shift.grossCents)}</p>}
          </div>
          <span className="num rounded-lg bg-paper-soft px-2 py-1 text-xs font-semibold text-neutralx-600">
            {shift.hours} uur
          </span>
        </div>

        {footerOverride === null ? (
          <div className="mt-auto" />
        ) : (
        <div className="mt-auto pt-3">
          {footerOverride !== undefined ? footerOverride : action ? <div className="flex justify-end">{action}</div> : null}
        </div>
        )}
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
