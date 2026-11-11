import { nlDag, type OfferteRegel } from "@/lib/offertes/model";
import { aantalTekst, berekenTotalen, euro, procentTekst } from "@/lib/offertes/rekenen";

// De offerte zelf, zoals de klant hem ziet en zoals hij uitgeprint wordt: bedrijfsnaam, regels, btw, totaal, geldig tot en
// voorwaarden. Geen eigen toestand, dus bruikbaar op de openbare pagina, de afdrukpagina en het voorbeeld.

export interface WeergaveGegevens {
  bedrijfsnaam: string;
  nummer: string;
  titel: string;
  inleiding: string;
  klantNaam: string;
  klantAdres?: string | undefined;
  regels: OfferteRegel[];
  kortingBp: number;
  geldigTot: string;
  voorwaarden: string;
}

const th = "px-2 py-2 text-xs font-semibold uppercase tracking-wide text-neutralx-500";

export function OfferteWeergave({ o }: { o: WeergaveGegevens }) {
  const t = berekenTotalen(o.regels, o.kortingBp);
  return (
    <article className="text-sm text-ink">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-hair pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Offerte {o.nummer}</p>
          <h2 className="font-display text-xl font-bold text-ink">{o.titel || "Offerte"}</h2>
          <p className="mt-0.5 text-neutralx-600">van {o.bedrijfsnaam || "het bedrijf"}</p>
        </div>
        <div className="text-right text-neutralx-600">
          <p>
            Voor <span className="font-semibold text-ink">{o.klantNaam || "…"}</span>
          </p>
          {o.klantAdres && <p className="whitespace-pre-line">{o.klantAdres}</p>}
          <p className="mt-1">Geldig tot {nlDag(o.geldigTot)}</p>
        </div>
      </header>

      {o.inleiding && <p className="mt-4 whitespace-pre-line text-neutralx-600">{o.inleiding}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairstrong">
              <th className={th}>Omschrijving</th>
              <th className={`${th} text-right`}>Aantal</th>
              <th className={`${th} text-right`}>Prijs</th>
              <th className={`${th} text-right`}>Btw</th>
              <th className={`${th} text-right`}>Bedrag</th>
            </tr>
          </thead>
          <tbody>
            {o.regels.map((r, n) => (
              <tr key={n} className="border-b border-hair align-top">
                <td className="px-2 py-2">{r.omschrijving}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  {aantalTekst(r.aantal)} {r.eenheid}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right">{euro(r.prijsCent)}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">{r.btw}%</td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">{euro(t.regelCent[n] ?? 0)}</td>
              </tr>
            ))}
            {o.regels.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-neutralx-500">
                  Nog geen regels.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <dl className="mt-4 ml-auto w-full max-w-xs space-y-1">
        <div className="flex justify-between gap-4">
          <dt className="text-neutralx-600">Subtotaal (excl. btw)</dt>
          <dd>{euro(t.subtotaalCent)}</dd>
        </div>
        {t.kortingCent > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-neutralx-600">Korting {procentTekst(o.kortingBp)}%</dt>
            <dd>-{euro(t.kortingCent)}</dd>
          </div>
        )}
        {t.kortingCent > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-neutralx-600">Totaal excl. btw</dt>
            <dd>{euro(t.nettoCent)}</dd>
          </div>
        )}
        {t.tarieven
          .filter((x) => x.btw > 0)
          .map((x) => (
            <div key={x.btw} className="flex justify-between gap-4">
              <dt className="text-neutralx-600">
                Btw {x.btw}% over {euro(x.nettoCent)}
              </dt>
              <dd>{euro(x.btwCent)}</dd>
            </div>
          ))}
        <div className="flex justify-between gap-4 border-t border-hairstrong pt-2 text-base font-bold">
          <dt>Totaal incl. btw</dt>
          <dd>{euro(t.totaalCent)}</dd>
        </div>
      </dl>

      {o.voorwaarden && (
        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Voorwaarden</h3>
          <p className="mt-1 whitespace-pre-line text-neutralx-600">{o.voorwaarden}</p>
        </section>
      )}
    </article>
  );
}
