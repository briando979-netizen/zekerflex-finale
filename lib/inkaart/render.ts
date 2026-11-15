import { vulIn } from "@/lib/i18n/vul-in";
import { dagVan, deelVan } from "@/lib/inkaart/model";
import type { Signaal, SignaalParam } from "@/lib/inkaart/analyse";
import type { InKaartTeksten } from "@/lib/inkaart/teksten";

// Van data naar tekst (lib/inkaart/teksten.ts): de plek in het raster als woorden, getallen en bedragen in de taal van de lezer, en de tekst van een
// signaal. Puur, zonder taalgegevens, zodat de browser dit mag importeren (de teksten komen van de server).

/** Een plek in het raster als woorden, bijvoorbeeld "maandagochtend" of "Monday morning". */
export function plekNaam(t: InKaartTeksten, index: number): string {
  const dag = t.dagen[dagVan(index)];
  const deel = t.dagdelen[deelVan(index)];
  return dag && deel ? vulIn(t.plek, { dag, deel: deel.naam }) : "";
}

export const getalTekst = (t: InKaartTeksten, n: number): string => n.toLocaleString(t.taal);
export const euroTekst = (t: InKaartTeksten, n: number): string => `€ ${Math.round(n).toLocaleString(t.taal)}`;

function waarden(t: InKaartTeksten, params: Record<string, SignaalParam>): Record<string, string | number> {
  const uit: Record<string, string | number> = {};
  for (const [sleutel, waarde] of Object.entries(params)) {
    if (waarde === null) continue;
    if (typeof waarde === "string") uit[sleutel] = waarde;
    else if (sleutel === "plek" || sleutel.endsWith("Plek")) uit[sleutel] = plekNaam(t, waarde);
    else if (sleutel === "bedrag") uit[sleutel] = euroTekst(t, waarde);
    else uit[sleutel] = getalTekst(t, waarde);
  }
  return uit;
}

/** De titel, uitleg en (als het signaal een knop heeft) het label van de knop, in de taal van de lezer. */
export function signaalTekst(t: InKaartTeksten, s: Signaal): { titel: string; waarom: string; actie?: string } {
  const sj = t.signalen.sjablonen[s.soort];
  const w = waarden(t, s.params);
  // twee soorten hebben een tweede variant van de uitleg: met een bedrag (personeelskosten boven het doel), en met een eigen doel (rustige ruimte)
  const anders =
    (s.soort === "personeel-boven-doel" && s.params.bedrag !== null && s.params.bedrag !== undefined) || (s.soort === "rustig" && s.params.eigenDoel === 1);
  const basis = anders && sj.waaromAnders ? sj.waaromAnders : sj.waarom;
  const erbij = s.soort === "rustig" && s.params.uren !== null && s.params.uren !== undefined && sj.erbij ? ` ${vulIn(sj.erbij, w)}` : "";
  const uit: { titel: string; waarom: string; actie?: string } = { titel: vulIn(sj.titel, w), waarom: `${vulIn(basis, w)}${erbij}` };
  if (s.actie && sj.actie) uit.actie = sj.actie;
  return uit;
}
