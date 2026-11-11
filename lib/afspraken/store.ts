// ---------------------------------------------------------------------------
// Opslag van afspraken en klantenkaart, in de KV-opslag per organisatie (geen migratie nodig):
//   afspraken:inst:<tenantId>                  de instellingen van het bedrijf
//   afspraken:slug:<slug>                      welke organisatie bij een boekadres hoort
//   afspraken:item:<tenantId>:<dag>~<id>       één afspraak; de dag staat in de sleutel, een dag is zo in één keer op te halen
//   afspraken:klant:<tenantId>:<sleutel>       de notitie bij een klant
// Gegevens van klanten van een bedrijf (naam, telefoon, e-mail) zijn gegevens van derden: een bedrijf kan een klant
// helemaal laten wissen (verwijderKlant), na 2 jaar worden ze vanzelf gewist (lib/afspraken/bewaren.ts) en de boekpagina
// zegt vooraf waar de gegevens heen gaan.
// Deze sleutels horen van een organisatie, niet van één gebruiker: daarom staan ze bewust NIET in ERASABLE_KV_PREFIXES
// (lib/privacy/user-kv.ts, dat wist per gebruiker bij het sluiten van een account). Ze gaan weg met de organisatie
// (wisAfsprakenVanOrganisatie, aangeroepen vanuit anonymizeUser als de laatste beheerder vertrekt).
// ---------------------------------------------------------------------------

import { createHmac, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvDeleteStale, kvFindDue, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import {
  AFSPRAAK_ID,
  DAG_SLEUTEL,
  SLUG as SLUG_VORM,
  annuleerBezwaar,
  bezet,
  eindVan,
  heeftPersoon,
  isVrij,
  klantSleutel,
  klantenUit,
  schoneTekst,
  zonderPersoon,
  type Afspraak,
  type AfspraakStatus,
  type AnnuleerBezwaar,
  type Instellingen,
  type Klant,
  type KlantKaart,
} from "@/lib/afspraken/model";

/** Zoveel afspraken (of notities) leest een volledige lijst hooguit; bij meer meldt het scherm dat de lijst niet compleet is. */
export const MAX_LIJST = 50_000;
/** Het hoogste aantal dagen in één agenda-opvraag (de route begrenst op 62 dagen na de eerste: 63 dagen). */
const MAX_DAGEN = 63;
const PAGINA = 500;

/**
 * Alle rijen onder een voorvoegsel, in pagina's van 500 op sleutel (dus stabiel, ook als er tussendoor iets wordt
 * geschreven). `veld`/`grens` is een filter dat altijd waar moet zijn voor een geldige rij (kvFindDue is het enige
 * pagineren dat de opslag kent). Stopt bij `max` rijen en zegt dan eerlijk of er nog meer waren: nooit stil iets weglaten.
 */
export async function alleRijen<T>(voorvoegsel: string, veld: string, grens: string, max: number = MAX_LIJST): Promise<{ rijen: { key: string; value: T }[]; afgekapt: boolean }> {
  const rijen: { key: string; value: T }[] = [];
  let na = "";
  for (;;) {
    const vraag = Math.min(PAGINA, max - rijen.length);
    if (vraag <= 0) {
      const meer = await kvFindDue<T>(voorvoegsel, veld, grens, na, 1);
      return { rijen, afgekapt: meer.length > 0 };
    }
    const pagina = await kvFindDue<T>(voorvoegsel, veld, grens, na, vraag);
    rijen.push(...pagina);
    const laatste = pagina[pagina.length - 1];
    if (pagina.length < vraag || !laatste) return { rijen, afgekapt: false };
    na = laatste.key;
  }
}

/** Een kort willekeurig id voor een dienst of medewerker (hex, 8 tekens). */
export const nieuwId = (): string => randomBytes(4).toString("hex");

const sleutelInst = (t: string) => `afspraken:inst:${t}`;
const sleutelSlug = (s: string) => `afspraken:slug:${s}`;
const voorvoegselItems = (t: string) => `afspraken:item:${t}:`;
const sleutelItem = (t: string, id: string) => `${voorvoegselItems(t)}${id}`;
const sleutelKlant = (t: string, k: string) => `afspraken:klant:${t}:${k}`;

// --- instellingen ------------------------------------------------------------

export async function leesInstellingen(tenantId: string): Promise<Instellingen | null> {
  return kvGet<Instellingen>(sleutelInst(tenantId));
}

/** Bewaart de instellingen. Het boekadres is van één organisatie tegelijk; een nieuw adres maakt het oude weer vrij. */
export async function bewaarInstellingen(tenantId: string, waarde: Instellingen): Promise<void> {
  const eigenaar = await kvGet<{ tenantId: string }>(sleutelSlug(waarde.slug));
  if (eigenaar && eigenaar.tenantId !== tenantId) throw AppError.conflict("Dit adres is al van een ander bedrijf. Kies een ander adres voor je boekpagina.");
  const oud = await leesInstellingen(tenantId);
  await kvSet(sleutelSlug(waarde.slug), { tenantId });
  await kvSet(sleutelInst(tenantId), waarde);
  if (oud && oud.slug !== waarde.slug) {
    const van = await kvGet<{ tenantId: string }>(sleutelSlug(oud.slug));
    if (van?.tenantId === tenantId) await kvDelete(sleutelSlug(oud.slug));
  }
}

/** De boekpagina van een bedrijf, alleen als hij openstaat voor klanten. */
export async function openInstellingenVanSlug(slug: string): Promise<{ tenantId: string; instellingen: Instellingen } | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return null;
  const eigenaar = await kvGet<{ tenantId: string }>(sleutelSlug(slug));
  if (!eigenaar) return null;
  const instellingen = await leesInstellingen(eigenaar.tenantId);
  return instellingen && instellingen.actief && instellingen.slug === slug ? { tenantId: eigenaar.tenantId, instellingen } : null;
}

