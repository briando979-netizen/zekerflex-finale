"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cijfers as CijfersData } from "@/lib/voorstel/smileyapp-cijfer-regels";
import { BEHEER_API, KAART, Melding, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// "Cijfers" in het beheer: de laatste 30 dagen als staafjes, de vijf meest
// bekeken pagina's, het aantal demo-aanvragen en hoeveel bezoeken aan de
// demopagina een aanvraag opleverden. Het zijn bezoeken (weergaven), geen
// unieke personen: er wordt niets over een bezoeker bewaard, dus dezelfde
// persoon telt elke keer opnieuw. Staafjes in gewone CSS, zonder bibliotheek.

/** "19 nov" van een dag als JJJJ-MM-DD (een vaste dag, dus zonder tijdzone). */
function dagKort(iso: string): string {
  const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const [, m, d] = iso.split("-").map(Number);
  return `${d ?? ""} ${MAANDEN[(m ?? 1) - 1] ?? ""}`;
}

const getal = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function Cijfers() {
  const [data, setData] = useState<CijfersData | null>(null);
  const [fout, setFout] = useState("");

  const laad = useCallback(async () => {
    try {
      setData((await vraag<{ cijfers: CijfersData }>(`${BEHEER_API}/inhoud?deel=cijfers`)).cijfers);
      setFout("");
    } catch (e) {
      setFout(foutTekst(e, "De cijfers laden lukte niet."));
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  if (!data) return fout ? <Melding fout={fout} /> : <p className="text-sm text-smiley-mute">Laden…</p>;

  const hoogste = Math.max(1, ...data.dagen.map((d) => d.weergaven));
  const topMax = Math.max(1, ...data.paginas.map((p) => p.weergaven));
  const eerste = data.dagen[0]?.dag ?? "";
  const laatste = data.dagen[data.dagen.length - 1]?.dag ?? "";
  const tegels = [
    { label: "Paginaweergaven", waarde: getal(data.weergaven), uitleg: "in de laatste 30 dagen" },
    { label: "Binnenkomsten", waarde: getal(data.binnenkomsten), uitleg: "bezoeken die van buiten de site kwamen" },
    { label: "Demo-aanvragen", waarde: getal(data.aanvragen), uitleg: "in de laatste 30 dagen" },
    {
      label: "Van demopagina naar aanvraag",
      waarde: data.percentage === null ? "–" : `${String(data.percentage).replace(".", ",")}%`,
      uitleg: data.percentage === null ? "de demopagina is in deze periode nog niet bezocht" : `${getal(data.aanvragen)} aanvragen op ${getal(data.demoWeergaven)} bezoeken aan de demopagina`,
    },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm leading-relaxed text-smiley-mute">
        Dit zijn bezoeken, geen unieke personen. De site telt zonder cookies en bewaart niets over een bezoeker: wie twee keer komt, telt twee keer. Zoekmachines en andere robots tellen niet mee, het beheer zelf ook niet.
      </p>
      <Melding fout={fout} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tegels.map((t) => (
          <li key={t.label} className="rounded-3xl bg-white p-5 ring-1 ring-smiley-ink/5">
            <span className="block font-display text-4xl font-bold leading-none text-smiley-ink">{t.waarde}</span>
            <span className="mt-2 block text-sm font-semibold text-smiley-ink">{t.label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-smiley-mute">{t.uitleg}</span>
          </li>
        ))}
      </ul>

      <section aria-labelledby="sm-cijfers-dagen" className={KAART}>
        <h3 id="sm-cijfers-dagen" className="font-display text-xl font-bold text-smiley-ink">
          Paginaweergaven per dag
        </h3>
        <p className="mt-1 text-sm text-smiley-mute">
          {dagKort(eerste)} tot en met {dagKort(laatste)}. Een geel staafje is een dag met een demo-aanvraag.
        </p>
        {data.weergaven === 0 ? (
          <p className="mt-4 text-smiley-mute">Er is in deze periode nog niets geteld.</p>
        ) : (
          // relative: de sr-only tekst in een staafje mag niet aan het afknippen van de vegende rij ontsnappen
          <div className="relative mt-5 overflow-x-auto">
            <ol aria-label="Paginaweergaven per dag" className="flex h-44 min-w-[560px] items-stretch gap-1">
              {data.dagen.map((d) => (
                <li key={d.dag} className="relative flex min-w-0 flex-1 flex-col justify-end" title={`${dagKort(d.dag)}: ${d.weergaven} weergaven${d.aanvragen ? `, ${d.aanvragen} demo-aanvragen` : ""}`}>
                  <span className={`block w-full rounded-t ${d.aanvragen > 0 ? "bg-smiley-sun" : "bg-smiley-green"}`} style={{ height: `${d.weergaven === 0 ? 1 : Math.max(3, Math.round((d.weergaven / hoogste) * 100))}%` }} />
                  <span className="sr-only">
                    {dagKort(d.dag)}: {d.weergaven} weergaven{d.aanvragen ? `, ${d.aanvragen} demo-aanvragen` : ""}
                  </span>
                </li>
              ))}
            </ol>
            <div aria-hidden="true" className="mt-2 flex min-w-[560px] justify-between text-xs font-semibold text-smiley-mute">
              <span>{dagKort(eerste)}</span>
              <span>hoogste dag: {getal(hoogste)}</span>
              <span>{dagKort(laatste)}</span>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="sm-cijfers-top" className={KAART}>
        <h3 id="sm-cijfers-top" className="font-display text-xl font-bold text-smiley-ink">
          Meest bekeken pagina&apos;s
        </h3>
        {data.paginas.length === 0 ? (
          <p className="mt-3 text-smiley-mute">Nog geen weergaven in deze periode.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {data.paginas.map((p) => (
              <li key={p.pad}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words font-semibold text-smiley-ink">{p.naam}</span>
                  <span className="shrink-0 font-bold tabular-nums text-smiley-ink">{getal(p.weergaven)}</span>
                </div>
                <div aria-hidden="true" className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-smiley-mint">
                  <span className="block h-full rounded-full bg-smiley-leaf" style={{ width: `${Math.max(2, Math.round((p.weergaven / topMax) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
