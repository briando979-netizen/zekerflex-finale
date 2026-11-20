"use client";

import { useState } from "react";
import { CandidateCardButton } from "@/components/app/CandidateCardButton";
import { ChatUserButton } from "@/components/app/ChatUserButton";
import { ReservebankKnop } from "@/components/app/ReservebankKnoppen";
import { useI18n } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { filterReacties, filtersActief, KLUSSEN_KEUZES, LEGE_FILTERS, OPKOMST_KEUZES, STERREN_KEUZES, type ReactieFilters } from "@/lib/werkgever/reactie-filters";

// ---------------------------------------------------------------------------
// De open reacties op een klus van het bedrijf (app/werkgever/diensten/[shiftId]), met filters zoals YoungOnes ze heeft
// (favoriet, minimale opkomst, minimaal klussen gedaan, minimale beoordeling, alleen geplaatst tarief). De rijen zelf
// zijn dezelfde als voorheen: foto + naam opent de profielkaart, rechts de knoppen. Filteren gebeurt in de browser;
// de lijst komt van de server (lib/dashboard/employer-shift.ts) en wordt na elke actie opnieuw opgehaald.
// ---------------------------------------------------------------------------

export interface ReactieRij {
  id: string;
  userId: string;
  naam: string;
  avatarUrl: string | null;
  proposedRateCents: number;
  listedRateCents: number;
  note: string;
  busyElsewhere: boolean;
  attendancePct: number | null;
  shiftsCompleted: number;
  cancellations: number;
  reviewAverage: number;
  reviewCount: number;
  favoriet: boolean;
  /** de regel boven Afwijzen / Accepteren in de profielkaart (reactieRegel op de pagina) */
  regel: string;
}