// --- afspraken ---------------------------------------------------------------

export async function afsprakenVanDag(tenantId: string, dag: string): Promise<Afspraak[]> {
  if (!DAG_SLEUTEL.test(dag)) return [];
  return kvListValues<Afspraak>(`${voorvoegselItems(tenantId)}${dag}~`, 500);
}

/**
 * Alle afspraken tussen twee dagen (allebei inbegrepen), op tijd. De dagen worden één voor één opgehaald (de dag staat in
 * de sleutel), zodat een drukke zaak met veel afspraken buiten de gevraagde week er niets van merkt. Hooguit 63 dagen.
 */
export async function afsprakenTussen(tenantId: string, vanDag: string, totDag: string): Promise<Afspraak[]> {
  if (!DAG_SLEUTEL.test(vanDag) || !DAG_SLEUTEL.test(totDag) || totDag < vanDag) return [];
  const [j, m, d] = vanDag.split("-").map(Number) as [number, number, number];
  const dagen: string[] = [];
  for (let n = 0; n < MAX_DAGEN; n += 1) {
    const dag = new Date(Date.UTC(j, m - 1, d + n)).toISOString().slice(0, 10);
    if (dag > totDag) break;
    dagen.push(dag);
  }
  const uit: Afspraak[] = [];
  for (let i = 0; i < dagen.length; i += 7) {
    const week = await Promise.all(dagen.slice(i, i + 7).map((dag) => afsprakenVanDag(tenantId, dag)));
    for (const dag of week) uit.push(...dag);
  }
  return uit.sort((a, b) => a.start.localeCompare(b.start));
}

/** Alle afspraken van een organisatie met hun sleutel (in pagina's, met een eerlijke melding als de grens bereikt is). */
async function alleAfspraken(tenantId: string, max: number = MAX_LIJST) {
  return alleRijen<Afspraak>(voorvoegselItems(tenantId), "gemaaktOp", "9999", max);
}

export interface BoekInvoer {
  dienstId: string;
  medewerkerId: string;
  start: Date;
  klant: Klant;
  opmerking: string;
  bron: "online" | "balie";
}

