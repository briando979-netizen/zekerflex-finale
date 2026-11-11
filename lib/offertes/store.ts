// ---------------------------------------------------------------------------
// Opslag van offertes in de KV-opslag per organisatie (geen migratie nodig):
//   offertes:item:<tenantId>:<id>                    één offerte
//   offertes:token:<hash>                            de geheime link → welke offerte (de link zelf staat nergens)
//   offertes:nr:<tenantId>:<jaar>:<volgnr>:<id>      een geclaimd nummer (zie claimNummer)
// De klant van een offerte is een derde: `wisKlant` haalt zijn gegevens weg en maakt de link ongeldig.
// ---------------------------------------------------------------------------

import { createHmac, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamParts } from "@/lib/time/amsterdam";
import {
  OFFERTE_ID,
  TOKEN,
  intrekken as intrekkenRegel,
  kanBewerken,
  klantWissen,
  kopie as kopieRegel,
  nieuweLink as nieuweLinkRegel,
  nummerTekst,
  reageer as reageerRegel,
  versturen as verstuurRegel,
  type Offerte,
  type OfferteInhoud,
  type Uitkomst,
} from "@/lib/offertes/model";

const MAX_OFFERTES = 2_000;

/** Een kort willekeurig id: "o" + 12 hex. */
export const nieuwId = (): string => `o${randomBytes(6).toString("hex")}`;

/** De geheime link: 32 willekeurige tekens (192 bits), alleen te zien op het moment dat hij gemaakt wordt. */
export const nieuweToken = (): string => randomBytes(24).toString("base64url");

const geheim = (): string => process.env.AUTH_SECRET ?? "dev-secret";
/** De token wordt alleen als hash bewaard (HMAC met het geheim van de server), zoals bij de terminalsleutels. */
export const tokenHash = (token: string): string => createHmac("sha256", geheim()).update(`offerte-token:${token}`).digest("base64url");

const voorvoegselItems = (t: string) => `offertes:item:${t}:`;
const sleutelItem = (t: string, id: string) => `${voorvoegselItems(t)}${id}`;
const sleutelToken = (hash: string) => `offertes:token:${hash}`;

interface TokenVerwijzing {
  tenantId: string;
  id: string;
}
interface Claim {
  id: string;
  seq: number;
}

/** Werkt een offerte bij en geeft het AppError-equivalent van een mislukte overgang. */
function uitkomst<T>(u: Uitkomst<T>): T {
  if (u.ok) return u.waarde;
  throw u.code === "VERGRENDELD" || u.code === "STATUS" ? AppError.conflict(u.fout) : AppError.validation(u.fout);
}

// --- nummers --------------------------------------------------------------------

const pauze = (ms: number) => new Promise<void>((klaar) => setTimeout(klaar, ms));

/**
 * Het volgende nummer van dit jaar (OF-2026-0001), zonder vergrendeling. De opslag kent geen "schrijf alleen als de
 * sleutel nog niet bestaat", dus claimen we zo: elk volgnummer is een eigen sleutel mét het id van de offerte erin
 * (twee schrijvers overschrijven elkaar dus nooit). Na het schrijven kijken we wie dat volgnummer geclaimd heeft:
 *   - alleen wij: het nummer is van ons;
 *   - ook een ander: we trekken onze claim in, wachten een willekeurig moment en proberen het volgende volgnummer.
 * Dit kan niet dubbel gaan: als twee schrijvers allebei "alleen ik" zagen, dan ging elke lezing vóór de schrijfactie
 * van de ander, en dat is tegelijk onmogelijk (A schrijft < A leest < B schrijft < B leest < A schrijft). De prijs is
 * dat twee tegelijkertijd beide een nieuwe poging doen. Een verwijderd concept geeft zijn nummer niet vrij: nummers worden
 * niet hergebruikt, een gat in de reeks is dus mogelijk.
 */
