import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { PrintKnoppen } from "@/components/werkbonnen/PrintKnoppen";
import { AppError } from "@/lib/errors";
import { eigenOrganisatie } from "@/lib/werkbonnen/toegang";
import { STATUS_NAAM, adresRegel, euroTekst, regelTotaalCent, totalen, urenTekst } from "@/lib/werkbonnen/model";
import { leesBon } from "@/lib/werkbonnen/store";

export const dynamic = "force-dynamic";

// De afdrukpagina van één werkbon. Bij het afdrukken verdwijnt alles behalve de bon (visibility), ook de menubalk van de
// werkgeversomgeving. Alle tijden zijn Nederlandse tijd.

const datumTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const dagTekst = (dag: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${dag}T12:00:00Z`));
const aantalTekst = (n: number) => new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(n);

const CSS = `
  @media print {
    body * { visibility: hidden !important; }
    #zf-werkbon, #zf-werkbon * { visibility: visible !important; }
    #zf-werkbon { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: #fff !important; color: #000 !important; }
    @page { size: A4; margin: 15mm; }
  }
`;

export default async function WerkbonPrintPagina({ params }: { params: Promise<{ id: string }> }) {
  await requirePrincipal();
  let tenantId: string;
  try {
    tenantId = (await eigenOrganisatie()).tenantId;
  } catch (err) {
    if (err instanceof AppError && err.code === "ALLEEN_BEHEERDER") {
      return (
        <p role="alert" className="mx-auto max-w-xl rounded-xl bg-paper-soft px-4 py-3 text-sm text-ink">
          {err.message}
        </p>
      );
    }
    throw err;
  }
  const { id } = await params;
  const bon = await leesBon(tenantId, id);
  if (!bon) notFound();
  const t = totalen(bon);
  const adres = adresRegel(bon.klant);

  return (
    <div className="mx-auto max-w-3xl">
      <PrintKnoppen terug="/werkgever/werkbonnen" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <article id="zf-werkbon" className="rounded-xl border border-hair bg-white p-6 text-ink">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairstrong pb-3">
          <h2 className="font-display text-2xl font-bold">Werkbon {bon.nummer}</h2>
          <p className="text-sm">Status: {STATUS_NAAM[bon.status]}</p>
        </header>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide">Klant</h3>
            {bon.klant.naam || adres || bon.klant.telefoon || bon.klant.email ? (
              <p className="mt-1 text-sm">
                {bon.klant.naam && <span className="block font-semibold">{bon.klant.naam}</span>}
                {adres && <span className="block">{adres}</span>}
                {bon.klant.telefoon && <span className="block">{bon.klant.telefoon}</span>}
                {bon.klant.email && <span className="block">{bon.klant.email}</span>}
              </p>
            ) : (
              <p className="mt-1 text-sm">Geen klantgegevens</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide">Planning</h3>
            <p className="mt-1 text-sm">
              {bon.start ? <span className="block">Begin: {datumTijd(bon.start)}</span> : <span className="block">Nog niet gepland</span>}
              {bon.eind && <span className="block">Einde: {datumTijd(bon.eind)}</span>}
              {bon.medewerkers.length > 0 && <span className="block">Medewerkers: {bon.medewerkers.join(", ")}</span>}
            </p>
          </div>
        </section>

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide">Omschrijving</h3>
          <p className="mt-1 whitespace-pre-line text-sm">{bon.omschrijving}</p>
        </section>

        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide">Uren</h3>
          {bon.uren.length === 0 ? (
            <p className="mt-1 text-sm">Geen uren geschreven.</p>
          ) : (
            <table className="mt-1 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairstrong">
                  <th className="py-1 pr-2 font-semibold">Datum</th>
                  <th className="py-1 pr-2 font-semibold">Medewerker</th>
                  <th className="py-1 pr-2 font-semibold">Opmerking</th>
                  <th className="py-1 text-right font-semibold">Uren</th>
                </tr>
              </thead>
              <tbody>
                {bon.uren.map((r) => (
                  <tr key={r.id} className="border-b border-hair">
                    <td className="py-1 pr-2">{dagTekst(r.datum)}</td>
                    <td className="py-1 pr-2">{r.medewerker}</td>
                    <td className="py-1 pr-2">{r.opmerking}</td>
                    <td className="py-1 text-right">{urenTekst(r.minuten / 60)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-1 font-semibold">
                    Totaal uren
                  </td>
                  <td className="pt-1 text-right font-semibold">{urenTekst(t.uren)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide">Materialen</h3>
          {bon.materialen.length === 0 ? (
            <p className="mt-1 text-sm">Geen materialen gebruikt.</p>
          ) : (
            <table className="mt-1 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairstrong">
                  <th className="py-1 pr-2 font-semibold">Omschrijving</th>
                  <th className="py-1 pr-2 text-right font-semibold">Aantal</th>
                  <th className="py-1 pr-2 text-right font-semibold">Prijs per stuk</th>
                  <th className="py-1 text-right font-semibold">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {bon.materialen.map((m) => {
                  const tot = regelTotaalCent(m);
                  return (
                    <tr key={m.id} className="border-b border-hair">
                      <td className="py-1 pr-2">{m.omschrijving}</td>
                      <td className="py-1 pr-2 text-right">{aantalTekst(m.aantal)}</td>
                      <td className="py-1 pr-2 text-right">{m.prijsCent === null ? "geen prijs" : euroTekst(m.prijsCent)}</td>
                      <td className="py-1 text-right">{tot === null ? "-" : euroTekst(tot)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-1 font-semibold">
                    Totaal materiaal
                  </td>
                  <td className="pt-1 text-right font-semibold">{euroTekst(t.materiaalCent)}</td>
                </tr>
              </tfoot>
            </table>
          )}
          {t.regelsZonderPrijs > 0 && <p className="mt-1 text-xs">Let op: {t.regelsZonderPrijs} regel(s) zonder prijs zijn niet meegeteld in het totaal.</p>}
        </section>

        {bon.afrondNotitie && (
          <section className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide">Afronding</h3>
            <p className="mt-1 whitespace-pre-line text-sm">{bon.afrondNotitie}</p>
            {bon.afgerondOp && <p className="mt-1 text-xs">Afgerond op {datumTijd(bon.afgerondOp)}</p>}
          </section>
        )}
        {!bon.afrondNotitie && bon.afgerondOp && <p className="mt-5 text-xs">Afgerond op {datumTijd(bon.afgerondOp)}</p>}

        <section className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div className="border-t border-hairstrong pt-1">Handtekening klant</div>
          <div className="border-t border-hairstrong pt-1">Handtekening uitvoerder</div>
        </section>
      </article>
    </div>
  );
}
