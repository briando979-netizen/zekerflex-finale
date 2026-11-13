// ---------------------------------------------------------------------------
// "Vertel je idee" (13 nov 2026): iemand typt of spreekt in één of twee zinnen in wat hij wil ("een webshop voor
// handgemaakte sieraden, hij heet Zilverlicht, in Utrecht") en wij kiezen het startpunt dat erbij past en halen de naam en
// de plaats eruit. Daarna staat het gewone startformulier van de Studio al goed en is één klik genoeg.
// Bewust zonder AI: het antwoord staat er meteen, kost niets en verzint niets. Puur bestand, ook voor de browser (dus geen
// lookbehind in een regex: tests/regex-safari.test.ts).
// ---------------------------------------------------------------------------

export type IdeeSoort = "website" | "webshop";

export interface IdeeUitkomst {
  /** het startpunt dat het beste past; "algemeen" als niets herkend is */
  templateId: string;
  /** of er woorden herkend zijn (anders is het de algemene keuze) */
  herkend: boolean;
  /** de naam van het bedrijf, als die genoemd is; anders leeg */
  naam: string;
  /** de plaats, als die genoemd is; anders leeg */
  plaats: string;
}

// Per startpunt het begin van woorden die erbij horen (zonder accenten, kleine letters). "bakker" past dus ook op "bakkerij".
const WEBSITE: Record<string, readonly string[]> = {
  horeca: ["restaurant", "cafe", "eetcafe", "lunchroom", "catering", "bistro", "pizzeria", "snackbar", "cafetaria", "horeca", "kroeg", "brasserie", "ijssalon", "koffiebar", "foodtruck", "hotel", "bakker", "afhaal"],
  bouw: ["bouw", "aannemer", "klusbedrijf", "klusjesman", "timmer", "schilder", "stukadoor", "loodgieter", "installateur", "installatie", "elektricien", "dakdekker", "metselaar", "tegelzetter", "verbouw", "renovatie", "hovenier", "tuinman", "stratenmaker"],
  schoonmaak: ["schoonmaak", "glazenwasser", "glasbewassing", "poets", "reiniging", "facilitair", "huishoudelijk"],
  logistiek: ["transport", "koerier", "logistiek", "verhuis", "opslag", "vracht", "bezorg", "expeditie", "taxi"],
  zorg: ["zorg", "praktijk", "fysio", "therapeut", "therapie", "psycholoog", "coach", "tandarts", "huisarts", "thuiszorg", "dietist", "verloskundig", "massage", "pedicure", "logopedi"],
  kapper: ["kapper", "kapsalon", "barbier", "barber", "schoonheid", "nagel", "beauty", "salon", "visagi", "wimper", "haar"],
  garage: ["garage", "autobedrijf", "auto", "banden", "apk", "monteur", "autoschade", "occasion", "motor", "fiets"],
};

const WEBSHOP: Record<string, readonly string[]> = {
  mode: ["kleding", "mode", "fashion", "schoen", "tas", "tassen", "sieraad", "sieraden", "juwel", "accessoire", "horloge", "jurk", "shirt", "broek", "babykleding", "kinderkleding", "zonnebril", "sjaal"],
  eten: ["eten", "drinken", "koffie", "thee", "bakker", "taart", "gebak", "chocola", "delicatesse", "wijn", "bier", "kaas", "kruiden", "honing", "snoep", "noten", "olijfolie", "vlees", "groente", "fruit"],
  wonen: ["wonen", "woon", "interieur", "meubel", "plant", "kaars", "cadeau", "decoratie", "kussen", "keramiek", "servies", "lamp", "poster", "speelgoed", "knutsel", "kerst", "bloem"],
  beauty: ["beauty", "verzorging", "cosmetica", "make-up", "makeup", "huidverzorging", "zeep", "parfum", "shampoo", "supplement", "vitamine", "gezondheid", "welzijn", "massageolie", "nagellak"],
  vakwinkel: ["gereedschap", "onderdelen", "onderdeel", "werkkleding", "techniek", "elektronica", "ijzerwaren", "machine", "bouwmateria", "kabel", "installatiemateria", "zakelijk", "groothandel", "kantoorartikel", "veiligheid"],
};

const zonderAccenten = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** De woorden van een zin: kleine letters, zonder accenten. */
function woorden(tekst: string): string[] {
  return zonderAccenten(tekst.toLowerCase())
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 1);
}

function netjes(s: string, max: number): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”‘’.,:;!?-]+|[\s"'“”‘’.,:;!?-]+$/g, "")
    .slice(0, max)
    .trim();
}

/** "…in Utrecht": een woord met een hoofdletter (of twee, of met een streepje) na "in" of "uit". */
function plaatsUit(tekst: string): string {
  const m = /(?:^|\s)(?:in|uit|te)\s+((?:'s-|'t )?[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:[ -][A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+){0,2})/.exec(tekst);
  const p = m?.[1] ? netjes(m[1], 80) : "";
  // geen land of streek als plaats van het bedrijf
  return /^(Nederland|Belgi[eë]|Europa|Duitsland)$/i.test(p) ? "" : p;
}

/** De naam: tussen aanhalingstekens, of na "heet", "genaamd", "de naam is". */
function naamUit(tekst: string): string {
  const quote = /["“”]([^"“”\n]{2,60})["“”]/.exec(tekst);
  if (quote?.[1]) return netjes(quote[1], 100);
  const m = /(?:^|\s)(?:heet|heten|genaamd|de naam is|naam is|met de naam|onder de naam)\s+([^\n.,;!?]{2,60})/i.exec(tekst);
  if (!m?.[1]) return "";
  // "heet Zilverlicht in Utrecht en verkoopt…": alleen het begin, tot een voegwoord of de plaats
  const ruw = m[1].split(/\s+(?:in|uit|te|en|maar|want|die|dat|voor|met)\s+/)[0] ?? "";
  return netjes(ruw, 100);
}

/**
 * Leest een idee. `beschikbaar` zijn de startpunten die het scherm aanbiedt; een keuze die daar niet in staat valt terug op
 * het eerste startpunt. Geeft null bij een lege of te korte zin.
 */
export function leesIdee(tekst: string, soort: IdeeSoort, beschikbaar: readonly string[]): IdeeUitkomst | null {
  const zin = tekst.trim().slice(0, 1000);
  if (zin.length < 4) return null;
  const tabel = soort === "webshop" ? WEBSHOP : WEBSITE;
  const ww = woorden(zin);
  let beste = "";
  let score = 0;
  for (const id of Object.keys(tabel)) {
    if (!beschikbaar.includes(id)) continue;
    const begin = tabel[id] ?? [];
    const n = ww.filter((w) => begin.some((b) => w.startsWith(b))).length;
    if (n > score) {
      beste = id;
      score = n;
    }
  }
  const terugval = beschikbaar.includes("algemeen") ? "algemeen" : (beschikbaar[0] ?? "algemeen");
  return { templateId: score > 0 ? beste : terugval, herkend: score > 0, naam: naamUit(zin), plaats: plaatsUit(zin) };
}
