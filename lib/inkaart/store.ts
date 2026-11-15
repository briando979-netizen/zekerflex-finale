import { kvGet, kvSet } from "@/lib/storage/kv";
import { leesBedrijf } from "@/lib/inkaart/schema";
import type { BedrijfInKaart } from "@/lib/inkaart/model";

// De opslag van "Bedrijf in kaart" (lib/inkaart/model.ts): één document per organisatie in de KV-opslag, zonder migratie. De sleutel begint met het
// organisatie-id, dus wat bij een ander bedrijf hoort komt er nooit bij. Het bevat geen persoonsgegevens (alleen aantallen, bedragen en namen van
// ruimtes en groepen personeel), dus er is niets per gebruiker te wissen; wel hoort de rij bij de organisatie (register in lib/privacy/org-kv.ts).

/** Het voorvoegsel in het register van organisatie-gegevens (lib/privacy/org-kv.ts): één rij per organisatie, die mee gaat bij het wissen en in de export. */
export const INKAART_PREFIX = "inkaart:gegevens:";
const sleutel = (tenantId: string) => `inkaart:gegevens:${tenantId}`;

/** De bewaarde gegevens van dit bedrijf; null als er nog niets is of als het bewaarde document niet meer klopt. */
export async function leesInKaart(tenantId: string): Promise<BedrijfInKaart | null> {
  return leesBedrijf(await kvGet<unknown>(sleutel(tenantId)).catch(() => null));
}

/** Bewaart de gegevens met het tijdstip van nu en geeft de bewaarde versie terug (dat is wat het scherm overneemt). */
export async function bewaarInKaart(tenantId: string, b: BedrijfInKaart, nu: Date = new Date()): Promise<BedrijfInKaart> {
  const bewaard: BedrijfInKaart = { ...b, bijgewerkt: nu.toISOString() };
  await kvSet(sleutel(tenantId), bewaard);
  return bewaard;
}
