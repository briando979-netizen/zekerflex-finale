// ---------------------------------------------------------------------------
// Opslag van werkbonnen, in de KV-opslag per organisatie (geen migratie nodig):
//   werkbonnen:item:<tenantId>:<jaar>-<nummer>     één werkbon
//   werkbonnen:nr:<tenantId>:<jaar>:<nummer>~<x>   een claim op een volgnummer (blijft staan, ook als de bon wordt verwijderd)
//   werkbonnen:teller:<tenantId>:<jaar>            het laatst uitgegeven nummer (alleen een hint om snel te beginnen)
//   werkbonnen:team:<tenantId>                     de namen van de medewerkers die het bedrijf zelf beheert
// Gegevens van klanten van een bedrijf (naam, telefoon, e-mail, adres) zijn gegevens van derden: een bedrijf kan ze per
// werkbon wissen (wisKlant); de bon blijft dan als lege regel staan, zodat uren en materialen kloppen.
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamParts } from "@/lib/time/amsterdam";
import {
  WERKBON_ID,
  filterBonnen,
  magVerwijderen,
  wisKlantgegevens,
  wisselStatus,
  type Werkbon,
  type WerkbonInhoud,
  type WerkbonStatus,
} from "@/lib/werkbonnen/model";

const MAX_BONNEN = 5_000;
const MAX_POGINGEN = 100;

/** Een kort willekeurig id voor een regel (hex, 8 tekens). */
export const nieuwId = (): string => randomBytes(4).toString("hex");

const voorvoegselItems = (t: string) => `werkbonnen:item:${t}:`;
const sleutelItem = (t: string, id: string) => `${voorvoegselItems(t)}${id}`;
const sleutelTeller = (t: string, jaar: number) => `werkbonnen:teller:${t}:${jaar}`;
const voorvoegselClaim = (t: string, jaar: number, nr: string) => `werkbonnen:nr:${t}:${jaar}:${nr}~`;
const sleutelTeam = (t: string) => `werkbonnen:team:${t}`;

// --- medewerkers --------------------------------------------------------------

export async function leesTeam(tenantId: string): Promise<string[]> {
  const v = await kvGet<{ namen: string[] }>(sleutelTeam(tenantId));
  return Array.isArray(v?.namen) ? v.namen : [];
}

export async function bewaarTeam(tenantId: string, namen: string[]): Promise<void> {
  await kvSet(sleutelTeam(tenantId), { namen });
}

// --- werkbonnen ---------------------------------------------------------------

export async function leesBon(tenantId: string, id: string): Promise<Werkbon | null> {
  if (!WERKBON_ID.test(id)) return null;
  return kvGet<Werkbon>(sleutelItem(tenantId, id));
}

