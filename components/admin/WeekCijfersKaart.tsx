import { Panel } from "@/components/admin/kit";
import { count, euro } from "@/lib/admin/format";
import { richting, type Eenheid, type WeekCijfers } from "@/lib/admin/weekcijfers-kern";

// "De week in vijf getallen" op het beheerstartscherm (15 nov 2026): bezoekers, aanmeldingen, geplaatste klussen,
// gewerkte uren en betaald, per week, de laatste acht weken, alles zonder test (lib/admin/weekcijfers.ts). Groen omhoog,
// rood omlaag (lib/admin/kleuren: één kleur, één betekenis); de lopende week is nog niet om en telt niet mee in de pijl.

const waarde = (eenheid: Eenheid, v: number): string => (eenheid === "euro" ? euro(v) : eenheid === "uren" ? count(Math.round(v)) : count(v));
const PIJL = { omhoog: { teken: "↑", kleur: "var(--a-ok)", tekst: "omhoog" }, omlaag: { teken: "↓", kleur: "var(--a-crit)", tekst: "omlaag" }, gelijk: { teken: "=", kleur: "var(--a-mute)", tekst: "gelijk" } } as const;

export function WeekCijfersKaart({ cijfers }: { cijfers: WeekCijfers }) {
  const leeg = cijfers.rijen.every((r) => r.waarden.every((v) => v === 0));
  return (
    <Panel
      title="De week in vijf getallen"
      subtitle="Per week, zonder test- en eigen accounts en zonder testklussen. Bouw alleen wat een van deze getallen omhoog helpt."
      flush
    >
      {leeg ? (
        <p className="px-4 pb-4 text-sm sm:px-5" style={{ color: "var(--a-mute)" }}>
          Nog niets te tellen in de laatste acht weken.
        </p>
      ) : (
        // vegen op een telefoon; `relative` houdt de sr-only-tekst binnen de rij (AGENTS.md)
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">De laatste acht weken, oudste links; de laatste kolom is de lopende week.</caption>
            <thead>
              <tr className="border-y text-left text-[0.6875rem]" style={{ borderColor: "var(--a-border)", color: "var(--a-mute)" }}>
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">Week van</th>
                {cijfers.weken.map((w) => (
                  <th key={w.key} scope="col" className="px-2 py-2 text-right font-medium">
                    {w.lopend ? "Deze week" : w.label}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">
                  <span className="sr-only">Richting ten opzichte van de week ervoor</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cijfers.rijen.map((r) => {
                const pijl = richting(r.waarden);
                const p = pijl ? PIJL[pijl] : null;
                return (
                  <tr key={r.sleutel} className="border-b last:border-b-0" style={{ borderColor: "var(--a-border)" }}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium sm:px-5" style={{ color: "var(--a-text)" }}>
                      {r.label}
                      <span className="block text-[0.6875rem] font-normal" style={{ color: "var(--a-mute)" }}>{r.uitleg}</span>
                    </th>
                    {r.waarden.map((v, i) => (
                      <td key={cijfers.weken[i]?.key ?? i} className="px-2 py-2.5 text-right tabular-nums" style={{ color: v === 0 ? "var(--a-mute)" : "var(--a-text)", fontWeight: cijfers.weken[i]?.lopend ? 600 : 400 }}>
                        {waarde(r.eenheid, v)}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right sm:px-5">
                      {p ? (
                        <span title={`Vorige week ${p.tekst}`} style={{ color: p.kleur }}>
                          <span aria-hidden="true">{p.teken}</span>
                          <span className="sr-only">Vorige week {p.tekst}</span>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
