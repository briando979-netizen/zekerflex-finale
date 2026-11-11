// ---------------------------------------------------------------------------
// Opslag van kamers en boekingen, in de KV-opslag per organisatie (geen migratie nodig):
//   kamers:kamer:<tenantId>:<id>                       één kamer
//   kamers:boeking:<tenantId>:<jaar>-<nummer>          één boeking
//   kamers:nr:<tenantId>:<jaar>:<nummer>~<x>           een claim op een volgnummer (blijft staan, ook al verdwijnt de boeking)
//   kamers:teller:<tenantId>:<jaar>                    het laatst uitgegeven nummer (alleen een hint om snel te beginnen)
// Elke sleutel begint met het organisatie-id: wat bij een andere organisatie hoort komt er nooit bij.
//
// Gasten zijn derden: naam, telefoon, e-mail en opmerking van een boeking zijn te wissen (wisGast) en na de
// bewaartermijn (twee jaar na vertrek) op te schonen (schoonNaBewaartermijn). De boeking blijft als lege regel staan.
//
// Gelijktijdig boeken. De KV heeft geen vergrendeling en geen voorwaardelijk schrijven, dus er zijn twee dingen die
// kunnen misgaan als twee mensen tegelijk een boeking maken:
//  1. HETZELFDE VOLGNUMMER. De teller geeft alleen een beginpunt; per nummer schrijft iedereen zijn EIGEN claim (eigen
//     sleutel, dus niemand overschrijft een ander) en leest daarna alle claims op dat nummer terug: de eerste (op tijd,
//     dan op willekeurig deel) wint, de rest haalt zijn claim weg en probeert het volgende nummer. Een nummer waar al een
//     claim op staat wordt overgeslagen, ook als de boeking later is verdwenen: een nummer wordt nooit hergebruikt.
//  2. DEZELFDE KAMER IN DEZELFDE NACHTEN. Na het schrijven lezen we de boekingen van de kamer opnieuw. Staat er dan een
//     andere boeking met een LAGER nummer die botst, dan geeft de nieuwe het op (hij wordt weggehaald, met een melding).
//     Omdat de volgorde op het nummer is, geven twee gelijktijdige boekingen nooit allebei op. Een rest-kans blijft: als
//     de boeking met het lagere nummer pas schrijft nadat de andere haar controle deed, staan er twee in dezelfde nachten.
//     Dat is aanvaard (een logeerkamer is geen kassa) en zichtbaar in de kalender, waar de rij dan twee keer gevuld is.
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey, amsterdamParts } from "@/lib/time/amsterdam";
import {
  BOEKING_ID,
  KAMER_ID,
  MAX_BOEKINGEN,
  MAX_KAMERS,
  botsingen,
  controleerPlaatsing,
  isInvoerFout,
  kamerNaamBezet,
  nummerVan,
  overlapt,
  teWissenNaBewaartermijn,
  toekomstigeBoekingen,
  valideerBoeking,
  valideerKamer,
  vrijeKamers,
  wisGastgegevens,
  wisselStatus,
  type Boeking,
  type BoekingInhoud,
  type BoekingStatus,
  type Kamer,
  type Schoon,
} from "@/lib/kamers/model";

const MAX_POGINGEN = 100;

/** Een nieuw kamer-id (12 hex-tekens). */
export const nieuwKamerId = (): string => randomBytes(6).toString("hex");

const voorvoegselKamer = (t: string) => `kamers:kamer:${t}:`;
const sleutelKamer = (t: string, id: string) => `${voorvoegselKamer(t)}${id}`;
const voorvoegselBoeking = (t: string) => `kamers:boeking:${t}:`;
const sleutelBoeking = (t: string, id: string) => `${voorvoegselBoeking(t)}${id}`;
const sleutelTeller = (t: string, jaar: number) => `kamers:teller:${t}:${jaar}`;
const voorvoegselClaim = (t: string, jaar: number, nr: string) => `kamers:nr:${t}:${jaar}:${nr}~`;

const geenKamer = () => AppError.notFound("Deze kamer bestaat niet (meer).");
const geenBoeking = () => AppError.notFound("Deze boeking bestaat niet (meer).");

/** Voert een controle van invoer uit en maakt van een invoerfout een 422 met de Nederlandse tekst. */
function invoer<T>(f: () => T): T {
  try {
    return f();
  } catch (e) {
    if (isInvoerFout(e)) throw AppError.validation(e.message);
    throw e;
  }
}