/** Alle werkbonnen van een organisatie, gefilterd en met de nieuwste eerst. */
export async function lijstBonnen(tenantId: string, opties: { status?: WerkbonStatus | undefined; q?: string | undefined } = {}): Promise<Werkbon[]> {
  const alle = await kvListValues<Werkbon>(voorvoegselItems(tenantId), MAX_BONNEN);
  return filterBonnen(alle, opties);
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
 * Een werkbon maken met het eerstvolgende vrije nummer van het jaar (WB-2026-0001). De opslag kent geen vergrendeling en
 * geen teller die atomair ophoogt, dus een teller alleen is niet genoeg: twee bonnen tegelijk zouden dezelfde krijgen. De aanpak:
 *  1. de teller (en het aantal bonnen van dit jaar) geeft alleen een beginpunt;
 *  2. per nummer schrijft iedereen zijn EIGEN claim (eigen sleutel, dus niemand overschrijft een ander);
 *  3. na het schrijven lezen we alle claims op dat nummer terug: de eerste (op tijd, dan op willekeurig deel) wint,
 *     de rest haalt zijn claim weg en probeert het volgende nummer.
 * Een nummer waar al een claim op staat wordt overgeslagen, ook als de bon later is verwijderd: een nummer wordt nooit
 * opnieuw gebruikt. Wie tegelijk schrijft ziet na het schrijven altijd elkaars claim, dus er is één winnaar. Een rest-
 * kans blijft bestaan als de ene claim later aankomt in de opslag dan een andere die later is gestart; de tijd van een
 * claim is het moment vlak vóór het schrijven op dezelfde server, dus dat komt in de praktijk niet voor.
 */
export async function nieuweBon(tenantId: string, inhoud: WerkbonInhoud, nu: Date = new Date()): Promise<Werkbon> {
  const jaar = amsterdamParts(nu).year;
  const teller = await kvGet<{ n: number }>(sleutelTeller(tenantId, jaar));
  const ditJaar = await kvListEntries<Werkbon>(`${voorvoegselItems(tenantId)}${jaar}-`, MAX_BONNEN);
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
    const bon: Werkbon = { ...inhoud, id: `${jaar}-${nr}`, nummer: `WB-${jaar}-${nr}`, status: "nieuw", afgerondOp: null, gemaaktOp: iso, bijgewerktOp: iso };
    await kvSet(sleutelItem(tenantId, bon.id), bon);
    await kvSet(sleutelTeller(tenantId, jaar), { n });
    return bon;
  }
  throw AppError.conflict("Het volgnummer voor de werkbon kon niet worden gemaakt. Probeer het zo opnieuw.");
}

/** De ingevulde velden van een bon vervangen. Status, nummer en afrondtijd blijven zoals ze waren. */
export async function wijzigBon(tenantId: string, id: string, inhoud: WerkbonInhoud, nu: Date = new Date()): Promise<Werkbon> {
  const b = await leesBon(tenantId, id);
  if (!b) throw AppError.notFound("Deze werkbon bestaat niet (meer).");
  const nieuw: Werkbon = { ...b, ...inhoud, bijgewerktOp: nu.toISOString() };
  await kvSet(sleutelItem(tenantId, id), nieuw);
  return nieuw;
}

export async function zetStatus(tenantId: string, id: string, naar: WerkbonStatus, opties: { zonderUren?: boolean; nu?: Date } = {}): Promise<Werkbon> {
  const b = await leesBon(tenantId, id);
  if (!b) throw AppError.notFound("Deze werkbon bestaat niet (meer).");
  const r = wisselStatus(b, naar, { ...(opties.zonderUren === undefined ? {} : { zonderUren: opties.zonderUren }), nu: opties.nu ?? new Date() });
  if (!r.ok) throw r.code ? AppError.validation(r.fout, { code: r.code }) : AppError.validation(r.fout);
  if (r.waarde !== b) await kvSet(sleutelItem(tenantId, id), r.waarde);
  return r.waarde;
}

/** Verwijderen kan alleen bij nieuw of geannuleerd. Het nummer blijft vergeven (de claim blijft staan). */
export async function verwijderBon(tenantId: string, id: string): Promise<void> {
  const b = await leesBon(tenantId, id);
  if (!b) throw AppError.notFound("Deze werkbon bestaat niet (meer).");
  if (!magVerwijderen(b)) throw AppError.conflict("Een werkbon verwijderen kan alleen als hij nieuw of geannuleerd is. Annuleer hem eerst.");
  await kvDelete(sleutelItem(tenantId, id));
}

/** Naam, telefoon, e-mail en adres van de klant wissen. De werkbon blijft bestaan. */
export async function wisKlant(tenantId: string, id: string, nu: Date = new Date()): Promise<Werkbon> {
  const b = await leesBon(tenantId, id);
  if (!b) throw AppError.notFound("Deze werkbon bestaat niet (meer).");
  const nieuw = wisKlantgegevens(b, nu);
  await kvSet(sleutelItem(tenantId, id), nieuw);
  return nieuw;
}
