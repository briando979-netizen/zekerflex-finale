// ---------------------------------------------------------------------------
// Opslag van lidmaatschappen, in de KV-opslag per organisatie (geen migratie nodig):
//   lidmaatschappen:vorm:<tenantId>:<id>                   een vorm (abonnement of strippenkaart)
//   lidmaatschappen:lid:<tenantId>:<id>                    een lid
//   lidmaatschappen:lm:<tenantId>:<id>                     een lidmaatschap van een lid
//   lidmaatschappen:bezoek:<tenantId>:<lidId>~<tijd>~<x>   een bezoek (eigen sleutel, dus niemand overschrijft een ander)
//   lidmaatschappen:nr:<tenantId>:<nummer>~<x>             een claim op een lidnummer (blijft staan, ook na het wissen)
//   lidmaatschappen:teller:<tenantId>                      het laatst uitgegeven nummer (alleen een hint om snel te beginnen)
// Elke sleutel begint met het organisatie-id: wat bij een andere organisatie hoort, komt er nooit bij.
//
// Lidnummers (L-0001, L-0002, ...): de opslag kent geen vergrendeling en geen teller die atomair ophoogt, dus een teller
// alleen is niet genoeg: twee leden tegelijk zouden hetzelfde nummer krijgen. De aanpak:
//  1. de teller (en het aantal leden) geeft alleen een beginpunt;
//  2. per nummer schrijft iedereen zijn EIGEN claim (eigen sleutel, dus niemand overschrijft een ander);
//  3. na het schrijven lezen we alle claims op dat nummer terug: de eerste (op tijd, dan op willekeurig deel) wint, de
//     rest haalt zijn claim weg en probeert het volgende nummer.
// Een nummer waar al een claim op staat wordt overgeslagen, ook als het lid is gewist: een nummer komt nooit terug.
// Een restkans blijft bestaan als de ene claim later aankomt in de opslag dan een andere die later is gestart; de tijd
// van een claim is het moment vlak vóór het schrijven op dezelfde server, dus dat komt in de praktijk niet voor.
//
// Strippen: het aantal gebruikte strippen staat op het lidmaatschap, maar de waarheid is het aantal bezoeken in het
// logboek dat een strip kostte. Elk bezoek schrijft eerst zijn eigen regel, leest daarna alle regels van de kaart en haalt
// zijn regel weer weg als hij niet bij de eerste (tegoed) regels hoort, op tijd en dan op id (twee bezoeken op de laatste
// strip: dezelfde volgorde voor beide, dus één wint). Zo gaat het tegoed nooit onder nul, ook niet bij gelijktijdige
// bezoeken (en tegoed() rekent sowieso nooit onder nul). Komt er na het tellen nog een eerder gestart bezoek binnen, dan kan
// er in theorie één te veel op de kaart staan; het tegoed toont dan 0.
//
// Gegevens van leden zijn gegevens van derden: wisLid haalt naam, telefoon, e-mail en notitie overal weg. Lidmaatschappen
// en bezoeken bevatten geen persoonsgegevens (alleen het lid-id) en blijven als anonieme regels voor de cijfers.
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import {
  LM_ID,
  bezoekBlokkade,
  bouwLidmaatschap,
  kiesLidmaatschap,
  teWissenLeden,
  valideerLid,
  valideerVorm,
  vandaagVan,
  wijzigStatus,
  wisLidGegevens,
  type Bezoek,
  type Lid,
  type Lidmaatschap,
  type StatusActie,
  type Vorm,
} from "@/lib/lidmaatschappen/model";

const MAX_VORMEN = 200;
const MAX_LEDEN = 10_000;
const MAX_LIDMAATSCHAPPEN = 30_000;
const MAX_BEZOEKEN_PER_LID = 20_000;
const MAX_POGINGEN = 100;
export const LOGBOEK_AANTAL = 100;

/** Een nieuw id (12 hex-tekens). */
export const nieuwId = (): string => randomBytes(6).toString("hex");

const vVorm = (t: string) => `lidmaatschappen:vorm:${t}:`;
const vLid = (t: string) => `lidmaatschappen:lid:${t}:`;
const vLm = (t: string) => `lidmaatschappen:lm:${t}:`;
const vBezoek = (t: string, lidId: string) => `lidmaatschappen:bezoek:${t}:${lidId}~`;
const vClaim = (t: string, nr: string) => `lidmaatschappen:nr:${t}:${nr}~`;
const sleutelTeller = (t: string) => `lidmaatschappen:teller:${t}`;

