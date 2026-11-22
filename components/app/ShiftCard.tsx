import type { ReactNode } from "react";
import Link from "next/link";
import type { MarketplaceShift } from "@/lib/dashboard/marketplace";
import { shiftCategory } from "@/lib/shifts/category";
import { money, moneyExact } from "@/components/app/ui";
import { SaveShiftHeart } from "@/components/app/SaveShiftHeart";
import { FREELANCER_DICTS, type FreelancerDict } from "@/lib/i18n/freelancer";
import { amsterdamClock, amsterdamParts } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Kluskaart — de kaart van de app van YoungOnes (21 nov 2026, eigenaar: "alles in de stijl van YoungOnes"):
// foto bovenaan met alleen het hartje, bedrijfsnaam in turquoise, titel, "dag | tijd · uren | plaats", en in de
// voet links de chips (Speciaal voor jou, Freelance/Uitzend, Invalklus, +N dagen, Neem je ID mee, favoriet) en
// rechts het tarief groot met "Verdien ~" eronder. Wat op de kluspagina hoort (beoordeling van het bedrijf,
// eerder gewerkt, volgen, snelle betaling) staat niet meer op de kaart.
// Presentatie-onderdeel; `action` / `footerOverride` sturen de voet.
// ---------------------------------------------------------------------------

// Dutch wall-clock times, so the UTC server and any phone render the same text. Dag en tijden apart, zodat de kaart ze
// met een streepje ertussen kan tonen ("Vr 20 nov. | 23:55–04:30 | Nijmegen", zoals de kaart van YoungOnes, 20 nov).
function whenParts(start: Date, end: Date, t: FreelancerDict): [string, string] {
  const s = amsterdamParts(new Date(start));
  const day = `${t.date.wd[s.weekday]} ${s.day} ${t.date.mon[s.month - 1]}.`;
  return [day, `${amsterdamClock(start)}–${amsterdamClock(end)}`];
}

export type KlusChipTone = "teal" | "neutral" | "red" | "salmon" | "amber" | "blue" | "violet";

// Vaste kleuren, in licht en donker gelijk (de chips van YoungOnes: lichte vulling, donkere tekst, gekleurde rand).
const CHIP: Record<KlusChipTone, string> = {
  teal: "border-[#14D9C9] bg-[#DDF9F6] text-[#0B1238]",
  neutral: "border-[#D9DEE7] bg-[#F7F8FA] text-[#0B1238]",
  red: "border-[#E5484D] bg-[#FDE2E3] text-[#7F1D1D]",
  salmon: "border-[#F28C6A] bg-[#FDE4DB] text-[#0B1238]",
  amber: "border-[#F5C451] bg-[#FDF3D7] text-[#0B1238]",
  blue: "border-[#60A5FA] bg-[#DBEAFE] text-[#0B1238]",
  // uitzenden: lila, zoals de chip "Uitzenden" bij YoungOnes en de kolom in het vergelijkblok op Ontdekken (21 nov)
  violet: "border-[#A78BFA] bg-[#EDE9FE] text-[#0B1238]",
};

