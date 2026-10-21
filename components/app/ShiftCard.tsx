import type { ReactNode } from "react";
import Link from "next/link";
import type { MarketplaceShift } from "@/lib/dashboard/marketplace";
import { shiftCategory } from "@/lib/shifts/category";
import { money, moneyExact } from "@/components/app/ui";
import { SaveShiftHeart } from "@/components/app/SaveShiftHeart";
import { WebOnly } from "@/components/app/WebOnly";
import { cleanBranchLabel } from "@/lib/shifts/place-label";
import { FREELANCER_DICTS, type FreelancerDict } from "@/lib/i18n/freelancer";

// ---------------------------------------------------------------------------
// Shift card — YoungOnes-style: photo header with the category + a save heart,
// then company · title · when/where, badges and the pay line.
// Presentational; `action` / `footerOverride` drive the apply control.
// ---------------------------------------------------------------------------

function whenLabel(start: Date, end: Date, t: FreelancerDict): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = `${t.date.wd[s.getDay()]} ${s.getDate()} ${t.date.mon[s.getMonth()]}.`;
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${day} · ${hm(s)}–${hm(e)}`;
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
  t = FREELANCER_DICTS.nl,
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
  /** freelancer-app dictionary; Dutch by default (server pages pass getFreelancerDict()) */
  t?: FreelancerDict;
}) {
  const cat = shiftCategory(shift.title, shift.skill);
  const c = t.card;
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
        {/* Decorative duplicate of the title link below — hidden from AT so the
            card exposes exactly one meaningful link. */}
        <Link href={href} className="block h-full w-full" aria-hidden="true" tabIndex={-1}>
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
          {t.cat[cat.key]}
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
        <span className="num absolute bottom-3 right-3 rounded-lg bg-money-bright px-2 py-1 text-sm font-bold text-ink shadow-sm">
          {moneyExact(shift.hourlyRateCents)}{c.perHourShort}
        </span>
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col p-4">
        <Link href={href} className="block">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-600">
            <span className="truncate">{cleanBranchLabel(shift.branch)}</span>
            {shift.companyRating && (
              <span className="flex flex-shrink-0 items-center gap-0.5 rounded-full bg-money-soft px-1.5 py-0.5 text-[11px] font-bold text-money-ink" title={`${shift.companyRating.count}`}>
                ★ {shift.companyRating.average.toFixed(1).replace(".", ",")}
                <span className="font-medium text-money-ink/70">({shift.companyRating.count})</span>
              </span>
            )}
          </p>
          <p className="mt-0.5 font-display text-base font-bold leading-snug text-ink">{shift.title}</p>
        </Link>

        <p className="mt-2 text-xs text-neutralx-500">
          {whenLabel(shift.startsAt, shift.endsAt, t)}
          {" · "}
          {shift.city}
          {shift.travel ? ` · ${shift.travel.distanceKm} km` : ""}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {special && (
            <span className="rounded border border-crit/30 px-1.5 py-0.5 text-[11px] font-semibold text-crit">
              {c.specialForYou}
            </span>
          )}
          {shift.viaUitzendbureau ? (
            <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
              {c.viaAgency}
            </span>
          ) : (
            <span className="rounded border border-brand-500/40 px-1.5 py-0.5 text-[11px] font-semibold text-brand-600">
              {c.freelance}
            </span>
          )}
          {idReminder && (
            <span className="rounded border border-trust/40 bg-trust-soft px-1.5 py-0.5 text-[11px] font-semibold text-trust-ink">
              {c.bringId}
            </span>
          )}
          {shift.series && shift.series.total > 1 && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
              {c.plusDays(shift.series.total)}
            </span>
          )}
          {shift.myOffer && (
            <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn">
              {shift.myOffer.proposedRateCents === shift.hourlyRateCents
                ? c.responseSent
                : c.counterOffer(moneyExact(shift.myOffer.proposedRateCents))}{" "}
              · {c.offer[shift.myOffer.status] ?? shift.myOffer.status}
            </span>
          )}
          {shift.replacementNote && !ribbon && (
            <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-500">{shift.replacementNote}</span>
          )}
        </div>

        {shift.match?.belowDesiredRate && (
          <p className="mt-2 text-[11px] font-medium text-warn">{c.belowRate}</p>
        )}
        {shift.workedHereBefore > 0 && (
          <p className="mt-1 text-[11px] text-neutralx-400">{c.workedHere(shift.workedHereBefore)}</p>
        )}
        {shift.fastPay && (
          <WebOnly>
            <p className="mt-1 text-[11px] font-semibold text-brand-600">{c.fastPay}</p>
          </WebOnly>
        )}

        <div className="mt-3 flex items-end justify-between border-t border-hair pt-3">
          <div>
            <p className="num font-display text-lg font-bold text-ink">{moneyExact(shift.hourlyRateCents)} {c.perHour}</p>
            {!compact && <p className="text-[11px] text-neutralx-400">{c.earn(money(shift.grossCents))}</p>}
          </div>
          <span className="num rounded-lg bg-paper-soft px-2 py-1 text-xs font-semibold text-neutralx-600">
            {c.hours(shift.hours)}
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