const overlapt = (a: Afspraak, b: Afspraak) => new Date(a.start).getTime() < new Date(b.eind).getTime() && new Date(a.eind).getTime() > new Date(b.start).getTime();

/**
 * Een afspraak maken. De server controleert zelf of de tijd vrij is (dezelfde regels als de boekpagina), want de klant
 * wordt niet vertrouwd. De opslag kent geen echte vergrendeling: schrijven twee klanten tegelijk dezelfde tijd, dan
 * kijken we na het schrijven nog één keer; de afspraak die het eerst werd gemaakt blijft, de ander krijgt "net bezet".
 * `bron: "balie"` (het bedrijf zelf, bijvoorbeeld na een telefoontje) negeert de voorlooptijd.
 */
export async function boek(tenantId: string, i: Instellingen, invoer: BoekInvoer, nu: Date = new Date()): Promise<Afspraak> {
  const dienst = i.diensten.find((d) => d.id === invoer.dienstId);
  const medewerker = i.medewerkers.find((m) => m.id === invoer.medewerkerId);
  if (!dienst || !medewerker) throw AppError.validation("Kies een dienst en een medewerker uit de lijst.");
  const dag = amsterdamDayKey(invoer.start);
  const bestaand = await afsprakenVanDag(tenantId, dag);
  const handmatig = invoer.bron === "balie";
  if (!isVrij(i, { dienstId: dienst.id, medewerkerId: medewerker.id, start: invoer.start, afspraken: bestaand, nu, ...(handmatig ? { metVoorlooptijd: false } : {}) })) {
    throw AppError.conflict("Deze tijd is net bezet of niet meer beschikbaar. Kies een andere tijd.");
  }
  const afspraak: Afspraak = {
    id: `${dag}~${randomBytes(5).toString("hex")}`,
    dienstId: dienst.id,
    dienstNaam: dienst.naam,
    duurMin: dienst.duurMin,
    prijsCent: dienst.prijsCent,
    medewerkerId: medewerker.id,
    medewerkerNaam: medewerker.naam,
    start: invoer.start.toISOString(),
    eind: eindVan(invoer.start, dienst.duurMin).toISOString(),
    klant: invoer.klant,
    opmerking: schoneTekst(invoer.opmerking, 300),
    status: "bevestigd",
    bron: invoer.bron,
    gemaaktOp: nu.toISOString(),
  };
  await kvSet(sleutelItem(tenantId, afspraak.id), afspraak);
  // na het schrijven nog één keer kijken of een ander tegelijk dezelfde tijd nam
  const na = await afsprakenVanDag(tenantId, dag);
  const eerder = na.find((a) => a.id !== afspraak.id && a.medewerkerId === afspraak.medewerkerId && bezet(a) && overlapt(a, afspraak) && (a.gemaaktOp < afspraak.gemaaktOp || (a.gemaaktOp === afspraak.gemaaktOp && a.id < afspraak.id)));
  if (eerder) {
    await kvDelete(sleutelItem(tenantId, afspraak.id));
    throw AppError.conflict("Deze tijd is net bezet geraakt. Kies een andere tijd.");
  }
  return afspraak;
}

export async function leesAfspraak(tenantId: string, id: string): Promise<Afspraak | null> {
  if (!AFSPRAAK_ID.test(id)) return null;
  return kvGet<Afspraak>(sleutelItem(tenantId, id));
}

export async function zetStatus(tenantId: string, id: string, status: AfspraakStatus): Promise<Afspraak> {
  const a = await leesAfspraak(tenantId, id);
  if (!a) throw AppError.notFound("Deze afspraak bestaat niet (meer).");
  const nieuw: Afspraak = { ...a, status };
  await kvSet(sleutelItem(tenantId, id), nieuw);
  return nieuw;
}

// --- annuleerlink en herinnering (de klant zelf) -------------------------------

