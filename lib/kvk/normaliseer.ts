import type { EmmerItem, KvkBedrijf, KvkTreffer } from "@/lib/kvk/types";

// ---------------------------------------------------------------------------
// Het pure deel van de bedrijvenindex: schrijfwijzen gelijktrekken, een vraag
// lezen, zoeksleutels (emmers) maken en treffers rangschikken. Geen kv, geen
// netwerk, geen env — dus volledig te testen en ook voor de browser veilig.
// ---------------------------------------------------------------------------

/** Hoofdletter- en accentongevoelig: "Café Zoë B.V." wordt "cafe zoe bv". */
export function normaliseer(tekst: string): string {
  return tekst
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`.]/g, "") // "b.v." wordt "bv", "'t Hoekje" wordt "t hoekje"
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Losse woorden van een naam of vraag, genormaliseerd. */
export const woorden = (tekst: string): string[] => normaliseer(tekst).split(" ").filter(Boolean);

/** Een KVK-nummer bestaat uit 8 cijfers. */
export const isKvkNummer = (waarde: string): boolean => /^\d{8}$/.test(waarde);
/** Een vestigingsnummer bestaat uit 12 cijfers. */
export const isVestigingsnummer = (waarde: string): boolean => /^\d{12}$/.test(waarde);

/**
 * Een ingetypt nummer ("1234 5678", "12.34.56.78", "KVK: 12345678") als 8
 * cijfers, of null als het er geen is. Andere tekst (een naam met een cijfer
 * erin) geeft null: alleen cijfers met spaties, punten en streepjes tellen.
 */
export function schoonKvk(invoer: string): string | null {
  const kaal = invoer.trim().replace(/^kvk\s*[:.-]?\s*/i, "");
  if (!/^[\d\s.-]+$/.test(kaal)) return null;
  const cijfers = kaal.replace(/\D/g, "");
  return isKvkNummer(cijfers) ? cijfers : null;
}

/** Idem voor een vestigingsnummer (12 cijfers). */
export function schoonVestiging(invoer: string): string | null {
  const kaal = invoer.trim().replace(/^(vestiging(snummer)?|vest\.?)\s*[:.-]?\s*/i, "");
  if (!/^[\d\s.-]+$/.test(kaal)) return null;
  const cijfers = kaal.replace(/\D/g, "");
  return isVestigingsnummer(cijfers) ? cijfers : null;
}

export type Vraag =
  | { soort: "kvk"; kvk: string }
  | { soort: "vestiging"; vestiging: string }
  | { soort: "naam"; woorden: string[] }
  | { soort: "leeg" };

/** Kortste zoekterm voor een naam: korter vindt te veel en past in geen emmer. */
export const MIN_VRAAG = 3;

/** Wat vraagt iemand: een nummer of een naam (met eventueel een plaats erbij)? */
export function leesVraag(invoer: string): Vraag {
  const tekst = invoer.trim().slice(0, 120);
  const kvk = schoonKvk(tekst);
  if (kvk) return { soort: "kvk", kvk };
  const vestiging = schoonVestiging(tekst);
  if (vestiging) return { soort: "vestiging", vestiging };
  const w = woorden(tekst);
  if (w.join("").length < MIN_VRAAG) return { soort: "leeg" };
  return { soort: "naam", woorden: w.slice(0, 6) };
}

// --- emmers ------------------------------------------------------------------

/** Aantal tekens waarmee een emmer begint ("bak" voor bakkerij en bakker). */
export const EMMER_LENGTE = 3;
/** Zoveel items houdt één emmer; daarboven valt het oudste eruit zodat het geheugen begrensd blijft. */
export const EMMER_MAX = 400;

export const emmerSleutel = (woord: string): string => `kvk-index:n:${woord.slice(0, EMMER_LENGTE)}`;
export const plaatsSleutel = (plaats: string): string => `kvk-index:p:${normaliseer(plaats).replace(/ /g, "").slice(0, 30)}`;
export const bedrijfSleutel = (kvk: string): string => `kvk-bedrijf:${kvk}`;

/** In welke naam-emmers hoort dit bedrijf? Eén per woord van minstens 3 tekens, hooguit 4. */
export function emmersVoorNaam(naam: string): string[] {
  const uit = new Set<string>();
  for (const w of woorden(naam)) {
    if (w.length < EMMER_LENGTE) continue;
    uit.add(emmerSleutel(w));
    if (uit.size >= 4) break;
  }
  return [...uit];
}

/** Zet een item in een emmer (vervangt hetzelfde KVK-nummer) en houdt de emmer begrensd. */
export function voegToe(emmer: EmmerItem[], item: EmmerItem, max = EMMER_MAX): EmmerItem[] {
  const zonder = emmer.filter((e) => e.k !== item.k);
  zonder.push(item);
  return zonder.length > max ? zonder.slice(zonder.length - max) : zonder;
}

// --- zoeken en rangschikken --------------------------------------------------

/**
 * Hoe goed past dit bedrijf bij de vraag? null = past niet. Elk woord uit de
 * vraag moet een begin zijn van een woord uit de naam (of van de plaats); een
 * heel woord telt zwaarder dan een begin. Zo vindt "bakk utr" de Bakkerij in
 * Utrecht, en "utrecht" alleen vindt alles in Utrecht.
 */
export function scoor(item: { n: string; p: string }, vraagWoorden: string[]): number | null {
  const naam = woorden(item.n);
  const plaats = woorden(item.p);
  if (vraagWoorden.length === 0) return null;
  let score = 0;
  for (const v of vraagWoorden) {
    if (naam.includes(v)) score += 3;
    else if (naam.some((w) => w.startsWith(v))) score += 2;
    else if (plaats.includes(v)) score += 2;
    else if (plaats.some((w) => w.startsWith(v))) score += 1;
    else return null;
  }
  if (normaliseer(item.n).startsWith(vraagWoorden.join(" "))) score += 5; // de naam begint zoals ingetikt
  else if (naam[0] !== undefined && naam[0].startsWith(vraagWoorden[0] ?? "")) score += 2;
  return score - Math.min(normaliseer(item.n).length, 100) / 200; // bij gelijk spel: de kortere naam eerst
}

/** Rangschik items op score (hoog eerst) en kap af. Items die niet passen vallen weg. */
export function rangschik<T extends { n: string; p: string }>(items: T[], vraagWoorden: string[], max: number): T[] {
  return items
    .map((item) => ({ item, score: scoor(item, vraagWoorden) }))
    .filter((x): x is { item: T; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.item);
}

/** Het langste woord (minstens 3 tekens) kiest de naam-emmer: dat is het zeldzaamst, dus de kleinste lijst. */
export function emmerWoord(vraagWoorden: string[]): string | null {
  const w = [...vraagWoorden].filter((x) => x.length >= EMMER_LENGTE).sort((a, b) => b.length - a.length)[0];
  return w ?? null;
}

// --- van en naar het record --------------------------------------------------

const tekstOfNull = (v: unknown, max = 160): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Een postcode als "1012 AB"; iets anders wordt null. */
export function schonePostcode(v: unknown): string | null {
  const m = /^\s*(\d{4})\s*([A-Za-z]{2})\s*$/.exec(typeof v === "string" ? v : "");
  return m ? `${m[1]} ${(m[2] ?? "").toUpperCase()}` : null;
}

/** Een onbetrouwbaar stuk JSON (uit KV) terug naar een bedrijf, of null als het er geen is. */
export function leesBedrijf(raw: unknown): KvkBedrijf | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kvk = typeof r.kvk === "string" ? r.kvk : "";
  const naam = tekstOfNull(r.naam);
  if (!isKvkNummer(kvk) || !naam) return null;
  return {
    kvk,
    naam,
    handelsnaam: tekstOfNull(r.handelsnaam),
    rechtsvorm: tekstOfNull(r.rechtsvorm, 60),
    straat: tekstOfNull(r.straat),
    huisnummer: tekstOfNull(r.huisnummer, 20),
    postcode: schonePostcode(r.postcode),
    plaats: tekstOfNull(r.plaats, 80),
    btw: typeof r.btw === "string" && /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(r.btw) ? r.btw : null,
    actief: typeof r.actief === "boolean" ? r.actief : null,
    bron: r.bron === "bestaand" ? "bestaand" : "kvkbase",
    bijgewerkt: typeof r.bijgewerkt === "string" ? r.bijgewerkt : new Date(0).toISOString(),
  };
}

/** Voeg een nieuw antwoord samen met wat we al wisten: nieuwe waarden winnen, een leeg veld wist niets. */
export function voegSamen(oud: KvkBedrijf | null, nieuw: KvkBedrijf): KvkBedrijf {
  if (!oud) return nieuw;
  return {
    kvk: nieuw.kvk,
    // een naam uit een tenant of lead overschrijft nooit de naam uit het register
    naam: oud.bron === "kvkbase" && nieuw.bron === "bestaand" ? oud.naam : nieuw.naam,
    handelsnaam: nieuw.handelsnaam ?? oud.handelsnaam,
    rechtsvorm: nieuw.rechtsvorm ?? oud.rechtsvorm,
    straat: nieuw.straat ?? oud.straat,
    huisnummer: nieuw.huisnummer ?? oud.huisnummer,
    postcode: nieuw.postcode ?? oud.postcode,
    plaats: nieuw.plaats ?? oud.plaats,
    btw: nieuw.btw ?? oud.btw,
    actief: nieuw.actief ?? oud.actief,
    // een antwoord van KVKBase is betrouwbaarder dan een bestaande tenant of lead
    bron: nieuw.bron === "kvkbase" || oud.bron === "kvkbase" ? "kvkbase" : "bestaand",
    bijgewerkt: nieuw.bijgewerkt,
  };
}

/** Zijn er verschillen die het schrijven waard zijn? (De tijd alleen telt pas na 30 dagen.) */
export function isAnders(oud: KvkBedrijf, nieuw: KvkBedrijf): boolean {
  const { bijgewerkt: oudTijd, ...a } = oud;
  const { bijgewerkt: nieuwTijd, ...b } = nieuw;
  if (JSON.stringify(a) !== JSON.stringify(b)) return true;
  return Date.parse(nieuwTijd) - Date.parse(oudTijd) > 30 * 86_400_000;
}

export function naarEmmerItem(b: KvkBedrijf): EmmerItem {
  return { k: b.kvk, n: b.naam, p: b.plaats ?? "" };
}

export function naarTreffer(b: KvkBedrijf): KvkTreffer {
  return {
    kvkNumber: b.kvk,
    name: b.naam,
    city: b.plaats,
    legalForm: b.rechtsvorm,
    street: b.straat,
    houseNumber: b.huisnummer,
    postalCode: b.postcode,
    vatNumber: b.btw,
    source: "register",
    active: b.actief,
  };
}
