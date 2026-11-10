import { euro } from "@/lib/sites/euro";
import { KOR_TEKST, btwLabel } from "@/lib/sites/winkel-btw";
import type { BestelOverzicht } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// De optelling onder een bestelling: subtotaal, korting, verzending, btw en
// totaal, één keer opgeschreven voor de controlepagina, de bedankpagina, de
// mail aan het bedrijf en de Websitestudio. Zo staat overal hetzelfde.
// Puur en client-veilig. Bestellingen van vóór 10 nov 2026 hebben geen
// verzendmethode, korting of btw: die tonen alleen bezorgkosten en totaal.
// ---------------------------------------------------------------------------

export interface SomRegel {
  label: string;
  /** al opgemaakt: "€ 4,95", "Gratis", "− € 0,90"; leeg bij een noot */
  bedrag: string;
  /** regel: gewone regel; totaal: vet; klein: de btw die in het totaal zit; noot: een zin zonder bedrag */
  soort: "regel" | "korting" | "totaal" | "klein" | "noot";
}

const excl = (c: Pick<BestelOverzicht, "btw">) => Boolean(c.btw && !c.btw.inclusief && !c.btw.kor);

/** Alles onder de productregels, in de volgorde van een kassabon. */
export function somRegels(c: Pick<BestelOverzicht, "subtotaalCents" | "bezorgkostenCents" | "totaalCents" | "verzending" | "korting" | "btw">): SomRegel[] {
  const rijen: SomRegel[] = [{ label: excl(c) ? "Subtotaal (excl. btw)" : "Subtotaal", bedrag: euro(c.subtotaalCents), soort: "regel" }];
  if (c.korting) rijen.push({ label: `Korting (${c.korting.code})`, bedrag: `− ${euro(c.korting.cents)}`, soort: "korting" });
  if (c.verzending) rijen.push({ label: c.verzending.naam, bedrag: c.bezorgkostenCents ? euro(c.bezorgkostenCents) : "Gratis", soort: "regel" });
  else if (c.bezorgkostenCents) rijen.push({ label: "Bezorgkosten", bedrag: euro(c.bezorgkostenCents), soort: "regel" });
  const btw = c.btw;
  if (btw && excl(c)) for (const r of btw.regels) rijen.push({ label: btwLabel(r, false), bedrag: euro(r.btwCents), soort: "regel" });
  rijen.push({ label: "Totaal", bedrag: euro(c.totaalCents), soort: "totaal" });
  if (btw?.kor) rijen.push({ label: KOR_TEKST, bedrag: "", soort: "noot" });
  else if (btw?.inclusief) for (const r of btw.regels) rijen.push({ label: btwLabel(r, true), bedrag: euro(r.btwCents), soort: "klein" });
  return rijen;
}
