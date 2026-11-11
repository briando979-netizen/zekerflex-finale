// ---------------------------------------------------------------------------
// Opslag van de voorraad, in de KV-opslag per organisatie (geen migratie nodig):
//   voorraad:art:<tenantId>:<id>                     één artikel
//   voorraad:log:<tenantId>:<id>~<tijd>~<willekeur>  één regel van het logboek (een mutatie of telling)
//
// Gelijktijdige mutaties: de KV heeft geen vergrendeling of voorwaardelijk schrijven. Twee mensen die tegelijk een
// artikel bijwerken zouden met "lees aantal, schrijf nieuw aantal" elkaars wijziging kunnen overschrijven. De aanpak:
// het logboek is de waarheid. Elke mutatie schrijft eerst haar eigen logregel (een eigen sleutel, dus die overschrijft
// niemand), en het aantal van het artikel wordt daarna steeds afgeleid: begin + de som van alle verschillen in het
// logboek. Schrijven twee mutaties tegelijk, dan staan allebei de regels erin en komt elk van beide bij de som van
// allebei uit. Een telling logt het verschil met het aantal op dat moment; komt er in dezelfde fractie van een seconde
// een andere mutatie tussen, dan klopt het logboek nog steeds met het aantal (de som), alleen is de getelde stand dan
// met die ene mutatie verschoven. Dat is bewust aanvaard: een winkel telt niet midden in een verkoop.
// Een artikelnummer dat twee mensen op hetzelfde moment invoeren kan in theorie dubbel worden; dat is aanvaard.
// Wat er niet in de lijst hoort (andere organisatie) komt er niet bij: elke sleutel begint met het organisatie-id.
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { ARTIKEL_ID, heeftDecimalen, rond3, skuBezet, valideerArtikel, valideerMutatie, type Artikel, type Mutatie } from "@/lib/voorraad/model";

const MAX_ARTIKELEN = 3_000;
const MAX_LOG_PER_ARTIKEL = 20_000;
export const GESCHIEDENIS_AANTAL = 100;

/** Een nieuw artikel-id (12 hex-tekens). */
export const nieuwArtikelId = (): string => randomBytes(6).toString("hex");

const voorvoegselArt = (t: string) => `voorraad:art:${t}:`;
const sleutelArt = (t: string, id: string) => `${voorvoegselArt(t)}${id}`;
const voorvoegselLog = (t: string, id: string) => `voorraad:log:${t}:${id}~`;

const nietGevonden = () => AppError.notFound("Dit artikel bestaat niet (meer).");

// --- lezen ---------------------------------------------------------------------

