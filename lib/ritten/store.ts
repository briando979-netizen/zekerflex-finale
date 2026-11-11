// ---------------------------------------------------------------------------
// Opslag van ritten en voertuigen, in de KV-opslag per organisatie (geen migratie nodig):
//   ritten:rit:<tenantId>:<jaar>-<nummer>            één rit
//   ritten:nr:<tenantId>:<jaar>:<nummer>~<x>         een claim op een volgnummer (blijft staan, ook als de rit wordt verwijderd)
//   ritten:teller:<tenantId>:<jaar>                  het laatst uitgegeven nummer (alleen een hint om snel te beginnen)
//   ritten:voertuig:<tenantId>:<id>                  één voertuig
//   ritten:chauffeurs:<tenantId>                     de namen van de chauffeurs die het bedrijf zelf beheert
// Chauffeursnamen en klantnamen zijn persoonsgegevens: wisChauffeur vervangt een naam in alle ritten door "Verwijderd",
// wisKlant wist de klantnaam en de adressen van één rit.
// Een kenteken dat twee mensen op hetzelfde moment invoeren kan in theorie dubbel worden; dat is aanvaard. Voor de
// volgnummers van ritten is dat wel afgevangen (zie nieuweRit).
// Wat er niet in de lijst hoort (andere organisatie) komt er niet bij: elke sleutel begint met het organisatie-id.
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import {
  MAX_VOERTUIGEN,
  RIT_ID,
  VOERTUIG_ID,
  controleerChauffeurs,
  controleerKoppelingen,
  dubbeleBoekingen,
  kentekenBezet,
  magVerwijderen,
  ritJaar,
  valideerRit,
  valideerVoertuig,
  wisChauffeurInRit,
  wisKlantgegevens,
  wisselStatus,
  type Rit,
  type RitStatus,
  type Voertuig,
} from "@/lib/ritten/model";

const MAX_RITTEN = 5_000;
const MAX_POGINGEN = 100;

/** Een kort willekeurig id voor een voertuig (hex, 8 tekens). */
export const nieuwVoertuigId = (): string => randomBytes(4).toString("hex");

const voorvoegselRitten = (t: string) => `ritten:rit:${t}:`;
const sleutelRit = (t: string, id: string) => `${voorvoegselRitten(t)}${id}`;
const sleutelTeller = (t: string, jaar: number) => `ritten:teller:${t}:${jaar}`;
const voorvoegselClaim = (t: string, jaar: number, nr: string) => `ritten:nr:${t}:${jaar}:${nr}~`;
const voorvoegselVoertuigen = (t: string) => `ritten:voertuig:${t}:`;
const sleutelVoertuig = (t: string, id: string) => `${voorvoegselVoertuigen(t)}${id}`;
const sleutelChauffeurs = (t: string) => `ritten:chauffeurs:${t}`;

const ritNietGevonden = () => AppError.notFound("Deze rit bestaat niet (meer).");
const voertuigNietGevonden = () => AppError.notFound("Dit voertuig bestaat niet (meer).");

// --- chauffeurs ----------------------------------------------------------------

export async function leesChauffeurs(tenantId: string): Promise<string[]> {
  const v = await kvGet<{ namen: string[] }>(sleutelChauffeurs(tenantId));
  return Array.isArray(v?.namen) ? v.namen : [];
}

/** Bewaart de lijst (gecontroleerd). Een naam uit de lijst halen verandert de ritten niet: daarvoor is wisChauffeur. */
export async function bewaarChauffeurs(tenantId: string, invoer: unknown): Promise<string[]> {
  const r = controleerChauffeurs(invoer);
  if (!r.ok) throw AppError.validation(r.fout);
  await kvSet(sleutelChauffeurs(tenantId), { namen: r.waarde });
  return r.waarde;
}

/** Haalt de naam uit de lijst en vervangt hem in alle ritten door "Verwijderd". Geeft het aantal aangepaste ritten. */
export async function wisChauffeur(tenantId: string, naam: unknown, nu: Date = new Date()): Promise<{ ritten: number; chauffeurs: string[] }> {
  const n = typeof naam === "string" ? naam.trim() : "";
  if (!n) throw AppError.validation("Geef de naam van de chauffeur op.");
  const lijst = await leesChauffeurs(tenantId);
  const rest = lijst.filter((c) => c.toLowerCase() !== n.toLowerCase());
  const alle = await kvListEntries<Rit>(voorvoegselRitten(tenantId), MAX_RITTEN);
  let ritten = 0;
  for (const e of alle) {
    const nieuw = wisChauffeurInRit(e.value, n, nu);
    if (nieuw !== e.value) {
      await kvSet(e.key, nieuw);
      ritten += 1;
    }
  }
  if (rest.length === lijst.length && ritten === 0) throw AppError.notFound("Deze chauffeur staat niet in je lijst en komt in geen enkele rit voor.");
  await kvSet(sleutelChauffeurs(tenantId), { namen: rest });
  return { ritten, chauffeurs: rest };
}