/** De geheime link: 32 willekeurige tekens (192 bits), alleen te zien op het moment dat hij gemaakt wordt. */
export const nieuweToken = (): string => randomBytes(24).toString("base64url");
export const TOKEN_VORM = /^[A-Za-z0-9_-]{24,64}$/;
const geheim = (): string => process.env.AUTH_SECRET ?? "dev-secret";
/** De link wordt alleen als hash bewaard (HMAC met het geheim van de server): wie de opslag leest, kan er niets mee. */
export const tokenHash = (token: string): string => createHmac("sha256", geheim()).update(`afspraak-token:${token}`).digest("base64url");

// afspraken:tok:<tenantId>:<hash>   {id}                 van een link naar zijn afspraak
// afspraken:rem:<tenantId>:<id>     {tenantId, id, start} wacht op een herinnering; zo hoeft de cron niet alle afspraken door
const voorvoegselTok = (t: string) => `afspraken:tok:${t}:`;
const voorvoegselRem = (t: string) => `afspraken:rem:${t}:`;
const sleutelRem = (t: string, id: string) => `${voorvoegselRem(t)}${id}`;
export const VOORVOEGSEL_REM = "afspraken:rem:";
/** Het wachtrijtje van de herinneringen. */
export interface HerinneringRij {
  tenantId: string;
  id: string;
  start: string;
}

/**
 * Maakt een nieuwe geheime annuleerlink voor deze afspraak en geeft de token terug (nergens bewaard behalve als hash).
 * Null als de afspraak niet (meer) bestaat of zijn gegevens gewist zijn. Elke link blijft geldig (bevestiging en
 * herinnering hebben er elk een); er worden er hooguit 4 bewaard.
 */
export async function geefAnnuleerToken(tenantId: string, id: string): Promise<string | null> {
  const a = await leesAfspraak(tenantId, id);
  if (!a || !heeftPersoon(a)) return null;
  const token = nieuweToken();
  const hash = tokenHash(token);
  await kvSet(`${voorvoegselTok(tenantId)}${hash}`, { id });
  await kvSet(sleutelItem(tenantId, id), { ...a, tokenHashes: [...(a.tokenHashes ?? []), hash].slice(-4) } satisfies Afspraak);
  return token;
}

/** Trekt een link in die net gemaakt is maar waarvan de mail niet wegging (anders hoopt elke mislukte poging een nieuwe link op). */
export async function trekTokenIn(tenantId: string, id: string, token: string): Promise<void> {
  const hash = tokenHash(token);
  await kvDelete(`${voorvoegselTok(tenantId)}${hash}`);
  const a = await leesAfspraak(tenantId, id);
  if (a?.tokenHashes?.includes(hash)) await kvSet(sleutelItem(tenantId, id), { ...a, tokenHashes: a.tokenHashes.filter((h) => h !== hash) } satisfies Afspraak);
}

/**
 * Claimt de herinnering van een afspraak: zet de vlag alleen als hij nog niet stond, op de versie die nu in de opslag staat.
 * Geeft die afspraak terug, of null als de herinnering al gestuurd is (of de afspraak weg is). Met `aan: false` haalt hij
 * de vlag weer weg (de mail mislukte).
 */
export async function zetHerinneringVlag(tenantId: string, id: string, aan: boolean): Promise<Afspraak | null> {
  const a = await leesAfspraak(tenantId, id);
  if (!a) return null;
  if (aan && a.herinneringVerstuurd === true) return null;
  const { herinneringVerstuurd: _oud, ...rest } = a;
  void _oud;
  const nieuw: Afspraak = aan ? { ...rest, herinneringVerstuurd: true } : rest;
  await kvSet(sleutelItem(tenantId, id), nieuw);
  return nieuw;
}

/** Zet de afspraak in het wachtrijtje voor zijn herinnering. */
export async function planHerinnering(tenantId: string, a: Afspraak): Promise<void> {
  await kvSet(sleutelRem(tenantId, a.id), { tenantId, id: a.id, start: a.start } satisfies HerinneringRij);
}
export async function wisHerinneringRij(tenantId: string, id: string): Promise<void> {
  await kvDelete(sleutelRem(tenantId, id));
}