export async function claimNummer(tenantId: string, id: string, nu: Date): Promise<string> {
  const jaar = amsterdamParts(nu).year;
  const voorvoegsel = `offertes:nr:${tenantId}:${jaar}:`;
  for (let poging = 0; poging < 8; poging++) {
    const bestaand = await kvListEntries<Claim>(voorvoegsel, 20_000);
    const seq = bestaand.reduce((m, e) => Math.max(m, e.value.seq), 0) + 1;
    const rij = `${voorvoegsel}${String(seq).padStart(5, "0")}:`;
    await kvSet(`${rij}${id}`, { id, seq } satisfies Claim);
    const claims = await kvListEntries<Claim>(rij, 50);
    if (claims.every((c) => c.value.id === id)) return nummerTekst(jaar, seq);
    await kvDelete(`${rij}${id}`);
    await pauze(5 + Math.floor(Math.random() * 60));
  }
  throw AppError.conflict("Er wordt druk offertes gemaakt. Probeer het over een moment opnieuw.");
}

// --- lezen -----------------------------------------------------------------------

export async function lijstOffertes(tenantId: string): Promise<Offerte[]> {
  const alle = await kvListValues<Offerte>(voorvoegselItems(tenantId), MAX_OFFERTES);
  return alle.sort((a, b) => b.gemaaktOp.localeCompare(a.gemaaktOp) || b.nummer.localeCompare(a.nummer));
}

export async function leesOfferte(tenantId: string, id: string): Promise<Offerte | null> {
  if (!OFFERTE_ID.test(id)) return null;
  return kvGet<Offerte>(sleutelItem(tenantId, id));
}

async function leesOfFout(tenantId: string, id: string): Promise<Offerte> {
  const o = await leesOfferte(tenantId, id);
  if (!o) throw AppError.notFound("Deze offerte bestaat niet (meer).");
  return o;
}

// --- maken en wijzigen -----------------------------------------------------------------

export async function maakOfferte(tenantId: string, inhoud: OfferteInhoud, nu: Date): Promise<Offerte> {
  if ((await kvListEntries<Offerte>(voorvoegselItems(tenantId), MAX_OFFERTES)).length >= MAX_OFFERTES) throw AppError.validation(`Je kunt hoogstens ${MAX_OFFERTES} offertes bewaren. Verwijder oude concepten.`);
  const id = nieuwId();
  const nummer = await claimNummer(tenantId, id, nu);
  const o: Offerte = { ...inhoud, id, nummer, status: "concept", bedrijfsnaam: "", gemaaktOp: nu.toISOString(), gewijzigdOp: nu.toISOString() };
  await kvSet(sleutelItem(tenantId, id), o);
  return o;
}

/** Een concept bewerken. Een offerte die al verstuurd of beantwoord is, geeft een nette fout. */
export async function bewerkOfferte(tenantId: string, id: string, inhoud: OfferteInhoud, nu: Date): Promise<Offerte> {
  const o = await leesOfFout(tenantId, id);
  uitkomst(kanBewerken(o));
  const nieuw: Offerte = { ...o, ...inhoud, gewijzigdOp: nu.toISOString() };
  await kvSet(sleutelItem(tenantId, id), nieuw);
  return nieuw;
}

/** Alleen een concept mag weg. Het nummer blijft geclaimd (geen hergebruik). */
export async function verwijderOfferte(tenantId: string, id: string): Promise<void> {
  const o = await leesOfFout(tenantId, id);
  if (o.status !== "concept") throw AppError.conflict("Alleen een concept kan verwijderd worden. Trek een verstuurde offerte eerst in.");
  await kvDelete(sleutelItem(tenantId, id));
}

/** Versturen: maakt de openbare link. De token komt alleen nu terug; daarna bestaat alleen de hash. */
export async function verstuurOfferte(tenantId: string, id: string, bedrijfsnaam: string, nu: Date): Promise<{ offerte: Offerte; token: string }> {
  const o = await leesOfFout(tenantId, id);
  const token = nieuweToken();
  const nieuw = uitkomst(verstuurRegel(o, tokenHash(token), bedrijfsnaam, nu));
  await kvSet(sleutelToken(tokenHash(token)), { tenantId, id } satisfies TokenVerwijzing);
  await kvSet(sleutelItem(tenantId, id), nieuw);
  return { offerte: nieuw, token };
}

