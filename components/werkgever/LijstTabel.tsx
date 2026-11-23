import type { ReactNode } from "react";
import { KAART, TABEL_CEL, TABEL_KOP, kl } from "@/components/werkgever/bouwstenen";

// Een lijst als eenvoudige tabel in een witte kaart (23 nov 2026, zoals Locaties en Beheerders bij YoungOnes): een kopregel,
// de rijen, en rechts per rij een plek voor de acties. Een lege lijst is één regel tekst in dezelfde kaart. Op een telefoon
// staan de cellen van een rij onder elkaar (de kopregel valt weg en elke cel noemt zijn kolom), zodat er niets zijwaarts
// schuift. Geen hooks: de cellen en acties zijn ReactNodes die de pagina zelf maakt.

export interface LijstKolom {
  kop: string;
  /** getallen en bedragen rechts uitlijnen (alleen op een laptop) */
  rechts?: boolean | undefined;
}

export interface LijstRij {
  id: string;
  /** één cel per kolom, in dezelfde volgorde */
  cellen: ReactNode[];
  /** de knoppen van deze rij (wijzigen, verwijderen) */
  actie?: ReactNode;
}

export function LijstTabel({
  kolommen,
  rijen,
  leeg,
  label,
  actieKop,
}: {
  kolommen: LijstKolom[];
  rijen: LijstRij[];
  /** de ene regel die er staat als de lijst leeg is */
  leeg: string;
  /** de naam van de lijst voor een schermlezer */
  label: string;
  /** de naam van de kolom met knoppen voor een schermlezer; zonder is er geen kolom voor acties */
  actieKop?: string | undefined;
}) {
  if (rijen.length === 0) {
    return (
      <div className={kl(KAART, "px-5 py-6 sm:px-6")}>
        <p className="text-sm text-neutralx-600">{leeg}</p>
      </div>
    );
  }
  const heeftActie = Boolean(actieKop);
  return (
    <div className={kl(KAART, "overflow-hidden")}>
      <table aria-label={label} className="w-full text-left text-sm">
        <thead className="hidden border-b border-hair sm:table-header-group">
          <tr>
            {kolommen.map((k) => (
              <th key={k.kop} scope="col" className={kl(TABEL_KOP, k.rechts && "text-right")}>
                {k.kop}
              </th>
            ))}
            {heeftActie ? (
              <th scope="col" className={TABEL_KOP}>
                <span className="sr-only">{actieKop}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-hair">
          {rijen.map((r) => (
            <tr key={r.id} className="block px-5 py-4 sm:table-row sm:p-0">
              {r.cellen.map((cel, i) => (
                <td key={i} className={kl(TABEL_CEL, i === 0 ? "font-semibold text-ink" : "mt-1 text-neutralx-600 sm:mt-0", kolommen[i]?.rechts && "sm:text-right")}>
                  {i > 0 && kolommen[i] ? <span className="mr-1.5 text-xs text-neutralx-500 sm:hidden">{kolommen[i]?.kop}:</span> : null}
                  {cel}
                </td>
              ))}
              {heeftActie ? <td className="block pt-3 sm:table-cell sm:whitespace-nowrap sm:px-6 sm:py-3 sm:text-right">{r.actie}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
