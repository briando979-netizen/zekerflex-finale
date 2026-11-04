"use client";

import { faseVan } from "@/lib/horeca/fasen";
import type { SchermBestelling } from "@/components/horeca/live/types";
import { minTekst } from "@/components/horeca/live/stijl";
import { ding } from "@/components/horeca/scherm/apparaat";
import { Knop, Leeg, minSinds, useNieuw, type SchermProps } from "@/components/horeca/scherm/ui";

// ---------------------------------------------------------------------------
// De uitgifte (de pass): alles wat klaarstaat, per bestelling, oudste eerst,
// met de tafel groot in beeld. Wat nog in de maak is staat er grijs bij, zodat
// je weet of je moet wachten. "Geserveerd" brengt alleen weg wat klaar is.
// ---------------------------------------------------------------------------

const eersteKlaar = (b: SchermBestelling) =>
  b.regels
    .filter((r) => faseVan(r) === "klaar")
    .map((r) => r.klaarOp ?? b.createdAt)
    .sort()[0] ?? b.createdAt;

export function UitgifteScherm({ data, doe, nu, geluid }: SchermProps) {
  const klaar = (data.bestellingen ?? []).filter((b) => b.status !== "GEANNULEERD" && b.regels.some((r) => faseVan(r) === "klaar")).sort((a, b) => eersteKlaar(a).localeCompare(eersteKlaar(b)));

  useNieuw(
    klaar.map((b) => `${b.id}:${b.regels.filter((r) => faseVan(r) === "klaar").length}`),
    () => {
      if (geluid) ding(true);
    },
  );

  return (
    <div className="p-3 sm:p-4">
      {klaar.length === 0 ? (
        <Leeg>Niets klaar om weg te brengen.</Leeg>
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {klaar.map((b) => {
            const wacht = minSinds(eersteKlaar(b), nu);
            const nog = b.regels.filter((r) => faseVan(r) === "nieuw" || faseVan(r) === "gestart");
            return (
              <li key={b.id} className={`flex flex-col overflow-hidden rounded-2xl bg-[#141A17] ring-2 ${wacht >= 5 ? "ring-[#F59E0B]" : "ring-[#22C55E]"}`}>
                <div className="flex items-baseline justify-between gap-2 bg-[#06311A] px-4 py-3">
                  <span className="min-w-0 truncate font-display text-3xl font-bold text-white">{b.tafelNaam ?? "Balie"}</span>
                  <span className="text-base font-semibold text-[#86EFAC]">#{b.nummer}</span>
                </div>
                <p className={`px-4 pt-2 text-sm font-semibold ${wacht >= 5 ? "text-[#FCD34D]" : "text-[#9BA8A1]"}`}>Staat {minTekst(wacht)} klaar</p>
                <ul className="flex-1 space-y-1 px-4 py-2">
                  {b.regels
                    .filter((r) => faseVan(r) === "klaar")
                    .map((r, i) => (
                      <li key={i} className="text-xl text-white">
                        <strong className="mr-1 tabular-nums">{r.aantal}×</strong>
                        {r.naam}
                        <span className="ml-2 text-xs font-semibold uppercase text-[#9BA8A1]">{r.station}</span>
                        {r.keuze && <span className="block text-base font-bold text-white">↳ {r.keuze}</span>}
                        {r.opmerking && <span className="block text-base text-[#FDE68A]">{r.opmerking}</span>}
                      </li>
                    ))}
                </ul>
                {nog.length > 0 && <p className="px-4 pb-2 text-sm text-[#9BA8A1]">Nog in de maak: {nog.map((r) => `${r.aantal}× ${r.naam}`).join(", ")}</p>}
                <div className="p-3 pt-0">
                  <Knop
                    groot
                    soort="doen"
                    className="w-full"
                    onClick={() => void doe({ actie: "serveer", id: b.id }, `${b.tafelNaam ?? `#${b.nummer}`} geserveerd.`, () => void doe({ actie: "serveer", id: b.id, terug: true }))}
                  >
                    Geserveerd<span className="sr-only"> ({b.tafelNaam ?? `bestelling ${b.nummer}`})</span>
                  </Knop>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