// --- voertuigen -----------------------------------------------------------------

export async function leesVoertuigen(tenantId: string): Promise<Voertuig[]> {
  const lijst = await kvListValues<Voertuig>(voorvoegselVoertuigen(tenantId), MAX_VOERTUIGEN + 10);
  return lijst.sort((a, b) => a.kenteken.localeCompare(b.kenteken));
}

export async function leesVoertuig(tenantId: string, id: string): Promise<Voertuig | null> {
  if (!VOERTUIG_ID.test(id)) return null;
  return kvGet<Voertuig>(sleutelVoertuig(tenantId, id));
}

export async function maakVoertuig(tenantId: string, invoer: unknown, nu: Date = new Date()): Promise<Voertuig> {
  const r = valideerVoertuig(invoer);
  if (!r.ok) throw AppError.validation(r.fout);
  const bestaand = await leesVoertuigen(tenantId);
  if (bestaand.length >= MAX_VOERTUIGEN) throw AppError.validation(`Je hebt het maximale aantal voertuigen bereikt (${MAX_VOERTUIGEN}). Archiveer voertuigen die je niet meer gebruikt.`);
  if (kentekenBezet(r.waarde.kenteken, bestaand)) throw AppError.conflict("Dit kenteken is al in gebruik bij een ander voertuig (ook gearchiveerde tellen mee).");
  const iso = nu.toISOString();
  const v: Voertuig = { id: nieuwVoertuigId(), ...r.waarde, gearchiveerd: false, gemaaktOp: iso, bijgewerktOp: iso };
  await kvSet(sleutelVoertuig(tenantId, v.id), v);
  return v;
}

export async function bewerkVoertuig(tenantId: string, id: string, invoer: unknown, nu: Date = new Date()): Promise<Voertuig> {
  const huidig = await leesVoertuig(tenantId, id);
  if (!huidig) throw voertuigNietGevonden();
  const r = valideerVoertuig(invoer);
  if (!r.ok) throw AppError.validation(r.fout);
  if (kentekenBezet(r.waarde.kenteken, await leesVoertuigen(tenantId), id)) throw AppError.conflict("Dit kenteken is al in gebruik bij een ander voertuig (ook gearchiveerde tellen mee).");
  const nieuw: Voertuig = { ...huidig, ...r.waarde, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelVoertuig(tenantId, id), nieuw);
  return nieuw;
}

export async function zetVoertuigArchief(tenantId: string, id: string, gearchiveerd: boolean, nu: Date = new Date()): Promise<Voertuig> {
  const v = await leesVoertuig(tenantId, id);
  if (!v) throw voertuigNietGevonden();
  const nieuw: Voertuig = { ...v, gearchiveerd, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelVoertuig(tenantId, id), nieuw);
  return nieuw;
}

// --- ritten -----------------------------------------------------------------------

export async function leesRit(tenantId: string, id: string): Promise<Rit | null> {
  if (!RIT_ID.test(id)) return null;
  return kvGet<Rit>(sleutelRit(tenantId, id));
}