/** Een chip in de voet van de kluskaart (ook op Uren invullen voor de status van het urenbriefje). */
export function KlusChip({ tone = "neutral", title, children }: { tone?: KlusChipTone; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${CHIP[tone]}`}>
      {children}
    </span>
  );
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
  // "Speciaal voor jou" nooit op een testklus: daar zit geen werk achter (22 nov 2026, gebruikersonderzoek punt 12)
  const special = !shift.testklus && score !== null && score >= 78;
  const ribbonBg =
    ribbon?.tone === "amber"
      ? "rgba(180,83,9,.92)"
      : ribbon?.tone === "crit"
        ? "rgba(185,28,28,.92)"
        : ribbon?.tone === "neutral"
          ? "rgba(12,14,18,.75)"
          : "rgba(14,92,74,.92)";
  const [dag, tijden] = whenParts(shift.startsAt, shift.endsAt, t);

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift ${
        dim ? "opacity-70" : ""
      }`}
    >
      {/* foto: alleen het hartje erop (en een lint voor vervanging/dubbel ingepland) */}
      <div className="relative aspect-[16/9] overflow-hidden">
        {/* Decorative duplicate of the title link below — hidden from AT so the
            card exposes exactly one meaningful link. */}
        <Link href={href} className="block h-full w-full" aria-hidden="true" tabIndex={-1}>
          {shift.useLogo && shift.companyLogoUrl ? (
            // the company chose its own logo: on fixed white (logos are made for a light background, also in dark mode)
            <span className="flex h-full w-full items-center justify-center bg-[#ffffff] px-10 py-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shift.companyLogoUrl} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105" />
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cat.photo}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
        </Link>
        <div className="absolute right-3 top-3">
          <SaveShiftHeart shiftId={shift.id} labels={{ save: c.save, unsave: c.unsave }} />
        </div>
        {ribbon && (
          <span
            className="absolute left-3 bottom-3 rounded-full px-2 py-1 text-[11px] font-bold text-white backdrop-blur"
            style={{ background: ribbonBg }}
          >
            {ribbon.label}
          </span>
        )}
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col p-4">
        <Link href={href} className="block">
          <p className="flex items-center gap-1.5 text-sm font-bold text-brand-600">
            {shift.companyLogoUrl && !shift.useLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shift.companyLogoUrl} alt="" loading="lazy" decoding="async" className="h-5 w-5 flex-shrink-0 rounded-full bg-[#ffffff] object-contain ring-1 ring-hair" />
            )}
            {/* de bedrijfsnaam, niet de vestiging ("Eenmalige locatie — adres"); waar het is, staat eronder */}
            <span className="truncate">{shift.company}</span>
          </p>
          <p className="mt-0.5 font-display text-lg font-bold leading-snug text-ink">{shift.title}</p>
        </Link>

        {/* dag | tijden · uren | plaats, met streepjes ertussen zoals op de kaart van YoungOnes */}
        <p className="mt-2 flex flex-wrap items-center text-xs text-neutralx-500">
          {[dag, `${tijden} · ${shift.hours} ${t.hoursPage.hShort}`, `${shift.city}${shift.travel ? ` · ${shift.travel.distanceKm} km` : ""}`].map((deel, i) => (
            <span key={i} className={i === 0 ? "" : "border-l border-hairstrong pl-2 ml-2"}>{deel}</span>
          ))}
        </p>

        {/* extra informatie staat alleen bij de klus zelf, niet op de kaart (10 nov, eigenaar) */}

        {/* niet bij uitzenden: daar geldt een vast uurloon, geen eigen tarief (21 nov) */}
        {shift.match?.belowDesiredRate && !shift.viaUitzendbureau && !shift.uitzendPartner && (
          <p className="mt-2 text-[11px] font-medium text-warn">{c.belowRate}</p>
        )}
        {shift.alert && <p className="mt-1 truncate text-[11px] font-semibold text-brand-700">🔔 {shift.alert}</p>}
        {shift.busy && <p className="mt-1 text-[11px] font-semibold text-neutralx-600">⏰ {c.busy}</p>}

        {/* de voet: chips links, het tarief groot rechts met "Verdien ~" eronder */}
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-dashed border-hairstrong pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {special && <KlusChip tone="red">{c.specialForYou}</KlusChip>}
            {shift.viaUitzendbureau || shift.uitzendPartner ? <KlusChip tone="violet">{t.market.uitzendLabel}</KlusChip> : <KlusChip tone="teal">{c.freelance}</KlusChip>}
            {shift.isReplacement && <KlusChip tone="salmon">{c.invalklus}</KlusChip>}
            {shift.series && shift.series.total > 1 && <KlusChip>{c.plusDays(shift.series.total)}</KlusChip>}
            {idReminder && <KlusChip>{c.bringId}</KlusChip>}
            {/* het bedrijf heeft jou als favoriet (naar YoungOnes' "Je bent hier een favoriet · HOGE KANS") */}
            {shift.favorietBijBedrijf && <KlusChip tone="teal">⭐ {c.favorietHier}</KlusChip>}
            {shift.myOffer && (
              <KlusChip tone={shift.myOffer.reserve ? "neutral" : "amber"}>
                {shift.myOffer.proposedRateCents === shift.hourlyRateCents
                  ? c.responseSent
                  : c.counterOffer(moneyExact(shift.myOffer.proposedRateCents))}{" "}
                · {(shift.myOffer.reserve ? c.offer.reserve : c.offer[shift.myOffer.status]) ?? shift.myOffer.status}
              </KlusChip>
            )}
            {shift.replacementNote && !ribbon && <KlusChip>{shift.replacementNote}</KlusChip>}
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="num font-display text-lg font-bold text-ink">{moneyExact(shift.hourlyRateCents)}</p>
            <p className="text-[11px] text-neutralx-400">{compact ? c.perHour : c.earn(money(shift.grossCents))}</p>
          </div>
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