/** Haalt de links en het wachtrijtje van een afspraak weg (bij wissen van de klant of na de bewaartermijn). */
export async function wisToegang(tenantId: string, a: Pick<Afspraak, "id" | "tokenHashes">): Promise<void> {
  for (const h of a.tokenHashes ?? []) await kvDelete(`${voorvoegselTok(tenantId)}${h}`);
  await wisHerinneringRij(tenantId, a.id);
}

export interface AfspraakVanLink {
  tenantId: string;
  instellingen: Instellingen;
  afspraak: Afspraak;
}

/**
 * De afspraak bij een link, of null: onbekend, verkeerde vorm, ander bedrijf, gewist. Altijd hetzelfde "niets", zodat een
 * bezoeker nooit kan zien waarom. De boekpagina hoeft niet open te staan: ook als het bedrijf online boeken uitzet, kan
 * een klant zijn bestaande afspraak nog annuleren.
 */
export async function afspraakVanLink(slug: string, token: string): Promise<AfspraakVanLink | null> {
  if (typeof token !== "string" || !TOKEN_VORM.test(token) || !SLUG_VORM.test(slug)) return null;
  const eigenaar = await kvGet<{ tenantId: string }>(sleutelSlug(slug));
  if (!eigenaar) return null;
  const instellingen = await leesInstellingen(eigenaar.tenantId);
  if (!instellingen || instellingen.slug !== slug) return null;
  const hash = tokenHash(token);
  const rij = await kvGet<{ id: string }>(`${voorvoegselTok(eigenaar.tenantId)}${hash}`);
  if (!rij) return null;
  const afspraak = await leesAfspraak(eigenaar.tenantId, rij.id);
  // de hash moet ook echt bij de afspraak staan: een gewiste afspraak (zonderPersoon) heeft hem niet meer
  if (!afspraak || !(afspraak.tokenHashes ?? []).includes(hash)) return null;
  return { tenantId: eigenaar.tenantId, instellingen, afspraak };
}

export type AnnuleerUitslag = { uitslag: "geannuleerd"; tenantId: string; afspraak: Afspraak; instellingen: Instellingen } | { uitslag: "geweigerd"; reden: AnnuleerBezwaar; instellingen: Instellingen } | { uitslag: "onbekend" };

/** Annuleert met de link van de klant, als de regels het toelaten. De tijd komt vrij (een geannuleerde afspraak telt niet als bezet). */
export async function annuleerMetLink(slug: string, token: string, nu: Date = new Date()): Promise<AnnuleerUitslag> {
  const gevonden = await afspraakVanLink(slug, token);
  if (!gevonden) return { uitslag: "onbekend" };
  const { tenantId, instellingen, afspraak } = gevonden;
  const reden = annuleerBezwaar(afspraak, instellingen, nu);
  if (reden) return { uitslag: "geweigerd", reden, instellingen };
  const nieuw = await zetStatus(tenantId, afspraak.id, "geannuleerd");
  await wisHerinneringRij(tenantId, afspraak.id);
  return { uitslag: "geannuleerd", tenantId, afspraak: nieuw, instellingen };
}

// --- klantenkaart ------------------------------------------------------------

interface Notitie {
  sleutel: string;
  notitie: string;
}

export async function notitiesVan(tenantId: string): Promise<{ notities: Map<string, string>; afgekapt: boolean }> {
  // sleutels beginnen met "e-" of "t-": elke geldige notitie is kleiner dan "zzzz"
  const { rijen, afgekapt } = await alleRijen<Notitie>(`afspraken:klant:${tenantId}:`, "sleutel", "zzzz");
  return { notities: new Map(rijen.map((e) => [e.value.sleutel, e.value.notitie])), afgekapt };
}

/**
 * Alle klanten met hun geschiedenis in cijfers. `afgekapt`: er zijn meer afspraken (of notities) dan er in één lijst
 * passen; de lijst is dan niet compleet en het scherm moet dat zeggen.
 */