const euro = (c: number, nl: boolean) => `€ ${nl ? (c / 100).toFixed(2).replace(".", ",") : (c / 100).toFixed(2)}`;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function ReactieLijst({
  shiftId,
  shiftTitle,
  reacties,
  bankBewerkbaar,
  laatstePlek,
}: {
  shiftId: string;
  shiftTitle: string;
  reacties: ReactieRij[];
  /** het bedrijf zelf mag reacties op de reservebank zetten */
  bankBewerkbaar: boolean;
  /** nog één plek open: bij accepteren eerst reserves kiezen uit de andere reacties */
  laatstePlek: boolean;
}) {
  const { locale, t } = useI18n();
  const d = t.shiftDetail;
  const nl = locale === "nl";
  const [f, setF] = useState<ReactieFilters>(LEGE_FILTERS);
  const [open, setOpen] = useState(false);
  const { zichtbaar, verborgen } = filterReacties(reacties, f);
  const actief = filtersActief(f);
  const zet = (p: Partial<ReactieFilters>) => setF((v) => ({ ...v, ...p }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`rounded-full border px-3 py-1 text-xs font-semibold ${actief ? "border-ink bg-ink text-white" : "border-hairstrong bg-white text-ink"}`}>
          {d.filterKop}{actief ? ` (${actief})` : ""}
        </button>
        {actief > 0 && (
          <button type="button" onClick={() => setF(LEGE_FILTERS)} className="text-xs font-medium text-brand-600 hover:underline">
            {d.filterReset}
          </button>
        )}
        {verborgen > 0 && (
          <span className="text-xs text-neutralx-500">{verborgen === 1 ? d.filterVerborgenEen : fmt(d.filterVerborgen, { n: verborgen })}</span>
        )}
      </div>
      {open && (
        <div className="grid gap-3 border-b border-hair bg-paper-soft px-5 py-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.favoriet} onChange={(e) => zet({ favoriet: e.target.checked })} />
            <span>{d.filterFavoriet}</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.geenTegenbod} onChange={(e) => zet({ geenTegenbod: e.target.checked })} />
            <span>{d.filterTegenbod}</span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{d.filterOpkomst}</span>
            <select value={f.minOpkomst} onChange={(e) => zet({ minOpkomst: Number(e.target.value) })} className="rounded-lg border border-hair bg-white px-2 py-1">
              {OPKOMST_KEUZES.map((n) => (
                <option key={n} value={n}>{n === 0 ? d.filterAlle : `${n}%`}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{d.filterKlussen}</span>
            <select value={f.minKlussen} onChange={(e) => zet({ minKlussen: Number(e.target.value) })} className="rounded-lg border border-hair bg-white px-2 py-1">
              {KLUSSEN_KEUZES.map((n) => (
                <option key={n} value={n}>{n === 0 ? d.filterAlle : fmt(d.filterKlussenWaarde, { n })}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>{d.filterSterren}</span>
            <select value={f.minSterren} onChange={(e) => zet({ minSterren: Number(e.target.value) })} className="rounded-lg border border-hair bg-white px-2 py-1">
              {STERREN_KEUZES.map((n) => (
                <option key={n} value={n}>{n === 0 ? d.filterAlle : fmt(d.filterSterrenWaarde, { n: nl ? String(n).replace(".", ",") : String(n) })}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <ul className="divide-y divide-hair">
        {zichtbaar.map((o) => {
          const beslissing = { offerId: o.id, regel: o.regel };
          // bij de laatste plek: de andere open reacties als mogelijke reserves (hoogstens 3 kiezen)
          const reserveKeuze = laatstePlek && bankBewerkbaar ? reacties.filter((x) => x.id !== o.id).map((x) => ({ offerId: x.id, naam: x.naam })) : [];
          return (
            <li key={o.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <CandidateCardButton userId={o.userId} shiftId={shiftId} name={o.naam} beslissing={beslissing} reserveKeuze={reserveKeuze}>
                  {o.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.avatarUrl} alt="" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
                      {initials(o.naam)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-ink group-hover:underline">
                      {o.naam}
                      {o.favoriet && <span aria-hidden className="text-money-ink">♥</span>}
                    </span>
                    <span className="block text-xs text-neutralx-500">
                      <span className="num font-semibold text-brand-600">{euro(o.proposedRateCents, nl)}/u</span>
                      {o.proposedRateCents !== o.listedRateCents && <span className="ml-1.5 text-neutralx-400 line-through">{euro(o.listedRateCents, nl)}/u</span>}
                      <span> · {o.attendancePct !== null ? `✓ ${fmt(d.opkomst, { n: o.attendancePct })}` : d.opkomstNieuw}</span>
                      <span> · {o.shiftsCompleted === 1 ? d.klusGedaan : fmt(d.klussenGedaan, { n: o.shiftsCompleted })}</span>
                      {o.cancellations > 0 && <span className="text-warn"> · {fmt(d.keerAfgezegd, { n: o.cancellations })}</span>}
                      {o.reviewCount > 0 && <span> · ★ {nl ? o.reviewAverage.toFixed(1).replace(".", ",") : o.reviewAverage.toFixed(1)} ({o.reviewCount})</span>}
                    </span>
                  </span>
                </CandidateCardButton>
                {(o.note || o.busyElsewhere) && (
                  <div className="mt-1.5 space-y-1 pl-[3.25rem] text-xs text-neutralx-500">
                    {o.note && <p className="break-words">&ldquo;{o.note}&rdquo;</p>}
                    {o.busyElsewhere && (
                      <p>
                        <span className="font-semibold text-warn">⏰ {d.busyElsewhere}.</span> {d.busyElsewhereHint}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2 pl-[3.25rem] sm:justify-end sm:pl-0">
                <CandidateCardButton userId={o.userId} shiftId={shiftId} name={o.naam} beslissing={beslissing} reserveKeuze={reserveKeuze} />
                <ChatUserButton toUserId={o.userId} contextKey={`shift:${shiftId}`} subject={shiftTitle} label={d.message} />
                {bankBewerkbaar && <ReservebankKnop offerId={o.id} naam={o.naam} op={false} />}
                <CandidateCardButton userId={o.userId} shiftId={shiftId} name={o.naam} beslissing={beslissing} reserveKeuze={reserveKeuze} knoppen="beslissen" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