const objectUit = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// --- kamers --------------------------------------------------------------------------

export async function leesKamers(tenantId: string): Promise<Kamer[]> {
  const lijst = await kvListValues<Kamer>(voorvoegselKamer(tenantId), MAX_KAMERS + 50);
  return lijst.sort((a, b) => a.naam.localeCompare(b.naam, "nl", { numeric: true }));
}

export async function leesKamer(tenantId: string, id: string): Promise<Kamer | null> {
  if (!KAMER_ID.test(id)) return null;
  return kvGet<Kamer>(sleutelKamer(tenantId, id));
}

export async function maakKamer(tenantId: string, uit: unknown, nu: Date = new Date()): Promise<Kamer> {
  const v = invoer(() => valideerKamer(objectUit(uit)));
  const bestaand = await leesKamers(tenantId);
  if (bestaand.length >= MAX_KAMERS) throw AppError.validation("Je hebt het maximale aantal kamers bereikt. Wis kamers die je niet meer gebruikt.");
  if (kamerNaamBezet(v.naam, bestaand)) throw AppError.conflict("Er is al een kamer met deze naam of dit nummer (ook gearchiveerde kamers tellen mee).");
  const kamer: Kamer = { id: nieuwKamerId(), ...v, schoon: "schoon", gearchiveerd: false, gemaaktOp: nu.toISOString(), bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelKamer(tenantId, kamer.id), kamer);
  return kamer;
}

export async function bewerkKamer(tenantId: string, id: string, uit: unknown, nu: Date = new Date()): Promise<Kamer> {
  const huidig = await leesKamer(tenantId, id);
  if (!huidig) throw geenKamer();
  const v = invoer(() => valideerKamer(objectUit(uit)));
  if (kamerNaamBezet(v.naam, await leesKamers(tenantId), id)) throw AppError.conflict("Er is al een kamer met deze naam of dit nummer (ook gearchiveerde kamers tellen mee).");
  if (v.capaciteit < huidig.capaciteit) {
    const te = toekomstigeBoekingen(await leesBoekingen(tenantId), id, amsterdamDayKey(nu)).find((b) => b.personen > v.capaciteit);
    if (te) throw AppError.conflict(`Boeking ${te.nummer} heeft ${te.personen} personen in deze kamer. Pas die boeking eerst aan voordat je de capaciteit verlaagt.`);
  }
  const nieuw: Kamer = { ...huidig, ...v, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelKamer(tenantId, id), nieuw);
  return nieuw;
}

export async function zetSchoon(tenantId: string, id: string, schoon: Schoon, nu: Date = new Date()): Promise<Kamer> {
  const k = await leesKamer(tenantId, id);
  if (!k) throw geenKamer();
  const nieuw: Kamer = { ...k, schoon, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelKamer(tenantId, id), nieuw);
  return nieuw;
}

/** Archiveren kan niet zolang er een boeking is die nog niet voorbij is; terughalen kan altijd. */
export async function zetArchief(tenantId: string, id: string, gearchiveerd: boolean, nu: Date = new Date()): Promise<Kamer> {
  const k = await leesKamer(tenantId, id);
  if (!k) throw geenKamer();
  if (gearchiveerd) {
    const open = toekomstigeBoekingen(await leesBoekingen(tenantId), id, amsterdamDayKey(nu));
    const eerste = open[0];
    if (eerste) {
      throw AppError.conflict(`Kamer ${k.naam} kan niet worden gearchiveerd: er ${open.length === 1 ? "is nog 1 boeking" : `zijn nog ${open.length} boekingen`} die niet voorbij ${open.length === 1 ? "is" : "zijn"} (bijvoorbeeld ${eerste.nummer}). Annuleer of verplaats ${open.length === 1 ? "die boeking" : "die boekingen"} eerst.`);
    }
  }
  const nieuw: Kamer = { ...k, gearchiveerd, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelKamer(tenantId, id), nieuw);
  return nieuw;
}

/** Wissen kan alleen een kamer zonder enige boeking (ook geannuleerde tellen mee); anders archiveer je hem. */
export async function verwijderKamer(tenantId: string, id: string): Promise<void> {
  const k = await leesKamer(tenantId, id);
  if (!k) throw geenKamer();
  if ((await leesBoekingen(tenantId)).some((b) => b.kamerId === id)) throw AppError.conflict("Deze kamer heeft boekingen en kan niet worden gewist. Archiveer hem: dan verdwijnt hij uit de keuzelijsten en blijft de geschiedenis bewaard.");
  await kvDelete(sleutelKamer(tenantId, id));
}