export async function klantenLijst(tenantId: string, nu: Date = new Date()): Promise<{ klanten: KlantKaart[]; afgekapt: boolean }> {
  const [afspraken, notities] = await Promise.all([alleAfspraken(tenantId), notitiesVan(tenantId)]);
  return { klanten: klantenUit(afspraken.rijen.map((r) => r.value), notities.notities, nu), afgekapt: afspraken.afgekapt || notities.afgekapt };
}

/** Alle afspraken van één klant, de nieuwste eerst. `afgekapt`: zie klantenLijst. */
export async function afsprakenVanKlant(tenantId: string, sleutel: string): Promise<{ afspraken: Afspraak[]; afgekapt: boolean }> {
  const { rijen, afgekapt } = await alleAfspraken(tenantId);
  return { afspraken: rijen.map((r) => r.value).filter((a) => klantSleutel(a.klant) === sleutel).sort((a, b) => b.start.localeCompare(a.start)), afgekapt };
}

export async function bewaarNotitie(tenantId: string, sleutel: string, notitie: string): Promise<void> {
  const schoon = schoneTekst(notitie, 1_000);
  if (!schoon) {
    await kvDelete(sleutelKlant(tenantId, sleutel));
    return;
  }
  await kvSet(sleutelKlant(tenantId, sleutel), { sleutel, notitie: schoon } satisfies Notitie);
}

/**
 * Alles van een organisatie wissen: de instellingen, het boekadres, alle afspraken en alle klantnotities. Voor als de
 * organisatie niet meer bestaat (de laatste beheerder is gewist): de klanten van dat bedrijf hebben dan niemand meer
 * die verantwoordelijk is voor hun gegevens. Geeft terug hoeveel rijen er weg zijn.
 */
export async function wisAfsprakenVanOrganisatie(tenantId: string, nu: Date = new Date()): Promise<number> {
  // een echt organisatie-id: zo kan een leeg of vreemd id nooit een te breed voorvoegsel worden
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(tenantId)) throw AppError.validation("Dit is geen geldige organisatie.");
  const tot = new Date(nu.getTime() + 60_000);
  let aantal = 0;
  aantal += await kvDeleteStale(voorvoegselItems(tenantId), tot);
  aantal += await kvDeleteStale(`afspraken:klant:${tenantId}:`, tot);
  aantal += await kvDeleteStale(voorvoegselTok(tenantId), tot);
  aantal += await kvDeleteStale(voorvoegselRem(tenantId), tot);
  const i = await leesInstellingen(tenantId);
  if (i) {
    const van = await kvGet<{ tenantId: string }>(sleutelSlug(i.slug));
    if (van?.tenantId === tenantId) await kvDelete(sleutelSlug(i.slug));
    await kvDelete(sleutelInst(tenantId));
    aantal += 1;
  }
  return aantal;
}

/**
 * Een klant helemaal wissen (recht op vergetelheid): de notitie weg en alle persoonsgegevens uit zijn afspraken. De
 * afspraken zelf blijven als lege regel bestaan (dienst, tijd, status), zodat de agenda en de cijfers van het bedrijf kloppen.
 */
export async function verwijderKlant(tenantId: string, sleutel: string): Promise<number> {
  // wissen moet compleet zijn: een veel hogere grens, en bij nog meer liever een fout dan stil gegevens laten staan
  const { rijen, afgekapt } = await alleAfspraken(tenantId, MAX_LIJST * 4);
  if (afgekapt) throw AppError.conflict("Er zijn te veel afspraken om deze klant in één keer te wissen. Neem contact op met ZekerFlex.");
  let aantal = 0;
  for (const e of rijen) {
    if (klantSleutel(e.value.klant) !== sleutel) continue;
    await kvSet(e.key, zonderPersoon(e.value));
    // en de annuleerlinks en het herinneringsrijtje van deze klant: de mail van vroeger geeft niets meer te zien
    await wisToegang(tenantId, e.value);
    aantal += 1;
  }
  await kvDelete(sleutelKlant(tenantId, sleutel));
  return aantal;
}