/** Alle ritten van een organisatie (ongefilterd, op begintijd). */
export async function lijstRitten(tenantId: string): Promise<Rit[]> {
  const alle = await kvListValues<Rit>(voorvoegselRitten(tenantId), MAX_RITTEN);
  return alle.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

interface Claim {
  rand: string;
  at: number;
}

/**
 * Het moment vlak voor het schrijven van een claim, in microseconden-nauwkeurige milliseconden. Bewust niet `nu` van de
 * aanroeper (dat is het begin van de aanvraag, niet het moment van schrijven) en niet `Date` (kan in tests bevroren zijn).
 */
const tijdstipNu = (): number => performance.timeOrigin + performance.now();

/** De claim die wint: de eerste in tijd, bij gelijke tijd het laagste willekeurige deel. */
const winnaar = (claims: Claim[]): Claim | undefined => [...claims].sort((a, b) => a.at - b.at || a.rand.localeCompare(b.rand))[0];

/**
 * Een rit maken met het eerstvolgende vrije nummer van het jaar (R-2026-0001). De opslag kent geen vergrendeling en geen
 * teller die atomair ophoogt, dus een teller alleen is niet genoeg: twee ritten tegelijk zouden dezelfde krijgen. De aanpak
 * (dezelfde als bij werkbonnen):
 *  1. de teller (en het aantal ritten van dit jaar) geeft alleen een beginpunt;
 *  2. per nummer schrijft iedereen zijn EIGEN claim (eigen sleutel, dus niemand overschrijft een ander);
 *  3. na het schrijven lezen we alle claims op dat nummer terug: de eerste (op tijd, dan op willekeurig deel) wint,
 *     de rest haalt zijn claim weg en probeert het volgende nummer.
 * Een nummer waar al een claim op staat wordt overgeslagen, ook als de rit later is verwijderd: een nummer wordt nooit
 * opnieuw gebruikt. Een restkans blijft bestaan als de ene claim later aankomt in de opslag dan een andere die later is
 * gestart; de tijd van een claim is het moment vlak vóór het schrijven op dezelfde server, dus dat komt in de praktijk
 * niet voor.
 * Geeft de rit en de waarschuwingen voor dubbele boekingen (waarschuwen, niet blokkeren).
 */
export async function nieuweRit(tenantId: string, invoer: unknown, nu: Date = new Date()): Promise<{ rit: Rit; waarschuwingen: string[] }> {
  const r = valideerRit(invoer);
  if (!r.ok) throw AppError.validation(r.fout);
  const [voertuigen, chauffeurs] = await Promise.all([leesVoertuigen(tenantId), leesChauffeurs(tenantId)]);
  const koppelfout = controleerKoppelingen(r.waarde, voertuigen, chauffeurs, null);
  if (koppelfout) throw AppError.validation(koppelfout);

  const jaar = ritJaar(nu);
  const teller = await kvGet<{ n: number }>(sleutelTeller(tenantId, jaar));
  const ditJaar = await kvListEntries<Rit>(`${voorvoegselRitten(tenantId)}${jaar}-`, MAX_RITTEN);
  if (ditJaar.length >= MAX_RITTEN) throw AppError.validation("Je hebt het maximale aantal ritten van dit jaar bereikt.");
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
    const rit: Rit = { ...r.waarde, id: `${jaar}-${nr}`, nummer: `R-${jaar}-${nr}`, status: "gepland", klantGewist: false, gemaaktOp: iso, bijgewerktOp: iso };
    await kvSet(sleutelRit(tenantId, rit.id), rit);
    await kvSet(sleutelTeller(tenantId, jaar), { n });
    return { rit, waarschuwingen: await waarschuwingenVoor(tenantId, rit.id, voertuigen) };
  }
  throw AppError.conflict("Het volgnummer voor de rit kon niet worden gemaakt. Probeer het zo opnieuw.");
}

/** De waarschuwingen voor dubbele boekingen van één rit, over alle ritten van de organisatie. */
async function waarschuwingenVoor(tenantId: string, ritId: string, voertuigen: Voertuig[]): Promise<string[]> {
  return dubbeleBoekingen(await lijstRitten(tenantId), voertuigen)[ritId] ?? [];
}

/** De ingevulde velden van een rit vervangen. Status, nummer en klantGewist blijven zoals ze waren. */
export async function wijzigRit(tenantId: string, id: string, invoer: unknown, nu: Date = new Date()): Promise<{ rit: Rit; waarschuwingen: string[] }> {
  const rit = await leesRit(tenantId, id);
  if (!rit) throw ritNietGevonden();
  const r = valideerRit(invoer, { klantGewist: rit.klantGewist });
  if (!r.ok) throw AppError.validation(r.fout);
  const [voertuigen, chauffeurs] = await Promise.all([leesVoertuigen(tenantId), leesChauffeurs(tenantId)]);
  const koppelfout = controleerKoppelingen(r.waarde, voertuigen, chauffeurs, rit);
  if (koppelfout) throw AppError.validation(koppelfout);
  const nieuw: Rit = { ...rit, ...r.waarde, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelRit(tenantId, id), nieuw);
  return { rit: nieuw, waarschuwingen: await waarschuwingenVoor(tenantId, id, voertuigen) };
}

export async function zetStatus(tenantId: string, id: string, naar: RitStatus, nu: Date = new Date()): Promise<{ rit: Rit; waarschuwingen: string[] }> {
  const rit = await leesRit(tenantId, id);
  if (!rit) throw ritNietGevonden();
  const r = wisselStatus(rit, naar, nu);
  if (!r.ok) throw AppError.validation(r.fout);
  if (r.waarde !== rit) await kvSet(sleutelRit(tenantId, id), r.waarde);
  return { rit: r.waarde, waarschuwingen: await waarschuwingenVoor(tenantId, id, await leesVoertuigen(tenantId)) };
}

/** Verwijderen kan alleen bij gepland of geannuleerd. Het nummer blijft vergeven (de claim blijft staan). */
export async function verwijderRit(tenantId: string, id: string): Promise<void> {
  const rit = await leesRit(tenantId, id);
  if (!rit) throw ritNietGevonden();
  if (!magVerwijderen(rit)) throw AppError.conflict("Een rit verwijderen kan alleen als hij nog gepland of geannuleerd is. Annuleer hem eerst.");
  await kvDelete(sleutelRit(tenantId, id));
}

/** De naam van de klant en de adressen van deze rit wissen. De rit blijft bestaan. */
export async function wisKlant(tenantId: string, id: string, nu: Date = new Date()): Promise<Rit> {
  const rit = await leesRit(tenantId, id);
  if (!rit) throw ritNietGevonden();
  const nieuw = wisKlantgegevens(rit, nu);
  await kvSet(sleutelRit(tenantId, id), nieuw);
  return nieuw;
}