/** Een nieuwe link voor een verstuurde offerte; de oude link is meteen ongeldig. */
export async function nieuweLinkOfferte(tenantId: string, id: string, nu: Date): Promise<{ offerte: Offerte; token: string }> {
  const o = await leesOfFout(tenantId, id);
  const token = nieuweToken();
  const nieuw = uitkomst(nieuweLinkRegel(o, tokenHash(token), nu));
  await kvSet(sleutelToken(tokenHash(token)), { tenantId, id } satisfies TokenVerwijzing);
  await kvSet(sleutelItem(tenantId, id), nieuw);
  if (o.tokenHash) await kvDelete(sleutelToken(o.tokenHash));
  return { offerte: nieuw, token };
}

export async function trekOfferteIn(tenantId: string, id: string, nu: Date): Promise<Offerte> {
  const o = await leesOfFout(tenantId, id);
  const nieuw = uitkomst(intrekkenRegel(o, nu));
  await kvSet(sleutelItem(tenantId, id), nieuw);
  if (o.tokenHash) await kvDelete(sleutelToken(o.tokenHash));
  return nieuw;
}

/** Een kopie als nieuwe versie (nieuw nummer, concept), ook van een vergrendelde offerte. */
export async function kopieerOfferte(tenantId: string, id: string, nu: Date): Promise<Offerte> {
  const o = await leesOfFout(tenantId, id);
  const nieuwId_ = nieuwId();
  const nummer = await claimNummer(tenantId, nieuwId_, nu);
  const k = kopieRegel(o, nieuwId_, nummer, nu);
  await kvSet(sleutelItem(tenantId, k.id), k);
  return k;
}

/** Klantgegevens wissen (recht op vergetelheid): de gegevens weg en de link ongeldig. De status en de bedragen blijven. */
export async function wisKlant(tenantId: string, id: string, nu: Date): Promise<Offerte> {
  const o = await leesOfFout(tenantId, id);
  const nieuw = klantWissen(o, nu);
  await kvSet(sleutelItem(tenantId, id), nieuw);
  if (o.tokenHash) await kvDelete(sleutelToken(o.tokenHash));
  return nieuw;
}

// --- de klant via de link -------------------------------------------------------------------

/**
 * De offerte bij een link, alleen als de link nog geldt: de token moet kloppen, de hash moet nog de huidige zijn (een
 * ingetrokken of vervangen link is dood) en de offerte moet verstuurd of beantwoord zijn. Anders null: voor de klant is
 * "bestaat niet" en "ingetrokken" bewust niet te onderscheiden.
 */
export async function offerteVanToken(token: string): Promise<{ tenantId: string; offerte: Offerte } | null> {
  if (typeof token !== "string" || !TOKEN.test(token)) return null;
  const hash = tokenHash(token);
  const verwijzing = await kvGet<TokenVerwijzing>(sleutelToken(hash));
  if (!verwijzing) return null;
  const o = await leesOfferte(verwijzing.tenantId, verwijzing.id);
  if (!o || o.tokenHash !== hash || o.status === "concept") return null;
  return { tenantId: verwijzing.tenantId, offerte: o };
}

/**
 * De klant accepteert of wijst af. Een tweede reactie (of een reactie op een verlopen offerte) geeft een conflict.
 * Eén beperking: de opslag heeft geen vergrendeling, dus twee reacties in dezelfde milliseconde kunnen elkaar overschrijven;
 * dat moment is zo klein dat we het aanvaarden.
 */
export async function reageerOpToken(token: string, keuze: "geaccepteerd" | "afgewezen", naam: string, reden: string, nu: Date): Promise<Offerte | null> {
  const gevonden = await offerteVanToken(token);
  if (!gevonden) return null;
  const nieuw = uitkomst(reageerRegel(gevonden.offerte, keuze, naam, reden, nu));
  await kvSet(sleutelItem(gevonden.tenantId, nieuw.id), nieuw);
  return nieuw;
}
