import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { maakOpslag, nieuwId } from "@/lib/advertentie/opslag";
import { geldendePrijzen, schonePrijs, type AdTekst, type Advertentie, type Aanvraag, type Invoer, type Prijzen } from "@/lib/advertentie/regels";

// Advertenties op maat in KV (advertentie:item:<id>) en de prijsinstelling (advertentie:prijs).
// Een advertentie bevat pas naam en e-mail als de bezoeker zelf "Deze wil ik" instuurt; alles vervalt na 60 dagen.

const opslag = maakOpslag<Advertentie>("advertentie:item:");
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

/** Vrijgeven (na betaling): alleen als er een aanvraag ligt, want die zegt welk ontwerp en naar wie de mail gaat. */
export async function geefVrij(id: string, nu = new Date()): Promise<Advertentie> {
  const ad = await eis(id, nu);
  if (!ad.aanvraag) throw AppError.precondition("Deze advertentie is nog niet aangevraagd: er is geen ontwerp gekozen en geen e-mailadres.");
  const moment = nu.toISOString();
  return opslag.bewaar({ ...ad, status: "vrijgegeven", vrijgegevenOp: ad.vrijgegevenOp ?? moment, gewijzigd: moment });
}

export async function verwijderAdvertentie(id: string): Promise<void> {
  await opslag.verwijder(id);
}

/** De prijzen die gelden (Beheer of de standaard). Een storing in KV geeft de standaard: de pagina blijft werken. */
export async function leesPrijzen(): Promise<Prijzen> {
  return geldendePrijzen(await kvGet<unknown>(K_PRIJS).catch(() => null));
}

/** Wat de eigenaar zelf invulde (leeg = de standaard geldt). */
export async function leesIngesteldePrijzen(): Promise<{ een: string; alle: string }> {
  const v = await kvGet<{ een?: unknown; alle?: unknown }>(K_PRIJS).catch(() => null);
  return { een: schonePrijs(v?.een), alle: schonePrijs(v?.alle) };
}

export async function bewaarPrijzen(nieuw: { een: unknown; alle: unknown }): Promise<Prijzen> {
  const ingesteld = { een: schonePrijs(nieuw.een), alle: schonePrijs(nieuw.alle) };
  await kvSet(K_PRIJS, ingesteld);
  return geldendePrijzen(ingesteld);
}
