import { leesVraag, naarTreffer, rangschik, scoor, woorden } from "@/lib/kvk/normaliseer";
import { isLimiet, metTijdslimiet } from "@/lib/kvk/bronnen";
import type { AdresDelen } from "@/lib/kvk/bronnen";
import type { KvkBedrijf, KvkTreffer } from "@/lib/kvk/types";

// ---------------------------------------------------------------------------
// De zoekdienst: probeert de bronnen in volgorde, en een bron die wegvalt is
// nooit een fout voor de bezoeker.
//
//   1. onze eigen index (altijd, kost niets)
//   2. KVKBase, alleen als de eigenaar dat toestaat (Admin → Alles gratis →
//      "KVK-gegevens zoeken") en het tegoed niet op is; elk antwoord gaat in de
//      eigen index, zodat dezelfde vraag de volgende keer niets kost
//   3. OpenStreetMap, alleen op uitdrukkelijk verzoek ("zoek ook in
//      OpenStreetMap") en voor het adres van een gekozen bedrijf. Nominatim
//      staat zoeken-terwijl-je-typt niet toe; daarom nooit per toetsaanslag.
//
// De bronnen komen binnen als parameter (lib/kvk/bronnen-echt.ts levert de
// echte), zodat de volgorde te testen is met nagebootste bronnen.
// ---------------------------------------------------------------------------

export interface KvkBronnen {
  index: {
    zoek(vraagWoorden: string[], max: number): Promise<KvkBedrijf[]>;
    opNummer(kvk: string): Promise<KvkBedrijf | null>;
    onthoud(bedrijven: KvkBedrijf[]): Promise<unknown>;
  };
  register: {
    /** mag KVKBase nu gebruikt worden: sleutel aanwezig, keuze, en geen limiet bereikt */
    toegestaan(): Promise<boolean>;
    zoek(q: string): Promise<KvkBedrijf[]>;
    opNummer(kvk: string): Promise<KvkBedrijf | null>;
  };
  osm: {
    zoek(term: string): Promise<KvkTreffer[]>;
    adresVoor(naam: string, plaats: string | null): Promise<AdresDelen | null>;
  };
  /** vult de index (eenmalig en dan weekelijks) met wat we al in de database hebben */
  zaai(): Promise<void>;
}

export interface ZoekUitkomst {
  results: KvkTreffer[];
  /** KVKBase zit aan zijn limiet; het formulier valt rustig terug op zelf invullen */
  bezet: boolean;
  /** welke bronnen antwoord gaven, voor het log en de test */
  bronnen: ("index" | "register" | "osm")[];
}

export const ZOEK_MAX = 8;
/** Vanaf zoveel treffers uit onze eigen index vragen we de betaalde bron niet meer. */
export const GENOEG_UIT_INDEX = 5;
const REGISTER_TIJD_MS = 6_000;
const OSM_TIJD_MS = 5_000;

const leeg = (): ZoekUitkomst => ({ results: [], bezet: false, bronnen: [] });

/** Een bron die faalt geeft niets terug; een limiet melden we apart. */
async function veilig<T>(taak: () => Promise<T>, terugval: T): Promise<{ waarde: T; limiet: boolean }> {
  try {
    return { waarde: await taak(), limiet: false };
  } catch (err) {
    return { waarde: terugval, limiet: isLimiet(err) };
  }
}

async function vraagRegister<T>(bronnen: KvkBronnen, taak: () => Promise<T>, terugval: T): Promise<{ waarde: T; limiet: boolean; gebruikt: boolean }> {
  const mag = (await veilig(() => bronnen.register.toegestaan(), false)).waarde;
  if (!mag) return { waarde: terugval, limiet: false, gebruikt: false };
  const uit = await veilig(() => metTijdslimiet(taak(), REGISTER_TIJD_MS, terugval), terugval);
  return { ...uit, gebruikt: true };
}

