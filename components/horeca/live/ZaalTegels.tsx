"use client";

import { STAAT_LABEL, type TafelLive } from "@/lib/horeca/zaal";
import { euro } from "@/lib/horeca/weergave";
import { OPROEP_TEKST } from "@/components/horeca/live/teksten";
import { LABEL_DONKER, LABEL_LICHT, TEGEL_DONKER, TEGEL_LICHT, minTekst } from "@/components/horeca/live/stijl";

// De zaal in tegels: per tafel de status in kleur én tekst, met wat er speelt
// (wachttijd, klaar om te serveren, open bedrag, reservering, oproep). Licht in
// het beheer, donker op de schermen. Met onKies wordt elke tegel een knop.

function Regel({ t, donker }: { t: TafelLive; donker: boolean }) {
  const zacht = donker ? "text-[#B8C4BD]" : "text-neutralx-600";
  if (t.staat === "serveren") return <span className={zacht}>{t.serveren} klaar om weg te brengen</span>;
  if (t.staat === "wacht" || t.staat === "bezet") {
    if (t.openBestellingen) return <span className={zacht}>{t.openBestellingen === 1 ? "1 bestelling" : `${t.openBestellingen} bestellingen`} · wacht {minTekst(t.wachtMin)}</span>;
    if (t.reservering) return <span className={zacht}>{t.reservering.naam} · {t.reservering.personen} p.</span>;
    return <span className={zacht}>Aan tafel</span>;
  }
  if (t.staat === "rekening") return <span className={zacht}>{euro(t.openCent)} open</span>;
  if (t.staat === "gereserveerd" && t.reservering) {
    return (
      <span className={zacht}>
        {t.reservering.tijd} · {t.reservering.naam} · {t.reservering.personen} p.
      </span>
    );
  }
  return <span className={zacht}>{t.plaatsen} plaatsen</span>;
}

export function ZaalTegels({ zaal, donker = false, onKies, groot = false, label = "Tafels" }: { zaal: readonly TafelLive[]; donker?: boolean; onKies?: (t: TafelLive) => void; groot?: boolean; label?: string }) {
  if (!zaal.length) {
    return <p className={`text-sm ${donker ? "text-[#9BA8A1]" : "text-neutralx-500"}`}>Nog geen actieve tafels. Maak ze aan onder Tafels & QR.</p>;
  }
  return (
    <ul aria-label={label} className={`grid gap-2 ${groot ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
      {zaal.map((t) => {
        const inhoud = (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className={`min-w-0 truncate font-display font-bold ${groot ? "text-2xl" : "text-lg"} ${donker ? "text-white" : "text-ink"}`}>{t.naam}</span>
              {t.oproep && (
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${donker ? "bg-[#F59E0B] text-[#1C1003]" : "pill-warn"}`}>
                  <span aria-hidden>🔔 </span>
                  {OPROEP_TEKST[t.oproep]}
                </span>
              )}
            </span>
            <span className={`mt-1 block text-xs font-semibold uppercase tracking-wide ${donker ? LABEL_DONKER[t.staat] : LABEL_LICHT[t.staat]}`}>{STAAT_LABEL[t.staat]}</span>
            <span className="mt-1 block truncate text-sm">
              <Regel t={t} donker={donker} />
            </span>
          </>
        );
        const vorm = `block w-full rounded-xl p-3 text-left ${donker ? TEGEL_DONKER[t.staat] : TEGEL_LICHT[t.staat]}`;
        return (
          <li key={t.id} className="min-w-0">
            {onKies ? (
              <button type="button" onClick={() => onKies(t)} className={`${vorm} transition active:scale-[0.98] ${donker ? "hover:brightness-125" : "hover:shadow-card"}`}>
                {inhoud}
              </button>
            ) : (
              <div className={vorm}>{inhoud}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
