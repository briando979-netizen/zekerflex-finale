"use client";

import type { BeheerWeergave } from "@/lib/rijschool/weergave";
import { euro } from "@/lib/payroll/format";
import { datumKort, METHODE_LABEL } from "@/lib/rijschool/format";

// Alle betalingen van de rijschool, nieuwste eerst. Registreren doe je bij de
// leerling (of de instructeur in de auto).

const STATUS: Record<string, { label: string; stijl: string }> = {
  OPEN: { label: "Open", stijl: "pill-warn" },
  BETAALD: { label: "Betaald", stijl: "pill-ok" },
  MISLUKT: { label: "Mislukt", stijl: "pill-crit" },
  VERVALLEN: { label: "Vervallen", stijl: "pill-neutral" },
};

export function BetalingenTab({ data, openLeerling }: { data: BeheerWeergave; openLeerling: (id: string) => void }) {
  const betaald = data.betalingen.filter((b) => b.status === "BETAALD");
  const totaal = betaald.reduce((s, b) => s + b.bedragCent, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutralx-600">
        {betaald.length} betalingen, samen <strong className="text-ink">{euro(totaal)}</strong> (laatste 200). Een betaling registreer je bij de leerling; de instructeur kan pin of
        contant ook in de auto vastleggen.
      </p>
      {data.betalingen.length === 0 ? (
        <p className="card p-5 text-sm text-neutralx-600">Nog geen betalingen.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutralx-500">
              <tr>
                <th className="p-3 font-medium">Datum</th>
                <th className="p-3 font-medium">Leerling</th>
                <th className="p-3 font-medium">Omschrijving</th>
                <th className="p-3 font-medium">Via</th>
                <th className="p-3 text-right font-medium">Bedrag</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {data.betalingen.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap p-3">{datumKort(b.betaaldOm ?? b.aangemaakt)}</td>
                  <td className="p-3">
                    <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => openLeerling(b.leerlingId)}>
                      {b.leerlingNaam}
                    </button>
                  </td>
                  <td className="p-3">{b.omschrijving}</td>
                  <td className="p-3">{b.methode ? METHODE_LABEL[b.methode] : "–"}</td>
                  <td className="num p-3 text-right font-semibold">{euro(b.bedragCent)}</td>
                  <td className="p-3">
                    <span className={STATUS[b.status]?.stijl ?? "pill-neutral"}>{STATUS[b.status]?.label ?? b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