const geenLid = () => AppError.notFound("Dit lid bestaat niet (meer).");
const geenVorm = () => AppError.notFound("Deze vorm bestaat niet (meer).");
const geenLm = () => AppError.notFound("Dit lidmaatschap bestaat niet (meer).");

const objectUit = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// --- vormen --------------------------------------------------------------------------

export async function leesVormen(tenantId: string): Promise<Vorm[]> {
  const lijst = await kvListValues<Vorm>(vVorm(tenantId), MAX_VORMEN);
  return lijst.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

export async function leesVorm(tenantId: string, id: string): Promise<Vorm | null> {
  if (!LM_ID.test(id)) return null;
  return kvGet<Vorm>(`${vVorm(tenantId)}${id}`);
}

export async function maakVorm(tenantId: string, invoer: unknown, nu: Date = new Date()): Promise<Vorm> {
  const v = valideerVorm(objectUit(invoer));
  if ((await leesVormen(tenantId)).length >= MAX_VORMEN) throw AppError.validation("Je hebt het maximale aantal vormen bereikt. Archiveer vormen die je niet meer gebruikt.");
  const vorm: Vorm = { id: nieuwId(), ...v, gearchiveerd: false, gemaaktOp: nu.toISOString() };
  await kvSet(`${vVorm(tenantId)}${vorm.id}`, vorm);
  return vorm;
}

/** Bewerkt een vorm. Bestaande lidmaatschappen houden de prijs en voorwaarden van het moment van afsluiten. */
export async function bewerkVorm(tenantId: string, id: string, invoer: unknown): Promise<Vorm> {
  const huidig = await leesVorm(tenantId, id);
  if (!huidig) throw geenVorm();
  const v = valideerVorm(objectUit(invoer));
  const nieuw: Vorm = { ...huidig, ...v };
  await kvSet(`${vVorm(tenantId)}${id}`, nieuw);
  return nieuw;
}

export async function zetVormArchief(tenantId: string, id: string, gearchiveerd: boolean): Promise<Vorm> {
  const huidig = await leesVorm(tenantId, id);
  if (!huidig) throw geenVorm();
  const nieuw: Vorm = { ...huidig, gearchiveerd };
  await kvSet(`${vVorm(tenantId)}${id}`, nieuw);
  return nieuw;
}

// --- leden ---------------------------------------------------------------------------

export async function leesLeden(tenantId: string): Promise<Lid[]> {
  return kvListValues<Lid>(vLid(tenantId), MAX_LEDEN);
}

export async function leesLid(tenantId: string, id: string): Promise<Lid | null> {
  if (!LM_ID.test(id)) return null;
  return kvGet<Lid>(`${vLid(tenantId)}${id}`);
}

interface Claim {
  rand: string;
  at: number;
}

/** Het moment vlak voor het schrijven van een claim; bewust niet `nu` van de aanroeper en niet `Date` (kan in tests bevroren zijn). */
const tijdstipNu = (): number => performance.timeOrigin + performance.now();

/** De claim die wint: de eerste in tijd, bij gelijke tijd het laagste willekeurige deel. */
const winnaar = (claims: Claim[]): Claim | undefined => [...claims].sort((a, b) => a.at - b.at || a.rand.localeCompare(b.rand))[0];

/** Het eerstvolgende vrije lidnummer van de organisatie en de claim erop (zie de uitleg bovenaan). */
async function claimNummer(tenantId: string): Promise<{ nummer: string; n: number }> {
  const teller = await kvGet<{ n: number }>(sleutelTeller(tenantId));
  const aantal = (await kvListEntries<Lid>(vLid(tenantId), MAX_LEDEN)).length;
  const begin = Math.max(typeof teller?.n === "number" ? teller.n : 0, aantal) + 1;
  const rand = randomBytes(5).toString("hex");
  for (let n = begin; n < begin + MAX_POGINGEN; n += 1) {
    const nummer = `L-${String(n).padStart(4, "0")}`;
    const voor = vClaim(tenantId, nummer);
    if ((await kvListEntries<Claim>(voor, 50)).length > 0) continue; // dit nummer is al van een ander
    const sleutel = `${voor}${rand}`;
    const mijn: Claim = { rand, at: tijdstipNu() };
    await kvSet(sleutel, mijn);
    const na = (await kvListEntries<Claim>(voor, 50)).map((e) => e.value);
    if (winnaar(na)?.rand !== mijn.rand) {
      await kvDelete(sleutel);
      continue;
    }
    return { nummer, n };
  }
  throw AppError.conflict("Het lidnummer kon niet worden gemaakt. Probeer het zo opnieuw.");
}

export async function maakLid(tenantId: string, invoer: unknown, nu: Date = new Date()): Promise<Lid> {
  const v = valideerLid(objectUit(invoer)); // een geboortedatum of ander veld wordt hier nooit overgenomen
  const { nummer, n } = await claimNummer(tenantId);
  const lid: Lid = { id: nieuwId(), nummer, ...v, laatstGezien: null, gewist: false, gewistOp: null, gemaaktOp: nu.toISOString() };
  await kvSet(`${vLid(tenantId)}${lid.id}`, lid);
  await kvSet(sleutelTeller(tenantId), { n });
  return lid;
}

export async function bewerkLid(tenantId: string, id: string, invoer: unknown): Promise<Lid> {
  const huidig = await leesLid(tenantId, id);
  if (!huidig) throw geenLid();
  if (huidig.gewist) throw AppError.conflict("De gegevens van dit lid zijn gewist en kunnen niet meer worden bewerkt.");
  const nieuw: Lid = { ...huidig, ...valideerLid(objectUit(invoer)) };
  await kvSet(`${vLid(tenantId)}${id}`, nieuw);
  return nieuw;
}

/** Naam, telefoon, e-mail en notitie wissen. Lidmaatschappen en bezoeken blijven als anonieme regels bestaan. */
export async function wisLid(tenantId: string, id: string, nu: Date = new Date()): Promise<Lid> {
  const huidig = await leesLid(tenantId, id);
  if (!huidig) throw geenLid();
  if (huidig.gewist) return huidig;
  const nieuw = wisLidGegevens(huidig, nu);
  await kvSet(`${vLid(tenantId)}${id}`, nieuw);
  return nieuw;
}

/** Wist alle leden die na de bewaartermijn aan de beurt zijn (zie teWissenLeden). Geeft het aantal terug. De cron is er nog niet. */
export async function wisVerlopenLeden(tenantId: string, nu: Date = new Date()): Promise<number> {
  const ids = teWissenLeden(await leesLeden(tenantId), await leesLidmaatschappen(tenantId), vandaagVan(nu));
  for (const id of ids) await wisLid(tenantId, id, nu);
  return ids.length;
}

// --- lidmaatschappen -------------------------------------------------------------------

export async function leesLidmaatschappen(tenantId: string): Promise<Lidmaatschap[]> {
  return kvListValues<Lidmaatschap>(vLm(tenantId), MAX_LIDMAATSCHAPPEN);
}

export async function leesLidmaatschap(tenantId: string, id: string): Promise<Lidmaatschap | null> {
  if (!LM_ID.test(id)) return null;
  return kvGet<Lidmaatschap>(`${vLm(tenantId)}${id}`);
}

export async function maakLidmaatschap(tenantId: string, invoer: unknown, nu: Date = new Date()): Promise<Lidmaatschap> {
  const o = objectUit(invoer);
  const lid = typeof o.lidId === "string" ? await leesLid(tenantId, o.lidId) : null;
  if (!lid) throw geenLid();
  if (lid.gewist) throw AppError.conflict("De gegevens van dit lid zijn gewist. Een gewist lid krijgt geen nieuw lidmaatschap.");
  const vorm = typeof o.vormId === "string" ? await leesVorm(tenantId, o.vormId) : null;
  if (!vorm) throw AppError.validation("Kies een vorm uit de lijst.");
  if (vorm.gearchiveerd) throw AppError.conflict("Deze vorm is gearchiveerd. Haal hem eerst terug of kies een andere.");
  const lm = bouwLidmaatschap(vorm, lid.id, nieuwId(), o.startdatum, nu);
  await kvSet(`${vLm(tenantId)}${lm.id}`, lm);
  return lm;
}

export async function wijzigLidmaatschap(tenantId: string, id: string, actie: StatusActie, nu: Date = new Date()): Promise<Lidmaatschap> {
  const lm = await leesLidmaatschap(tenantId, id);
  if (!lm) throw geenLm();
  const nieuw = wijzigStatus(lm, actie, nu);
  await kvSet(`${vLm(tenantId)}${id}`, nieuw);
  return nieuw;
}

// --- bezoeken --------------------------------------------------------------------------

async function bezoekRegels(tenantId: string, lidId: string): Promise<Bezoek[]> {
  return kvListValues<Bezoek>(vBezoek(tenantId, lidId), MAX_BEZOEKEN_PER_LID);
}

/** De laatste bezoeken van een lid, de nieuwste eerst (hoogstens 100). */
export async function logboek(tenantId: string, lidId: string, aantal = LOGBOEK_AANTAL): Promise<Bezoek[]> {
  if (!LM_ID.test(lidId)) return [];
  return (await bezoekRegels(tenantId, lidId)).sort((a, b) => b.op.localeCompare(a.op) || b.id.localeCompare(a.id)).slice(0, aantal);
}

/**
 * Een bezoek registreren: tijdstip van de server. Zonder gekozen lidmaatschap telt een lopend abonnement (er gaat geen
 * strip af), anders de strippenkaart die het eerst verloopt. Bij een strippenkaart gaat er één strip af; is die op, dan
 * wordt het bezoek geweigerd met een uitleg. Geeft het bezoek, het lid en het gebruikte lidmaatschap terug.
 */
export async function registreerBezoek(tenantId: string, lidId: string, invoer: unknown, door: string, nu: Date = new Date()): Promise<{ bezoek: Bezoek; lid: Lid; lidmaatschap: Lidmaatschap }> {
  const lid = await leesLid(tenantId, lidId);
  if (!lid) throw geenLid();
  if (lid.gewist) throw AppError.conflict("De gegevens van dit lid zijn gewist. Een gewist lid kan geen bezoek meer krijgen.");
  const vandaag = vandaagVan(nu);
  const eigen = (await leesLidmaatschappen(tenantId)).filter((l) => l.lidId === lid.id);
  const gekozen = objectUit(invoer).lidmaatschapId;
  let lm: Lidmaatschap;
  if (gekozen !== undefined && gekozen !== null && gekozen !== "") {
    const gevonden = typeof gekozen === "string" ? eigen.find((l) => l.id === gekozen) : undefined;
    if (!gevonden) throw AppError.notFound("Dit lidmaatschap hoort niet bij dit lid of bestaat niet (meer).");
    const blok = bezoekBlokkade(gevonden, vandaag);
    if (blok) throw AppError.conflict(blok);
    lm = gevonden;
  } else {
    const k = kiesLidmaatschap(eigen, vandaag);
    if ("fout" in k) throw AppError.conflict(k.fout);
    lm = k.lm;
  }
  const strip = lm.strippenBegin !== null;
  const sleutel = `${vBezoek(tenantId, lid.id)}${nu.toISOString()}~${randomBytes(3).toString("hex")}`;
  const bezoek: Bezoek = { id: sleutel.slice(vBezoek(tenantId, lid.id).length), lidId: lid.id, lidmaatschapId: lm.id, strip, op: nu.toISOString(), dag: vandaag, door };
  await kvSet(sleutel, bezoek);
  let lidmaatschap = lm;
  if (strip && lm.strippenBegin !== null) {
    // de eerste `strippenBegin` regels (op tijd, dan op id) winnen: schrijven er twee tegelijk, dan zien ze dezelfde volgorde
    const regels = (await bezoekRegels(tenantId, lid.id)).filter((b) => b.strip && b.lidmaatschapId === lm.id).sort((x, y) => x.op.localeCompare(y.op) || x.id.localeCompare(y.id));
    if (regels.findIndex((b) => b.id === bezoek.id) >= lm.strippenBegin) {
      await kvDelete(sleutel);
      throw AppError.conflict("Er is net een ander bezoek op deze strippenkaart gezet, waarna hij op is. Vernieuw de pagina.");
    }
    lidmaatschap = { ...lm, strippenGebruikt: Math.min(regels.length, lm.strippenBegin) };
    await kvSet(`${vLm(tenantId)}${lm.id}`, lidmaatschap);
  }
  // laatst gezien: het latere tijdstip wint, ook als twee bezoeken tegelijk binnenkomen
  const vers = (await leesLid(tenantId, lid.id)) ?? lid;
  const laatst = vers.laatstGezien && vers.laatstGezien > bezoek.op ? vers.laatstGezien : bezoek.op;
  const bijgewerkt: Lid = { ...vers, laatstGezien: laatst };
  await kvSet(`${vLid(tenantId)}${lid.id}`, bijgewerkt);
  return { bezoek, lid: bijgewerkt, lidmaatschap };
}
