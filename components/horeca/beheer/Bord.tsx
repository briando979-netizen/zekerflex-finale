"use client";

import type { ReactNode } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { kolomVan, momentVan, sorteer, toonVan, type BordBestelling, type BordKolom } from "@/lib/horeca/bord";
import { kmTekst, teBetalenCent, tijdTekst } from "@/lib/horeca/bezorgen";
import { euro } from "@/lib/horeca/weergave";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { TOON_STIJL } from "@/components/horeca/beheer/bord-stijl";

// Het bestellingenbord (horeca, 15 nov 2026): elke bestelling als tegel in Nieuw, Bezig of Klaar, met de tijd groot
// voorop (ZSM of 18:30) en de kleur van wat er moet gebeuren (components/horeca/beheer/bord-stijl.ts). Een tik op een
// tegel opent de bestelling met alle knoppen (`detail`, uit BestellingenTab). Tekst in lib/i18n (horecaBord).

export interface BordItem extends BordBestelling {
  id: string;
  nummer: number;
  naam: string;
  tafelNaam: string | null;
  adres: string;
  plaats: string;
  afstandM: number | null;
  totaalCent: number;
  kortingCent: number;
  bezorgkostenCent: number;
  betaald: boolean;
}

const KOLOMMEN: BordKolom[] = ["nieuw", "bezig", "klaar"];
const MAX_KLAAR = 12;

export function Bord({ lijst, nu, gekozen, kies, detail }: { lijst: BordItem[]; nu: number; gekozen: string | null; kies: (id: string | null) => void; detail: ReactNode }) {
  const t = useT().horecaBord;
  const kop: Record<BordKolom, string> = { nieuw: t.nieuw, bezig: t.bezig, klaar: t.klaar };
  return (
    <div className="space-y-4">
      {KOLOMMEN.map((k) => {
        const alle = sorteer(lijst.filter((b) => kolomVan(b) === k));
        const kolom = k === "klaar" ? alle.reverse().slice(0, MAX_KLAAR) : alle;
        return (
          <section key={k} aria-labelledby={`bord-${k}`} className="rounded-2xl bg-neutralx-50 p-3">
            <h2 id={`bord-${k}`} className="px-1 font-display text-lg font-bold text-ink">
              {kop[k]} <span className="text-sm font-semibold text-neutralx-500">({alle.length})</span>
            </h2>
            {kolom.length === 0 ? (
              <p className="mt-1 px-1 text-sm text-neutralx-500">{t.leeg}</p>
            ) : (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {kolom.map((b) => (
                  <li key={b.id}>
                    <Tegel b={b} nu={nu} gekozen={gekozen === b.id} kies={() => kies(gekozen === b.id ? null : b.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {detail && (
        <section aria-label={t.detail} className="relative">
          <button type="button" className="btn-ghost absolute right-3 top-3 z-10" onClick={() => kies(null)}>
            {t.sluiten}
          </button>
          {detail}
        </section>
      )}
    </div>
  );
}

function Tegel({ b, nu, gekozen, kies }: { b: BordItem; nu: number; gekozen: boolean; kies: () => void }) {
  const t = useT().horecaBord;
  const levering = b.soort === "afhalen" || b.soort === "bezorgen";
  const toon = toonVan(b, nu);
  const soort = b.soort === "bezorgen" ? t.bezorgen : b.soort === "afhalen" ? t.afhalen : (b.tafelNaam ?? t.zonderTafel);
  // tafel: wanneer besteld; afhalen en bezorgen: de toegezegde (of gevraagde) tijd, ZSM zonder tijd
  const tijd = levering ? tijdTekst(momentVan(b)) : amsterdamClock(b.createdAt);
  return (
    <button type="button" onClick={kies} aria-pressed={gekozen} className={`flex w-full items-stretch gap-3 rounded-xl bg-white p-2 text-left ring-1 ring-hair ${gekozen ? "outline outline-2 outline-offset-2 outline-ink" : ""}`}>
      <span className={`flex w-20 shrink-0 flex-col items-center justify-center rounded-lg px-1 py-2 ${TOON_STIJL[toon]}`}>
        <span className="font-display text-xl font-bold leading-none">{tijd}</span>
        {toon === "laat" && <span className="mt-1 text-[11px] font-semibold">{t.teLaat}</span>}
        {!levering && <span className="mt-1 text-[11px]">{t.besteld}</span>}
      </span>
      <span className="min-w-0 flex-1 text-sm text-ink">
        <span className="flex items-baseline justify-between gap-2">
          <strong className="truncate">
            #{b.nummer} · {soort}
          </strong>
          <span className="shrink-0 font-semibold">{euro(teBetalenCent(b))}</span>
        </span>
        {levering && <span className="block truncate">{b.naam}</span>}
        {b.soort === "bezorgen" && (
          <span className="block truncate text-neutralx-600">
            {b.adres}, {b.plaats}
            {typeof b.afstandM === "number" && ` · ${kmTekst(b.afstandM)}`}
          </span>
        )}
        <span className="block text-xs text-neutralx-600">
          {b.status === "GEANNULEERD" ? t.geannuleerd : b.betaald ? t.betaald : t.onbetaald}
        </span>
      </span>
    </button>
  );
}