// --- boekingen -------------------------------------------------------------------------

export async function leesBoekingen(tenantId: string): Promise<Boeking[]> {
  const lijst = await kvListValues<Boeking>(voorvoegselBoeking(tenantId), MAX_BOEKINGEN + 50);
  return lijst.sort((a, b) => a.aankomst.localeCompare(b.aankomst) || a.nummer.localeCompare(b.nummer));
}

export async function leesBoeking(tenantId: string, id: string): Promise<Boeking | null> {
  if (!BOEKING_ID.test(id)) return null;
  return kvGet<Boeking>(sleutelBoeking(tenantId, id));
}

/** De boekingen die iets van de periode [van, tot) raken. */
export async function boekingenInPeriode(tenantId: string, van: string, tot: string): Promise<Boeking[]> {
  return (await leesBoekingen(tenantId)).filter((b) => overlapt(van, tot, b.aankomst, b.vertrek));
}

/** De vrije kamers voor een aankomst en vertrek (de boekingen komen uit de opslag). */
export async function zoekVrijeKamers(tenantId: string, aankomst: string, vertrek: string, personen: number, negeerId?: string): Promise<Kamer[]> {
  const [kamers, boekingen] = await Promise.all([leesKamers(tenantId), leesBoekingen(tenantId)]);
  return vrijeKamers(kamers, boekingen, aankomst, vertrek, personen, negeerId);
}

interface Claim {
  rand: string;
  at: number;
}

/** Het moment vlak voor het schrijven van een claim; bewust niet `nu` van de aanroeper en niet `Date` (bevroren in tests). */
const tijdstipNu = (): number => performance.timeOrigin + performance.now();

/** De claim die wint: de eerste in tijd, bij gelijke tijd het laagste willekeurige deel. */
const winnaar = (claims: Claim[]): Claim | undefined => [...claims].sort((a, b) => a.at - b.at || a.rand.localeCompare(b.rand))[0];

export async function maakBoeking(tenantId: string, uit: unknown, nu: Date = new Date()): Promise<Boeking> {
  const v = invoer(() => valideerBoeking(objectUit(uit)));
  const kamer = (await leesKamer(tenantId, v.kamerId)) ?? undefined;
  if (!kamer) throw geenKamer();
  const alle = await leesBoekingen(tenantId);
  if (alle.length >= MAX_BOEKINGEN) throw AppError.validation("Je hebt het maximale aantal boekingen bereikt. Wis gastgegevens van oude boekingen of neem contact op.");
  const p = controleerPlaatsing(v, kamer, alle);
  if (!p.ok) throw AppError.conflict(p.fout);

  const jaar = amsterdamParts(nu).year;
  const teller = await kvGet<{ n: number }>(sleutelTeller(tenantId, jaar));
  const ditJaar = await kvListEntries<Boeking>(`${voorvoegselBoeking(tenantId)}${jaar}-`, MAX_BOEKINGEN);
  const begin = Math.max(typeof teller?.n === "number" ? teller.n : 0, ditJaar.length) + 1;
  const rand = randomBytes(5).toString("hex");

  for (let n = begin; n < begin + MAX_POGINGEN; n += 1) {
    const nr = String(n).padStart(4, "0");
    const voor = voorvoegselClaim(tenantId, jaar, nr);
    if ((await kvListEntries<Claim>(voor, 50)).length > 0) continue; // dit nummer is al van een ander
    const sleutel = `${voor}${rand}`;
    const mijn: Claim = { rand, at: tijdstipNu() };
    await kvSet(sleutel, mijn);
    const na = (await kvListEntries<Claim>(voor, 50)).map((e) => e.value);
    if (winnaar(na)?.rand !== mijn.rand) {
      await kvDelete(sleutel);
      continue;
    }
    const iso = nu.toISOString();
    const boeking: Boeking = {
      ...v,
      id: `${jaar}-${nr}`,
      nummer: nummerVan(jaar, nr),
      status: "gereserveerd",
      prijsPerNachtCent: kamer?.prijsCent ?? null,
      gastGewistOp: null,
      gemaaktOp: iso,
      bijgewerktOp: iso,
    };
    await kvSet(sleutelBoeking(tenantId, boeking.id), boeking);
    await kvSet(sleutelTeller(tenantId, jaar), { n });
    // tweede controle (zie boven): staat er intussen een boeking met een lager nummer in dezelfde nachten, dan geven wij het op
    const eerder = botsingen(await leesBoekingen(tenantId), v.kamerId, v.aankomst, v.vertrek, boeking.id).find((b) => b.id < boeking.id);
    if (eerder) {
      await kvDelete(sleutelBoeking(tenantId, boeking.id));
      throw AppError.conflict(`Kamer ${kamer?.naam ?? ""} is net door iemand anders geboekt in deze nachten (boeking ${eerder.nummer}). Zoek opnieuw naar een vrije kamer.`);
    }
    return boeking;
  }
  throw AppError.conflict("Het volgnummer voor de boeking kon niet worden gemaakt. Probeer het zo opnieuw.");
}

