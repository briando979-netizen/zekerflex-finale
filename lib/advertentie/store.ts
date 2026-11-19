import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { ADVERTENTIE_VOORVOEGSEL, maakOpslag, nieuwId } from "@/lib/advertentie/opslag";
import { KEUZE_GEWIJZIGD, PRIJS_FOUT, geldendePrijzen, keuzeGewijzigd, normaliseerPrijs, type AdTekst, type Advertentie, type Aanvraag, type Invoer, type Prijzen } from "@/lib/advertentie/regels";

// Advertenties op maat in KV (advertentie:item:<id>) en de prijsinstelling (advertentie:prijs).
// Een advertentie bevat pas naam en e-mail als de bezoeker zelf "Deze wil ik" instuurt; alles vervalt na 60 dagen.

const opslag = maakOpslag<Advertentie>(ADVERTENTIE_VOORVOEGSEL);
const K_PRIJS = "advertentie:prijs";

export async function maakAdvertentie(invoer: Invoer, tekst: AdTekst, bron: Advertentie["bron"], nu = new Date()): Promise<Advertentie> {
  const moment = nu.toISOString();
  return opslag.bewaar({ id: nieuwId(), aangemaakt: moment, gewijzigd: moment, invoer, tekst, bron, status: "gemaakt" });
}

export const haalAdvertentie = opslag.haal;
export const alleAdvertenties = opslag.alle;

async function eis(id: string, nu: Date): Promise<Advertentie> {
  const ad = await opslag.haal(id, nu);
  if (!ad) throw AppError.notFound("Deze advertentie bestaat niet (meer).");
  return ad;
}

/** "Deze wil ik": bewaart het gekozen ontwerp en de contactgegevens. Na vrijgave ligt de keuze vast. */
export async function vraagAan(id: string, aanvraag: Omit<Aanvraag, "op">, nu = new Date()): Promise<Advertentie> {
  const ad = await eis(id, nu);
  if (ad.status === "vrijgegeven") throw AppError.conflict("Deze advertentie is al vrijgegeven.");
  const moment = nu.toISOString();
  return opslag.bewaar({ ...ad, status: "aangevraagd", aanvraag: { ...aanvraag, op: moment }, gewijzigd: moment });
}

export type VrijgaveUitkomst<T> = { ok: true; rij: T } | { ok: false; rij: T };

/**
 * Vrijgeven (na betaling), voor de aanvraag die de beheerder zag (`gezienOp` = het tijdstip van die aanvraag). Stuurde de
 * klant intussen een andere keuze in, dan gebeurt er niets en komt de versie van nu terug (ok: false): de beheerder kijkt
 * opnieuw. Zonder aanvraag is er geen ontwerp gekozen en geen e-mailadres.
 */
export async function geefVrij(id: string, gezienOp: string, nu = new Date()): Promise<VrijgaveUitkomst<Advertentie>> {
  const ad = await eis(id, nu);
  if (!ad.aanvraag) throw AppError.precondition("Deze advertentie is nog niet aangevraagd: er is geen ontwerp gekozen en geen e-mailadres.");
  if (keuzeGewijzigd(ad.aanvraag, gezienOp)) return { ok: false, rij: ad };
  const moment = nu.toISOString();
  return { ok: true, rij: await opslag.bewaar({ ...ad, status: "vrijgegeven", vrijgegevenOp: ad.vrijgegevenOp ?? moment, gewijzigd: moment }) };
}

export { KEUZE_GEWIJZIGD };

export async function verwijderAdvertentie(id: string): Promise<void> {
  await opslag.verwijder(id);
}

/** De prijzen die gelden (Beheer of de standaard). Een storing in KV geeft de standaard: de pagina blijft werken. */
export async function leesPrijzen(): Promise<Prijzen> {
  return geldendePrijzen(await kvGet<unknown>(K_PRIJS).catch(() => null));
}

/** Wat de eigenaar zelf invulde (leeg = de standaard geldt). */
export async function leesIngesteldePrijzen(): Promise<{ een: string; alle: string; logo: string }> {
  const v = await kvGet<{ een?: unknown; alle?: unknown; logo?: unknown }>(K_PRIJS).catch(() => null);
  return { een: normaliseerPrijs(v?.een) ?? "", alle: normaliseerPrijs(v?.alle) ?? "", logo: normaliseerPrijs(v?.logo) ?? "" };
}

/** Bewaart de prijzen, genormaliseerd ("€ 29", "€ 29,50"); iets anders dan een bedrag is een 422. */
export async function bewaarPrijzen(nieuw: { een: unknown; alle: unknown; logo: unknown }): Promise<Prijzen> {
  const een = normaliseerPrijs(nieuw.een);
  const alle = normaliseerPrijs(nieuw.alle);
  const logo = normaliseerPrijs(nieuw.logo);
  if (een === null) throw AppError.validation(PRIJS_FOUT, { veld: "een" });
  if (alle === null) throw AppError.validation(PRIJS_FOUT, { veld: "alle" });
  if (logo === null) throw AppError.validation(PRIJS_FOUT, { veld: "logo" });
  const ingesteld = { een, alle, logo };
  await kvSet(K_PRIJS, ingesteld);
  return geldendePrijzen(ingesteld);
}
