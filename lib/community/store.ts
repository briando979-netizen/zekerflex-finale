import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvGetMany, kvListEntries, kvListValues, kvSet, kvSetIfAbsent, kvVervangAlsVeld } from "@/lib/storage/kv";
import { amsterdamDayKey, amsterdamStartOfDay } from "@/lib/time/amsterdam";
import {
  GRENZEN,
  WELKOM,
  WELKOM_ID,
  alGemeld,
  daggrensTekst,
  maakSlug,
  moetVerbergen,
  onderwerpPad,
  telOp,
  type Bericht,
  type Categorie,
  type DagTeller,
  type MeldReden,
  type Onderwerp,
  type Reactie,
  type ReactieLijst,
} from "@/lib/community/regels";

// ---------------------------------------------------------------------------
// De opslag van de community (lib/community/regels.ts): KeyValueStore in Postgres, geen eigen tabel.
//   community-onderwerp:<id>          → Onderwerp (zonder reacties; het overzicht leest alleen deze)
//   community-reacties:<onderwerpId>  → ReactieLijst
//   community-gebruiker:<userId>      → GebruikerIndex: daggrens, losse foto's, eigen berichten (wisbaar, lib/privacy/user-kv.ts)
//   community-uitsluiting:<userId>    → Uitsluiting door beheer (wisbaar)
//   community-wachtrij                → gemelde berichten voor Beheer → Community (zonder gebruikers-id's)
//   community-instelling              → nieuwe berichten tijdelijk dicht
// Let op: niet "community:" (zonder streepje), dat zijn de eigen groepen uit lib/communities/store.ts.
// Elke wijziging gaat met compare-and-swap op het veld `versie` (kvVervangAlsVeld): twee reacties tegelijk overschrijven
// elkaar dan niet.
// ---------------------------------------------------------------------------

export const ONDERWERP_VOORVOEGSEL = "community-onderwerp:";
export const REACTIES_VOORVOEGSEL = "community-reacties:";
export const UITSLUITING_VOORVOEGSEL = "community-uitsluiting:";
const K_WACHTRIJ = "community-wachtrij";
const K_INSTELLING = "community-instelling";

export const onderwerpSleutel = (id: string) => `${ONDERWERP_VOORVOEGSEL}${id}`;
export const reactiesSleutel = (onderwerpId: string) => `${REACTIES_VOORVOEGSEL}${onderwerpId}`;
export const gebruikerSleutel = (userId: string) => `community-gebruiker:${userId}`;
export const uitsluitingSleutel = (userId: string) => `community-uitsluiting:${userId}`;

export interface GebruikerIndex {
  versie: string;
  teller?: DagTeller;
  /** geüploade foto's die nog niet bij een bericht horen (na 24 uur weg) */
  losseFotos: { id: string; at: string }[];
  onderwerpen: string[];
  reacties: { onderwerpId: string; reactieId: string }[];
}

export interface Uitsluiting {
  at: string;
  /** de beheerder (User.id) */
  door: string;
  reden: string;
}

export interface WachtrijItem {
  onderwerpId: string;
  reactieId: string | null;
  at: string;
}

interface Wachtrij {
  versie: string;
  items: WachtrijItem[];
}

export interface Instelling {
  /** nieuwe onderwerpen en reacties tijdelijk dicht (bijvoorbeeld bij een golf spam); lezen en melden blijft open */
  schrijvenDicht: boolean;
}

