// ---------------------------------------------------------------------------
// Past de naam die de bank teruggeeft bij de naam in het ZekerFlex-profiel?
//
// Banken schrijven de tenaamstelling op hun eigen manier: "B. van Essen",
// "VAN ESSEN B", "HR/MW I POPESCU", "N NECIP", "B VAN ESSEN EN/OF M JANSEN".
// Iemand moet zijn profiel daar niet naar hoeven aan te passen. De regel:
//   - een achternaam van de bank (zonder tussenvoegsel als "van", "de") staat
//     ook in de profielnaam, én
//   - heeft de bank voorletters, dan past er één bij een voornaam of roepnaam
//     uit het profiel (de eerste letter);
//   - bij een en/of-rekening is één passende houder genoeg.
// Hoofdletters, accenten, punten en de volgorde maken niet uit. Een rekening
// van iemand anders (andere achternaam, of andere voorletter) past niet.
// Puur bestand: geen database, dus ook in tests en elders bruikbaar.
// ---------------------------------------------------------------------------

const TUSSENVOEGSELS = new Set([
  "van", "de", "der", "den", "het", "ten", "ter", "te", "op", "in", "vd", "vder",
  "la", "le", "du", "da", "di", "del", "della", "dos", "das", "von", "vom", "zu", "el", "al",
]);
const TITELS = new Set([
  "hr", "mw", "mevr", "mevrouw", "dhr", "heer", "mr", "mrs", "ms", "dr", "drs", "ir", "ing", "prof", "ds", "bc",
  "msc", "bsc", "ma", "ba", "jr", "sr", "fam", "familie", "erven",
]);

function normaliseer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bv\s*\/\s*d\b/g, " vd ") // "v/d" = van de(r)
    .replace(/\bv\.\s*d\.?/g, " vd "); // "v.d." = van de(r)
}

function woorden(deel: string): string[] {
  return deel
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((w) => w && !TITELS.has(w));
}

/** Een tenaamstelling kan meer houders hebben: "A JANSEN EN/OF B JANSEN". */
function houders(bankNaam: string): string[] {
  return normaliseer(bankNaam)
    .split(/\s+(?:en\s*\/\s*of|e\s*\/\s*o|en|of)\s+|\s*[&+]\s*/)
    .map((h) => h.trim())
    .filter(Boolean);
}

interface Delen {
  /** losse letters ("b", of "bj" uit "B.J.") */
  voorletters: string[];
  /** echte woorden (minstens 2 letters), zonder tussenvoegsels */
  namen: string[];
}

function splits(tokens: string[]): Delen {
  const voorletters: string[] = [];
  const namen: string[] = [];
  for (const t of tokens) {
    if (TUSSENVOEGSELS.has(t)) continue;
    if (t.length === 1) voorletters.push(t);
    // "BJ" zonder punten = twee voorletters (alleen medeklinkers, kort)
    else if (t.length <= 3 && !/[aeiouy]/.test(t)) voorletters.push(...t.split(""));
    else namen.push(t);
  }
  return { voorletters, namen };
}

/**
 * Een naam als vergelijkbare vorm: de woorden aaneen ("el bouti" = "elbouti") en de
 * woorden in vaste volgorde ("vries jan de" = "jan de vries"). Nooit de letters zelf
 * sorteren: dan zijn "Jan Smit" en "Tim Jans" dezelfde naam.
 */
function vormen(tokens: string[]): string[] {
  return [tokens.join(""), [...tokens].sort().join(" ")];
}

function zelfdeVorm(a: string[], b: string[]): boolean {
  const [aaneenA, volgordeA] = vormen(a);
  const [aaneenB, volgordeB] = vormen(b);
  return aaneenA === aaneenB || volgordeA === volgordeB;
}

/**
 * Is dit dezelfde naam, alleen anders geschreven? "El Bouti" = "Elbouti" = "EL-BOUTI",
 * "Jan de Vries" = "Vries, Jan de" = "Jan Vries". Een andere achternaam of voornaam is
 * een ander mens en blijft dus niet gelijk. Voor het document van de ID-controle:
 * Stripe controleert document en selfie, deze regel controleert dat het bij het account hoort.
 */
export function naamGelijk(a: string, b: string): boolean {
  const ta = woorden(normaliseer(a));
  const tb = woorden(normaliseer(b));
  if (ta.length === 0 || tb.length === 0) return false;
  if (zelfdeVorm(ta, tb)) return true;
  const zonder = (t: string[]) => t.filter((w) => !TUSSENVOEGSELS.has(w));
  const za = zonder(ta);
  const zb = zonder(tb);
  return za.length > 0 && zb.length > 0 && zelfdeVorm(za, zb);
}

/**
 * De achternaam van de bank is aaneen of met spatie geschreven ("B. El Bouti" tegenover
 * "Bilal Elbouti"): plak de woorden zonder voorletters aan elkaar en zoek ze in het profiel.
 */
function plakPast(profielTokens: string[], bankHouder: string): boolean {
  const bankTokens = woorden(bankHouder);
  const isVoorletters = (t: string) => t.length === 1 || (t.length <= 3 && !/[aeiouy]/.test(t));
  const bankPlak = bankTokens.filter((t) => !isVoorletters(t)).join("");
  if (bankPlak.length < 4 || !profielTokens.join("").includes(bankPlak)) return false;
  const bankVoorletters = bankTokens.filter((t) => t.length === 1);
  if (bankVoorletters.length === 0) return true;
  return bankVoorletters.some((v) => profielTokens.some((t) => t.startsWith(v)));
}

function houderPast(profielTokens: string[], bankHouder: string): boolean {
  if (plakPast(profielTokens, bankHouder)) return true;
  const bank = splits(woorden(bankHouder));
  const profiel = profielTokens.filter((t) => !TUSSENVOEGSELS.has(t));
  const profielNamen = new Set(profiel.filter((t) => t.length >= 2));

  const treffers = bank.namen.filter((n) => profielNamen.has(n));
  // minstens één achternaam moet overeenkomen (en niet alleen een heel kort woord)
  if (!treffers.some((t) => t.length >= 3)) return false;

  // De rest van het profiel zijn voornamen, roepnamen of voorletters.
  const overigProfiel = profiel.filter((t) => !treffers.includes(t));
  // Woorden van de bank die niet in het profiel staan, tellen als voornaam: hun eerste letter.
  const bankVoorletters = [...bank.voorletters, ...bank.namen.filter((n) => !treffers.includes(n)).map((n) => n[0] ?? "")].filter(Boolean);

  if (bankVoorletters.length === 0) return true; // de bank noemt alleen namen die allemaal in het profiel staan
  if (overigProfiel.length === 0) return true; // profiel heeft alleen een achternaam: achternaam is dan genoeg
  const profielVoorletters = new Set(overigProfiel.map((t) => t[0] ?? ""));
  return bankVoorletters.some((v) => profielVoorletters.has(v));
}

/** Past de tenaamstelling van de bank bij de profielnaam? */
export function banknaamPast(profielNaam: string, bankNaam: string): boolean {
  const profielTokens = woorden(normaliseer(profielNaam));
  if (profielTokens.length === 0) return false;
  return houders(bankNaam).some((h) => houderPast(profielTokens, h));
}