/** Zoek bedrijven op naam (met eventueel plaats) of op KVK-nummer. */
export async function zoekBedrijven(invoer: string, bronnen: KvkBronnen, opties: { osm?: boolean } = {}): Promise<ZoekUitkomst> {
  const vraag = leesVraag(invoer);
  if (vraag.soort === "leeg" || vraag.soort === "vestiging") return leeg();

  // de index vullen met wat we al hadden gebeurt op de achtergrond en mag nooit vertragen of falen
  void veilig(() => bronnen.zaai(), undefined);

  if (vraag.soort === "kvk") {
    const t = await bedrijfDetails(vraag.kvk, bronnen);
    return { results: t ? [t] : [], bezet: false, bronnen: t ? [t.source === "register" ? "index" : "osm"] : [] };
  }

  const uit: ZoekUitkomst = leeg();
  const uitIndex = (await veilig(() => bronnen.index.zoek(vraag.woorden, ZOEK_MAX), [] as KvkBedrijf[])).waarde;
  let lijst: KvkBedrijf[] = uitIndex;
  if (uitIndex.length > 0) uit.bronnen.push("index");

  if (uitIndex.length < GENOEG_UIT_INDEX) {
    const reg = await vraagRegister(bronnen, () => bronnen.register.zoek(invoer.trim()), [] as KvkBedrijf[]);
    uit.bezet = reg.limiet;
    if (reg.waarde.length > 0) {
      uit.bronnen.push("register");
      void veilig(() => bronnen.index.onthoud(reg.waarde), undefined); // elk antwoord blijft bewaard
      // samenvoegen op nummer: de index heeft vaak meer velden dan het korte antwoord
      const perNummer = new Map(uitIndex.map((b) => [b.kvk, b]));
      for (const b of reg.waarde) if (!perNummer.has(b.kvk)) perNummer.set(b.kvk, b);
      lijst = [...perNummer.values()];
    }
  }

  const geordend = rangschik(
    lijst.map((b) => ({ n: b.naam, p: b.plaats ?? "", b })),
    vraag.woorden,
    ZOEK_MAX,
  );
  // een antwoord van de bron dat onze eigen rangschikking niet haalt (andere schrijfwijze) houden we toch
  const gevonden = geordend.length > 0 ? geordend.map((x) => x.b) : lijst.slice(0, ZOEK_MAX);
  uit.results = gevonden.map(naarTreffer);

  if (opties.osm && uit.results.length === 0) {
    const osm = await veilig(() => metTijdslimiet(bronnen.osm.zoek(invoer.trim()), OSM_TIJD_MS, [] as KvkTreffer[]), [] as KvkTreffer[]);
    // OSM zoekt los en kan er vanalles bij leggen: alleen wat echt op de vraag lijkt
    const passend = osm.waarde.filter((t) => scoor({ n: t.name, p: t.city ?? "" }, vraag.woorden) !== null);
    if (passend.length > 0) {
      uit.results = passend.slice(0, ZOEK_MAX);
      uit.bronnen.push("osm");
    }
  }
  return uit;
}

const heeftAdres = (b: KvkBedrijf): boolean => Boolean(b.straat && b.postcode);

/**
 * Alle bekende gegevens van één bedrijf op zijn KVK-nummer: eigen index, dan
 * (als dat mag) KVKBase, en ontbreekt het adres nog, dan zoekt OpenStreetMap
 * het adres erbij. Null als het nummer nergens bekend is.
 */
export async function bedrijfDetails(kvk: string, bronnen: KvkBronnen): Promise<KvkTreffer | null> {
  let b = (await veilig(() => bronnen.index.opNummer(kvk), null as KvkBedrijf | null)).waarde;
  if (!b || !heeftAdres(b)) {
    const reg = await vraagRegister(bronnen, () => bronnen.register.opNummer(kvk), null as KvkBedrijf | null);
    if (reg.waarde) {
      void veilig(() => bronnen.index.onthoud([reg.waarde as KvkBedrijf]), undefined);
      b = reg.waarde;
    }
  }
  if (!b) return null;
  const treffer = naarTreffer(b);
  if (!treffer.street && woorden(b.naam).length > 0) {
    const adres = (await veilig(() => metTijdslimiet(bronnen.osm.adresVoor(b.naam, b.plaats), OSM_TIJD_MS, null as AdresDelen | null), null as AdresDelen | null)).waarde;
    if (adres) {
      treffer.street = adres.street;
      treffer.houseNumber = adres.houseNumber;
      treffer.postalCode = adres.postalCode;
      treffer.city = treffer.city ?? adres.city;
    }
  }
  return treffer;
}