const nieuweVersie = () => randomBytes(6).toString("hex");
const nieuwId = (letter: string) => `${letter}${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
const LOSSE_FOTO_UREN = 24;
const MAX_LOSSE_FOTOS = 12;

/**
 * Lees, wijzig en schrijf met compare-and-swap. `start` is de waarde als de sleutel nog niet bestaat (null = dan bestaat het
 * niet). `maak` krijgt een kopie en mag een AppError gooien (daggrens, niet van jou). Na vijf botsingen een nette fout.
 */
export async function wijzig<T extends { versie: string }>(sleutel: string, start: T | null, maak: (huidig: T) => T): Promise<T> {
  for (let poging = 0; poging < 5; poging++) {
    const huidig = await kvGet<T>(sleutel);
    const basis = huidig ?? start;
    if (!basis) throw AppError.notFound("Dit bericht bestaat niet (meer).");
    // via JSON: een veld dat undefined werd (verborgenDoor na "tonen") valt zo echt weg
    const nieuw = JSON.parse(JSON.stringify({ ...maak(structuredClone(basis)), versie: nieuweVersie() })) as T;
    const gelukt = huidig ? await kvVervangAlsVeld(sleutel, "versie", huidig.versie, nieuw) : await kvSetIfAbsent(sleutel, nieuw);
    if (gelukt) return nieuw;
  }
  throw AppError.conflict("Het was even druk in de community. Probeer het nog een keer.");
}

const leegIndex = (): GebruikerIndex => ({ versie: "0", losseFotos: [], onderwerpen: [], reacties: [] });
const leegeLijst = (onderwerpId: string): ReactieLijst => ({ versie: "0", onderwerpId, reacties: [] });

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

/** Een onderwerp; het welkomstonderwerp bestaat ook als het nog nooit is bewaard. */
export async function leesOnderwerp(id: string): Promise<Onderwerp | null> {
  const opgeslagen = await kvGet<Onderwerp>(onderwerpSleutel(id));
  return opgeslagen ?? (id === WELKOM_ID ? WELKOM : null);
}

export async function leesReacties(onderwerpId: string): Promise<Reactie[]> {
  return (await kvGet<ReactieLijst>(reactiesSleutel(onderwerpId)))?.reacties ?? [];
}

/** Alle onderwerpen (ook verborgen en verwijderde), met het welkomstonderwerp erbij als dat nog niet bewaard is. */
export async function alleOnderwerpen(): Promise<Onderwerp[]> {
  const lijst = await kvListValues<Onderwerp>(ONDERWERP_VOORVOEGSEL, 20_000);
  return lijst.some((o) => o.id === WELKOM_ID) ? lijst : [WELKOM, ...lijst];
}

/** Voor de sitemap: zichtbare onderwerpen met minstens één reactie. */
export async function sitemapOnderwerpen(): Promise<{ pad: string; laatsteOp: string }[]> {
  return (await alleOnderwerpen()).filter((o) => o.status === "zichtbaar" && o.aantalReacties > 0).map((o) => ({ pad: onderwerpPad(o), laatsteOp: o.laatsteOp }));
}

/** De reacties van meerdere onderwerpen in één keer (Beheer). */
export async function reactiesVan(onderwerpIds: string[]): Promise<Map<string, Reactie[]>> {
  const rijen = await kvGetMany<ReactieLijst>(onderwerpIds.map(reactiesSleutel));
  return new Map(onderwerpIds.map((id) => [id, rijen.get(reactiesSleutel(id))?.reacties ?? []]));
}

// ---------------------------------------------------------------------------
// Toegang
// ---------------------------------------------------------------------------

export async function leesInstelling(): Promise<Instelling> {
  const v = await kvGet<Partial<Instelling>>(K_INSTELLING).catch(() => null);
  return { schrijvenDicht: v?.schrijvenDicht === true };
}

export async function zetInstelling(i: Instelling): Promise<Instelling> {
  await kvSet(K_INSTELLING, i);
  return i;
}

export async function uitsluitingVan(userId: string): Promise<Uitsluiting | null> {
  return kvGet<Uitsluiting>(uitsluitingSleutel(userId));
}

export async function sluitUit(userId: string, door: string, reden: string, nu = new Date()): Promise<void> {
  await kvSet(uitsluitingSleutel(userId), { at: nu.toISOString(), door, reden: reden.trim().slice(0, 300) } satisfies Uitsluiting);
}

export async function laatWeerToe(userId: string): Promise<void> {
  await kvDelete(uitsluitingSleutel(userId));
}

/** Iedereen die nu is uitgesloten, met zijn gebruikers-id (alleen voor Beheer). */
export async function alleUitsluitingen(): Promise<{ userId: string; uitsluiting: Uitsluiting }[]> {
  const rijen = await kvListEntries<Uitsluiting>(UITSLUITING_VOORVOEGSEL, 1000);
  return rijen.map((r) => ({ userId: r.key.slice(UITSLUITING_VOORVOEGSEL.length), uitsluiting: r.value }));
}

// ---------------------------------------------------------------------------
// Foto's die al zijn geüpload maar nog niet bij een bericht horen
// ---------------------------------------------------------------------------

/** Zet een geüploade foto bij de gebruiker. Geeft de foto's terug die te oud of te veel waren (die wist de aanroeper). */
export async function bewaarLosseFoto(userId: string, fotoId: string, nu = new Date()): Promise<string[]> {
  let weg: string[] = [];
  await wijzig<GebruikerIndex>(gebruikerSleutel(userId), leegIndex(), (ix) => {
    const grens = new Date(nu.getTime() - LOSSE_FOTO_UREN * 3_600_000).toISOString();
    const vers = ix.losseFotos.filter((f) => f.at >= grens);
    const alle = [{ id: fotoId, at: nu.toISOString() }, ...vers];
    const houden = alle.slice(0, MAX_LOSSE_FOTOS);
    const hier = new Set(houden.map((f) => f.id));
    weg = ix.losseFotos.map((f) => f.id).filter((id) => !hier.has(id));
    return { ...ix, losseFotos: houden };
  });
  return weg;
}

/** Haalt de gekozen foto's uit de losse foto's van de gebruiker; gooit als er één niet van hem is (of al gebruikt). */
function neemFotos(ix: GebruikerIndex, fotoIds: string[]): GebruikerIndex {
  const los = new Set(ix.losseFotos.map((f) => f.id));
  if (fotoIds.some((id) => !los.has(id))) throw AppError.validation("Een van je foto's is verlopen of al gebruikt. Kies hem opnieuw.");
  return { ...ix, losseFotos: ix.losseFotos.filter((f) => !fotoIds.includes(f.id)) };
}

function secondenTotMorgen(nu: Date): number {
  return Math.max(60, Math.round((amsterdamStartOfDay(nu, 1).getTime() - nu.getTime()) / 1000));
}

// ---------------------------------------------------------------------------
// Schrijven
// ---------------------------------------------------------------------------

function nieuwBericht(id: string, auteurId: string, tekst: string, fotos: string[], nu: Date): Bericht {
  return { id, auteurId, tekst, fotos, at: nu.toISOString(), handig: [], meldingen: [], beoordeeldOp: null, status: "zichtbaar" };
}

/** Een nieuw onderwerp. De invoer is al schoongemaakt en gecontroleerd (controleerOnderwerp). */
export async function maakOnderwerp(
  invoer: { auteurId: string; titel: string; tekst: string; categorie: Categorie; fotoIds: string[] },
  nu = new Date(),
): Promise<Onderwerp> {
  const id = nieuwId("o");
  const dag = amsterdamDayKey(nu);
  await wijzig<GebruikerIndex>(gebruikerSleutel(invoer.auteurId), leegIndex(), (ix) => {
    const teller = telOp(ix.teller, dag, "onderwerpen");
    if (!teller) throw AppError.rateLimited(daggrensTekst("onderwerpen"), secondenTotMorgen(nu), GRENZEN.onderwerpenPerDag);
    return { ...neemFotos(ix, invoer.fotoIds), teller, onderwerpen: [id, ...ix.onderwerpen].slice(0, 5000) };
  });
  const o: Onderwerp = {
    ...nieuwBericht(id, invoer.auteurId, invoer.tekst, invoer.fotoIds, nu),
    versie: nieuweVersie(),
    titel: invoer.titel,
    slug: maakSlug(invoer.titel),
    categorie: invoer.categorie,
    vastgepind: false,
    aantalReacties: 0,
    laatsteOp: nu.toISOString(),
  };
  await kvSet(onderwerpSleutel(id), o);
  return o;
}

/** Een reactie op een zichtbaar onderwerp. Geeft het bijgewerkte onderwerp en de reactie terug. */
export async function maakReactie(
  onderwerpId: string,
  invoer: { auteurId: string; tekst: string; fotoIds: string[] },
  nu = new Date(),
): Promise<{ onderwerp: Onderwerp; reactie: Reactie }> {
  const onderwerp = await leesOnderwerp(onderwerpId);
  if (!onderwerp || onderwerp.status !== "zichtbaar") throw AppError.notFound("Dit onderwerp bestaat niet (meer).");
  const bestaande = await leesReacties(onderwerpId);
  if (bestaande.length >= GRENZEN.reactiesPerOnderwerp) throw AppError.validation("Dit onderwerp is vol. Start gerust een nieuw onderwerp.");
  const id = nieuwId("r");
  const dag = amsterdamDayKey(nu);
  await wijzig<GebruikerIndex>(gebruikerSleutel(invoer.auteurId), leegIndex(), (ix) => {
    const teller = telOp(ix.teller, dag, "reacties");
    if (!teller) throw AppError.rateLimited(daggrensTekst("reacties"), secondenTotMorgen(nu), GRENZEN.reactiesPerDag);
    return { ...neemFotos(ix, invoer.fotoIds), teller, reacties: [{ onderwerpId, reactieId: id }, ...ix.reacties].slice(0, 20_000) };
  });
  const reactie: Reactie = nieuwBericht(id, invoer.auteurId, invoer.tekst, invoer.fotoIds, nu);
  await wijzig<ReactieLijst>(reactiesSleutel(onderwerpId), leegeLijst(onderwerpId), (l) => ({ ...l, reacties: [...l.reacties, reactie] }));
  const bijgewerkt = await wijzig<Onderwerp>(onderwerpSleutel(onderwerpId), onderwerpId === WELKOM_ID ? WELKOM : null, (o) => ({
    ...o,
    aantalReacties: o.aantalReacties + 1,
    laatsteOp: nu.toISOString(),
  }));
  return { onderwerp: bijgewerkt, reactie };
}

/** Pas één bericht aan: het onderwerp zelf (reactieId null) of een reactie. Geeft het bericht van vóór en na de wijziging terug. */
export async function wijzigBericht(
  onderwerpId: string,
  reactieId: string | null,
  maak: (b: Bericht) => Bericht,
): Promise<{ voor: Bericht; na: Bericht; onderwerp: Onderwerp }> {
  // een object en geen losse let: TypeScript volgt toewijzingen binnen een callback niet
  const vast: { voor?: Bericht; na?: Bericht } = {};
  if (!reactieId) {
    const na = await wijzig<Onderwerp>(onderwerpSleutel(onderwerpId), onderwerpId === WELKOM_ID ? WELKOM : null, (o) => {
      vast.voor = structuredClone(o);
      return { ...o, ...maak(o) };
    });
    return { voor: vast.voor ?? na, na, onderwerp: na };
  }
  await wijzig<ReactieLijst>(reactiesSleutel(onderwerpId), null, (l) => {
    const i = l.reacties.findIndex((r) => r.id === reactieId);
    const oud = l.reacties[i];
    if (!oud) throw AppError.notFound("Deze reactie bestaat niet (meer).");
    vast.voor = structuredClone(oud);
    const nieuw = maak(oud);
    vast.na = nieuw;
    const reacties = [...l.reacties];
    reacties[i] = nieuw;
    return { ...l, reacties };
  });
  const { voor, na } = vast;
  if (!voor || !na) throw AppError.notFound("Deze reactie bestaat niet (meer).");
  // het aantal zichtbare reacties op het onderwerp bijhouden
  const was = voor.status === "zichtbaar";
  const is = na.status === "zichtbaar";
  const onderwerp =
    was === is
      ? ((await leesOnderwerp(onderwerpId)) ?? WELKOM)
      : await wijzig<Onderwerp>(onderwerpSleutel(onderwerpId), onderwerpId === WELKOM_ID ? WELKOM : null, (o) => ({
          ...o,
          aantalReacties: Math.max(0, o.aantalReacties + (is ? 1 : -1)),
        }));
  return { voor, na, onderwerp };
}

/** Een eigen bericht verwijderen: tekst en foto's weg. Geeft de foto's terug die van schijf moeten. */
export async function verwijderEigen(userId: string, onderwerpId: string, reactieId: string | null): Promise<string[]> {
  const { voor } = await wijzigBericht(onderwerpId, reactieId, (b) => {
    if (b.auteurId !== userId || b.team) throw AppError.notFound("Dit bericht is niet van jou.");
    if (b.status === "verwijderd") return b;
    return { ...b, status: "verwijderd", tekst: "", fotos: [], ...(reactieId ? {} : { titel: "Verwijderd onderwerp" }) };
  });
  return voor.fotos;
}

/** "Handig" aan of uit, één keer per gebruiker per bericht. Niet bij je eigen bericht. */
export async function zetHandig(userId: string, onderwerpId: string, reactieId: string | null): Promise<{ aantal: number; aan: boolean }> {
  const { na } = await wijzigBericht(onderwerpId, reactieId, (b) => {
    if (b.status !== "zichtbaar") throw AppError.notFound("Dit bericht is er niet meer.");
    if (b.auteurId === userId) throw AppError.validation("Je eigen bericht kun je niet handig vinden.");
    const aan = b.handig.includes(userId);
    return { ...b, handig: aan ? b.handig.filter((h) => h !== userId) : [...b.handig, userId].slice(-5000) };
  });
  return { aantal: na.handig.length, aan: na.handig.includes(userId) };
}

/**
 * Een melding (ook zonder account). Telt één keer per melder; na GRENZEN.verbergNa verschillende melders is het bericht
 * verborgen tot beheer kijkt. Het bericht komt in de wachtrij van Beheer → Community.
 */
export async function meld(
  invoer: { onderwerpId: string; reactieId: string | null; door: string; reden: MeldReden; toelichting: string },
  nu = new Date(),
): Promise<{ nieuw: boolean; verborgen: boolean }> {
  const { voor, na } = await wijzigBericht(invoer.onderwerpId, invoer.reactieId, (b) => {
    if (b.status === "verwijderd") throw AppError.notFound("Dit bericht is er niet meer.");
    if (alGemeld(b, invoer.door)) return b;
    const melding = { id: randomBytes(4).toString("hex"), door: invoer.door, reden: invoer.reden, toelichting: invoer.toelichting.slice(0, GRENZEN.toelichting), at: nu.toISOString() };
    const metMelding: Bericht = { ...b, meldingen: [...b.meldingen, melding].slice(-50) };
    return moetVerbergen(metMelding) ? { ...metMelding, status: "verborgen", verborgenDoor: "meldingen" } : metMelding;
  });
  const nieuw = na.meldingen.length !== voor.meldingen.length || na.meldingen.some((m, i) => m.id !== voor.meldingen[i]?.id);
  if (nieuw) await zetInWachtrij({ onderwerpId: invoer.onderwerpId, reactieId: invoer.reactieId, at: nu.toISOString() });
  return { nieuw, verborgen: voor.status === "zichtbaar" && na.status === "verborgen" };
}

// ---------------------------------------------------------------------------
// Beheer
// ---------------------------------------------------------------------------

async function zetInWachtrij(item: WachtrijItem): Promise<void> {
  await wijzig<Wachtrij>(K_WACHTRIJ, { versie: "0", items: [] }, (w) => ({
    ...w,
    items: [item, ...w.items.filter((x) => !(x.onderwerpId === item.onderwerpId && x.reactieId === item.reactieId))].slice(0, 500),
  }));
}

async function uitWachtrij(onderwerpId: string, reactieId: string | null): Promise<void> {
  await wijzig<Wachtrij>(K_WACHTRIJ, { versie: "0", items: [] }, (w) => ({
    ...w,
    items: w.items.filter((x) => !(x.onderwerpId === onderwerpId && x.reactieId === reactieId)),
  }));
}

export async function wachtrij(): Promise<WachtrijItem[]> {
  return (await kvGet<Wachtrij>(K_WACHTRIJ))?.items ?? [];
}

export type BeheerActie = "tonen" | "verbergen" | "verwijderen";

/**
 * Tonen (de meldingen tot nu tellen niet meer), verbergen of verwijderen door beheer. Haalt het bericht uit de wachtrij.
 * Geeft de foto's terug die van schijf moeten (alleen bij verwijderen).
 */
export async function beheerBericht(actie: BeheerActie, onderwerpId: string, reactieId: string | null, reden: string, nu = new Date()): Promise<string[]> {
  const schoon = reden.trim().slice(0, 300) || undefined;
  const { voor } = await wijzigBericht(onderwerpId, reactieId, (b) => {
    if (b.status === "verwijderd" && actie !== "verwijderen") throw AppError.validation("Dit bericht is verwijderd en kan niet meer terug.");
    if (actie === "tonen") return { ...b, status: "zichtbaar", beoordeeldOp: nu.toISOString(), verborgenDoor: undefined, beheerReden: undefined };
    if (actie === "verbergen") return { ...b, status: "verborgen", verborgenDoor: "beheer", beheerReden: schoon };
    return { ...b, status: "verwijderd", tekst: "", fotos: [], verborgenDoor: undefined, beheerReden: schoon };
  });
  await uitWachtrij(onderwerpId, reactieId);
  return actie === "verwijderen" ? voor.fotos : [];
}

/** Vastpinnen of losmaken (bovenaan het overzicht). */
export async function zetVastgepind(onderwerpId: string, vast: boolean): Promise<Onderwerp> {
  return wijzig<Onderwerp>(onderwerpSleutel(onderwerpId), onderwerpId === WELKOM_ID ? WELKOM : null, (o) => ({ ...o, vastgepind: vast }));
}

/** Voor de AVG (lib/community/avg.ts): alle bewaarde onderwerpen en reactielijsten, met hun sleutel. */
export async function alleRijen(): Promise<{ onderwerpen: { key: string; value: Onderwerp }[]; reacties: { key: string; value: ReactieLijst }[] }> {
  const [onderwerpen, reacties] = await Promise.all([
    kvListEntries<Onderwerp>(ONDERWERP_VOORVOEGSEL, 20_000),
    kvListEntries<ReactieLijst>(REACTIES_VOORVOEGSEL, 20_000),
  ]);
  return { onderwerpen, reacties };
}

export async function leesGebruikerIndex(userId: string): Promise<GebruikerIndex | null> {
  return kvGet<GebruikerIndex>(gebruikerSleutel(userId));
}

export async function wisGebruikerSleutels(userId: string): Promise<void> {
  await Promise.all([kvDelete(gebruikerSleutel(userId)), kvDelete(uitsluitingSleutel(userId))]);
}