export async function leesArtikelen(tenantId: string): Promise<Artikel[]> {
  const lijst = await kvListValues<Artikel>(voorvoegselArt(tenantId), MAX_ARTIKELEN);
  return lijst.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

export async function leesArtikel(tenantId: string, id: string): Promise<Artikel | null> {
  if (!ARTIKEL_ID.test(id)) return null;
  return kvGet<Artikel>(sleutelArt(tenantId, id));
}

async function logRegels(tenantId: string, id: string): Promise<Mutatie[]> {
  return kvListValues<Mutatie>(voorvoegselLog(tenantId, id), MAX_LOG_PER_ARTIKEL);
}

/** De laatste mutaties van een artikel, de nieuwste eerst (hoogstens 100). */
export async function geschiedenis(tenantId: string, id: string, aantal = GESCHIEDENIS_AANTAL): Promise<Mutatie[]> {
  if (!ARTIKEL_ID.test(id)) return [];
  const alle = await logRegels(tenantId, id);
  return alle.sort((a, b) => b.op.localeCompare(a.op) || b.id.localeCompare(a.id)).slice(0, aantal);
}

// --- artikelen ---------------------------------------------------------------------

export async function maakArtikel(tenantId: string, invoer: unknown, nu: Date = new Date()): Promise<Artikel> {
  const o = invoer && typeof invoer === "object" ? (invoer as Record<string, unknown>) : {};
  const v = valideerArtikel(o, { metAantal: true });
  const bestaand = await leesArtikelen(tenantId);
  if (bestaand.length >= MAX_ARTIKELEN) throw AppError.validation("Je hebt het maximale aantal artikelen bereikt. Archiveer of wis artikelen die je niet meer gebruikt.");
  if (skuBezet(v.sku, bestaand)) throw AppError.conflict("Dit artikelnummer is al in gebruik bij een ander artikel (ook gearchiveerde tellen mee).");
  const artikel: Artikel = {
    id: nieuwArtikelId(),
    naam: v.naam,
    sku: v.sku,
    eenheid: v.eenheid,
    aantal: v.aantal,
    begin: v.aantal,
    minimum: v.minimum,
    kostprijsCent: v.kostprijsCent,
    leverancier: v.leverancier,
    locatie: v.locatie,
    notitie: v.notitie,
    gearchiveerd: false,
    gemaaktOp: nu.toISOString(),
    bijgewerktOp: nu.toISOString(),
  };
  await kvSet(sleutelArt(tenantId, artikel.id), artikel);
  return artikel;
}

/** Bewerkt de gegevens van een artikel. Het aantal blijft ongemoeid (dat verandert alleen via een mutatie of telling). */
export async function bewerkArtikel(tenantId: string, id: string, invoer: unknown, nu: Date = new Date()): Promise<Artikel> {
  const huidig = await leesArtikel(tenantId, id);
  if (!huidig) throw nietGevonden();
  const o = invoer && typeof invoer === "object" ? (invoer as Record<string, unknown>) : {};
  const v = valideerArtikel(o, { metAantal: false });
  // naar een eenheid zonder decimalen kan alleen als het aantal heel is (het minimum is al met die eenheid gecontroleerd)
  if (!heeftDecimalen(v.eenheid) && !Number.isInteger(huidig.aantal)) {
    throw AppError.validation("Deze eenheid kan alleen hele getallen. Doe eerst een telling met een heel aantal.");
  }
  if (skuBezet(v.sku, await leesArtikelen(tenantId), id)) throw AppError.conflict("Dit artikelnummer is al in gebruik bij een ander artikel (ook gearchiveerde tellen mee).");
  const nieuw: Artikel = { ...huidig, naam: v.naam, sku: v.sku, eenheid: v.eenheid, minimum: v.minimum, kostprijsCent: v.kostprijsCent, leverancier: v.leverancier, locatie: v.locatie, notitie: v.notitie, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelArt(tenantId, id), nieuw);
  return nieuw;
}

/**
 * Een mutatie of telling. Schrijft eerst de logregel en leidt het aantal daarna af uit het logboek (zie de uitleg
 * bovenaan). Geeft het bijgewerkte artikel en de logregel terug.
 */
export async function muteer(tenantId: string, id: string, invoer: unknown, door: string, nu: Date = new Date()): Promise<{ artikel: Artikel; mutatie: Mutatie }> {
  const a = await leesArtikel(tenantId, id);
  if (!a) throw nietGevonden();
  if (a.gearchiveerd) throw AppError.conflict("Dit artikel is gearchiveerd. Haal het eerst terug om de voorraad te wijzigen.");
  const o = invoer && typeof invoer === "object" ? (invoer as Record<string, unknown>) : {};
  const m = valideerMutatie(a.eenheid, a.aantal, o);
  const sleutel = `${voorvoegselLog(tenantId, id)}${nu.toISOString()}~${randomBytes(3).toString("hex")}`;
  const mutatie: Mutatie = { id: sleutel.slice(voorvoegselLog(tenantId, id).length), artikelId: id, verschil: m.verschil, nieuwAantal: m.nieuw, reden: m.reden, opmerking: m.opmerking, door, op: nu.toISOString() };
  await kvSet(sleutel, mutatie);
  // het aantal is begin + de som van het logboek: ook als iemand tegelijk schreef
  const som = rond3(a.begin + (await logRegels(tenantId, id)).reduce((s, r) => s + r.verschil, 0));
  if (som < 0 && m.reden !== "correctie") {
    await kvDelete(sleutel);
    throw AppError.conflict("Er is net iets anders van dit artikel afgegaan, zodat er niet genoeg meer ligt. Vernieuw de lijst en probeer het opnieuw.");
  }
  if (som !== m.nieuw) {
    mutatie.nieuwAantal = som;
    await kvSet(sleutel, mutatie);
  }
  const artikel: Artikel = { ...a, aantal: som, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelArt(tenantId, id), artikel);
  return { artikel, mutatie };
}

export async function zetArchief(tenantId: string, id: string, gearchiveerd: boolean, nu: Date = new Date()): Promise<Artikel> {
  const a = await leesArtikel(tenantId, id);
  if (!a) throw nietGevonden();
  const nieuw: Artikel = { ...a, gearchiveerd, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelArt(tenantId, id), nieuw);
  return nieuw;
}

/** Wissen kan alleen zonder mutaties; anders blijft het artikel in de geschiedenis en archiveer je het. */
export async function verwijderArtikel(tenantId: string, id: string): Promise<void> {
  const a = await leesArtikel(tenantId, id);
  if (!a) throw nietGevonden();
  if ((await logRegels(tenantId, id)).length > 0) throw AppError.conflict("Dit artikel heeft mutaties in het logboek en kan niet worden gewist. Archiveer het: dan verdwijnt het uit de lijst en blijft de geschiedenis bewaard.");
  await kvDelete(sleutelArt(tenantId, id));
}
