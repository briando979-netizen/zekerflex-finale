import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { beheerContext } from "@/lib/horeca/toegang";
import { menukaart } from "@/lib/horeca/store";
import { ALLERGENEN } from "@/lib/horeca/allergenen";
import { ALLERGEEN_VOLGORDE, allergenenKaart } from "@/lib/horeca/allergenenkaart";
import { PrintKnop } from "@/components/horeca/beheer/PrintKnop";

export const metadata: Metadata = { title: "Allergenenkaart" };
export const dynamic = "force-dynamic";

// Printbare allergenenkaart: alle gerechten × de 14 wettelijke allergenen
// (lib/horeca/allergenenkaart.ts). Liggend A4; voor gasten, personeel en een controle.

const PRINT = `@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body * { visibility: hidden; }
  #allergenen-vel, #allergenen-vel * { visibility: visible; }
  #allergenen-vel { position: absolute; inset: 0 auto auto 0; width: 100%; }
  .niet-printen { display: none !important; }
  #allergenen-vel table { font-size: 9pt; }
}`;

const vandaag = () => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date());

export default async function AllergenenPagina() {
  const { zaak } = await beheerContext().catch(() => ({ zaak: null }));
  if (!zaak) notFound();
  const { categorieen, items } = await menukaart(zaak.id);
  const groepen = allergenenKaart(categorieen, items);
  return (
    <section>
      <style>{PRINT}</style>
      <div className="niet-printen mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Allergenenkaart</h1>
          <p className="text-sm text-neutralx-600">
            Alle gerechten met de 14 allergenen die je volgens de wet moet kunnen melden. Print hem liggend en leg hem bij de kassa of in de keuken. Pas
            allergenen aan onder Horeca → Menukaart.
          </p>
        </div>
        <PrintKnop />
      </div>
      {groepen.length === 0 ? (
        <p className="card p-5 text-sm text-neutralx-600">Je menukaart is nog leeg. Zet eerst gerechten op de kaart onder Horeca → Menukaart.</p>
      ) : (
        <div id="allergenen-vel" className="card overflow-x-auto p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-ink">Allergenen · {zaak.naam}</h2>
            <p className="text-xs text-neutralx-600">Stand van {vandaag()}</p>
          </div>
          <table className="w-full border-collapse text-left text-xs">
            <caption className="sr-only">Allergenen per gerecht: een bolletje betekent dat het gerecht dit allergeen bevat</caption>
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-2 pr-3 text-sm font-semibold text-ink">
                  Gerecht
                </th>
                {ALLERGEEN_VOLGORDE.map((a) => (
                  <th key={a} scope="col" className="px-1 py-2 text-center align-bottom font-semibold text-ink">
                    <span className="inline-block max-w-[4.5rem] leading-tight">{ALLERGENEN[a]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            {groepen.map((g) => (
              <tbody key={g.naam}>
                <tr>
                  <th scope="colgroup" colSpan={ALLERGEEN_VOLGORDE.length + 1} className="bg-paper-soft px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-neutralx-700">
                    {g.naam}
                  </th>
                </tr>
                {g.items.map((i) => (
                  <tr key={`${g.naam}-${i.naam}`} className="border-b border-hair">
                    <th scope="row" className="py-1.5 pr-3 text-sm font-medium text-ink">
                      {i.naam}
                      {i.veganistisch ? <span className="ml-1.5 text-xs font-normal text-neutralx-600">(veganistisch)</span> : i.vegetarisch ? <span className="ml-1.5 text-xs font-normal text-neutralx-600">(vegetarisch)</span> : null}
                      {!i.beschikbaar ? <span className="ml-1.5 text-xs font-normal text-neutralx-600">(nu niet leverbaar)</span> : null}
                    </th>
                    {ALLERGEEN_VOLGORDE.map((a) => {
                      const bevat = i.allergenen.includes(a);
                      return (
                        <td key={a} className="px-1 py-1.5 text-center">
                          {bevat ? (
                            <>
                              <span aria-hidden className="text-base leading-none text-ink">
                                ●
                              </span>
                              <span className="sr-only">bevat {ALLERGENEN[a]}</span>
                            </>
                          ) : (
                            <span className="sr-only">geen {ALLERGENEN[a]}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          <p className="mt-3 text-xs text-neutralx-600">
            ● = bevat dit allergeen. In onze keuken worden alle allergenen verwerkt, dus sporen zijn nooit helemaal uit te sluiten. Heb je een
            allergie? Vraag het ons gerust.
          </p>
        </div>
      )}
    </section>
  );
}