/** De ingevulde velden van een boeking vervangen (kamer, nachten, gast, personen, opmerking, prijs). Status en nummer blijven. */
export async function wijzigBoeking(tenantId: string, id: string, uit: unknown, nu: Date = new Date()): Promise<Boeking> {
  const b = await leesBoeking(tenantId, id);
  if (!b) throw geenBoeking();
  if (b.status === "geannuleerd") throw AppError.conflict("Een geannuleerde boeking kan niet worden bewerkt. Zet hem eerst terug naar gereserveerd.");
  const v: BoekingInhoud = invoer(() => valideerBoeking(objectUit(uit), { gewist: b.gastGewistOp !== null }));
  const kamer = (await leesKamer(tenantId, v.kamerId)) ?? undefined;
  if (!kamer) throw geenKamer();
  const p = controleerPlaatsing(v, kamer, await leesBoekingen(tenantId), b.id);
  if (!p.ok) throw AppError.conflict(p.fout);
  const nieuw: Boeking = { ...b, ...v, prijsPerNachtCent: v.kamerId === b.kamerId ? b.prijsPerNachtCent : (kamer?.prijsCent ?? null), bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelBoeking(tenantId, id), nieuw);
  return nieuw;
}

/** Zet de status. Bij uitchecken wordt de kamer automatisch "vuil". Geeft de boeking en (bij uitchecken) de kamer terug. */
export async function zetStatus(tenantId: string, id: string, naar: BoekingStatus, nu: Date = new Date()): Promise<{ boeking: Boeking; kamer: Kamer | null }> {
  const b = await leesBoeking(tenantId, id);
  if (!b) throw geenBoeking();
  const kamer = (await leesKamer(tenantId, b.kamerId)) ?? undefined;
  const r = wisselStatus(b, naar, kamer, await leesBoekingen(tenantId), nu);
  if (!r.ok) throw AppError.validation(r.fout);
  if (r.waarde === b) return { boeking: b, kamer: kamer ?? null };
  await kvSet(sleutelBoeking(tenantId, id), r.waarde);
  let nieuweKamer: Kamer | null = kamer ?? null;
  if (naar === "uitgecheckt" && kamer) {
    nieuweKamer = { ...kamer, schoon: "vuil", bijgewerktOp: nu.toISOString() };
    await kvSet(sleutelKamer(tenantId, kamer.id), nieuweKamer);
  }
  return { boeking: r.waarde, kamer: nieuweKamer };
}

/** Naam, telefoon, e-mail en opmerking van de gast wissen. De boeking blijft bestaan. */
export async function wisGast(tenantId: string, id: string, nu: Date = new Date()): Promise<Boeking> {
  const b = await leesBoeking(tenantId, id);
  if (!b) throw geenBoeking();
  const nieuw = wisGastgegevens(b, nu);
  if (nieuw !== b) await kvSet(sleutelBoeking(tenantId, id), nieuw);
  return nieuw;
}

/** Wist de gastgegevens van alle uitgecheckte boekingen die langer dan twee jaar geleden zijn vertrokken. Geeft het aantal terug. */
export async function schoonNaBewaartermijn(tenantId: string, nu: Date = new Date()): Promise<number> {
  const lijst = teWissenNaBewaartermijn(await leesBoekingen(tenantId), amsterdamDayKey(nu));
  for (const b of lijst) await kvSet(sleutelBoeking(tenantId, b.id), wisGastgegevens(b, nu));
  return lijst.length;
}

/** Hoeveel boekingen er nu aan de bewaartermijn toe zijn (voor de melding in het scherm). */
export async function aantalTeSchonen(tenantId: string, nu: Date = new Date()): Promise<number> {
  return teWissenNaBewaartermijn(await leesBoekingen(tenantId), amsterdamDayKey(nu)).length;
}
