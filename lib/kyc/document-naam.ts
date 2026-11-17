// ---------------------------------------------------------------------------
// Hoort de naam op het document (MRZ of chip) bij dit account? (review 06, M3; soepeler 17 nov 2026)
// Een losse gelijkenis (nameSimilarity ≥ 0,5) liet "Jan Jansen" ≈ "Piet Jansen" door. De regel hier: de achternaam
// van het document staat in de accountnaam (tussenvoegsels tellen niet, aaneen geschreven mag), én een voornaam van
// het document is in de accountnaam terug te vinden. Hoofdletters, accenten en de volgorde maken niet uit.
//
// Gemeten 17 nov 2026 (24 eigen ID-controles): 8 gingen naar een mens met een naamreden, 5 alleen daarom; bij 7 van
// de 8 stond de eerste officiële voornaam van het document niet in de accountnaam (roepnaam of tweede voornaam), terwijl
// de achternaam wél paste; 7 van de 8 keurde een mens daarna goed. Daarom telt nu, naast de eerste voornaam:
//  - elke voornaam van het document ("Pieter" bij "JAN PIETER");
//  - een verkorting met dezelfde letters ("Alex" bij "ALEXANDER", "Chris" bij "CHRISTIAAN", minstens 3 letters);
//  - een bekende Nederlandse roepnaam bij de officiële naam (ROEPNAMEN: "Hans" bij "JOHANNES", "Kees" bij "CORNELIS");
//  - alleen voorletters in het account ("J. de Vries" bij "JOHANNES"): de voorletter is de eerste letter van een voornaam;
//  - de MRZ-omzetting van bijzondere letters (Duits/Scandinavisch: MUELLER = Müller, ij/y) aan beide kanten;
//  - een afgekapte naam: de MRZ heeft een vaste breedte (30/31/39 tekens) en kapt het laatste woord af; alleen als het
//    naamveld vol staat mag dat laatste woord als begin van het accountwoord gelden.
// Wat een mens blijft: een andere achternaam, een voornaam zonder enig verband ("Bo" bij "JOHANNES"), of alleen een
// gedeelde achternaam. De documentcontrole zelf (MRZ, chip, gezicht) staat hier los van.
// Puur: tests/kyc-document-naam.test.ts.
// ---------------------------------------------------------------------------

const TUSSENVOEGSELS = new Set([
  "van", "de", "der", "den", "het", "ten", "ter", "te", "op", "in", "vd", "aan", "t",
  "la", "le", "du", "da", "di", "del", "della", "dos", "das", "von", "vom", "zu", "el", "al",
]);

/**
 * Nederlandse roepnamen bij de officiële voornaam zoals die op een paspoort staat (klein, zonder accenten). Alleen
 * gangbare, eenduidige paren; een roepnaam die hier niet staat en niet op de officiële naam lijkt, blijft een mens.
 */
export const ROEPNAMEN: Readonly<Record<string, readonly string[]>> = {
  hans: ["johannes"], jan: ["johannes", "johan"], johan: ["johannes"], joop: ["johannes"], jo: ["johannes", "johanna"],
  jos: ["jozef", "josephus", "johannes"], sjef: ["jozef", "josephus"], kees: ["cornelis"], cor: ["cornelis", "cornelia"],
  bram: ["abraham"], piet: ["petrus", "pieter"], peter: ["petrus"], henk: ["hendrik", "hendrikus"], rik: ["hendrik", "frederik", "erik"],
  harry: ["hendrik", "harold"], wim: ["willem", "wilhelmus"], willem: ["wilhelmus"], wil: ["wilhelmus", "wilhelmina", "willem"],
  willy: ["wilhelmus", "wilhelmina", "willem"], bert: ["albert", "albertus", "hubert", "hubertus", "lambertus", "egbert", "bertus"],
  gerrit: ["gerardus", "gerard"], gerard: ["gerardus"], theo: ["theodorus", "theodoor"], dick: ["theodorus", "diederik"],
  koos: ["jacobus"], jaap: ["jacobus", "jacob"], sjaak: ["jacobus"], co: ["jacobus", "jacoba"], coby: ["jacoba"],
  thijs: ["matthijs", "mattheus", "matthias"], ties: ["matthijs", "mattheus"], mees: ["bartholomeus"], bart: ["bartholomeus"],
  huub: ["hubertus"], frans: ["franciscus"], toon: ["antonius", "anton"], ton: ["antonius", "anton"], teun: ["antonius", "teunis"],
  ad: ["adrianus", "adriaan"], aad: ["adrianus"], arie: ["adrianus", "arend"], rinus: ["marinus"], rien: ["marinus"],
  nico: ["nicolaas"], klaas: ["nicolaas"], niek: ["nicolaas"], leo: ["leonardus"], fred: ["frederik", "alfred"], freek: ["frederik"],
  rob: ["robert", "robertus"], herman: ["hermanus"], sjors: ["george", "georgius"], ruud: ["rudolf", "rudolphus"],
  michel: ["michael"], chiel: ["michiel", "michael"], ben: ["benjamin", "bernardus"], bernard: ["bernardus"],
  lau: ["laurens", "laurentius"], lauren: ["laurentius"], sem: ["samuel"], stef: ["stefanus", "stephanus"], steven: ["stefanus", "stephanus"],
  evert: ["evertus"], gijs: ["gijsbertus", "gijsbert"], joost: ["justus", "judocus"], luuk: ["lucas"], luc: ["lucas"],
  max: ["maximiliaan"], tom: ["thomas"], tim: ["timotheus"], sander: ["alexander"], lex: ["alexander"], xander: ["alexander"],
  daan: ["daniel"], danny: ["daniel"], dennis: ["dionysius"], eddy: ["eduard", "edward"], ed: ["eduard", "edward"],
  mart: ["martinus", "martin"], martijn: ["martinus"], tinus: ["martinus"], paul: ["paulus"], bas: ["sebastiaan"],
  stijn: ["christiaan", "constantijn"], kris: ["christiaan", "christina"], chris: ["christiaan", "christina", "christoffel"],
  mohamed: ["mohammed", "mohammad", "muhammad"], mohammed: ["mohamed", "mohammad", "muhammad"],
  mies: ["maria"], riet: ["maria"], ria: ["maria"], marijke: ["maria"], marie: ["maria"], miep: ["maria"], marian: ["maria"], mieke: ["maria"],
  nel: ["petronella", "cornelia"], nelly: ["petronella", "cornelia"], els: ["elisabeth"], lies: ["elisabeth"], bep: ["elisabeth"],
  betty: ["elisabeth"], liesbeth: ["elisabeth"], ans: ["anna", "johanna"], annie: ["anna", "johanna"], antje: ["anna"], hanna: ["johanna"],
  truus: ["geertruida"], trudy: ["geertruida"], greet: ["margaretha"], gretha: ["margaretha"], margriet: ["margaretha"],
  toos: ["catharina"], kaat: ["catharina"], trijntje: ["catharina"], mina: ["wilhelmina"], henny: ["hendrika", "hendrik"], riek: ["hendrika"],
  gerda: ["gerarda"], door: ["theodora"], thea: ["theodora"], fien: ["josephina"], sjaan: ["adriana"], sjan: ["adriana"],
  lenie: ["helena"], leny: ["helena"], lena: ["helena"], stien: ["christina"], pauline: ["paulina"],
};

/** De naamvelden van de MRZ of de chip; "VAN ESSEN" / "BRIANDO JAN". */
export interface DocumentNaam {
  achternaam: string;
  voornamen: string;
}

/** Letters die geen accent-ontleding hebben, zoals de MRZ ze schrijft (ICAO 9303: ø → OE, æ → AE, å → AA, ß → SS). */
const LOSSE_LETTERS: Readonly<Record<string, string>> = { ø: "oe", æ: "ae", å: "aa", ß: "ss", ð: "d", þ: "th", ł: "l", œ: "oe", ı: "i" };

/** Klein, zonder accenten; bijzondere letters zoals de MRZ ze omzet. */
function basis(s: string): string {
  return s
    .toLowerCase()
    .replace(/[øæåßðþłœı]/g, (c) => LOSSE_LETTERS[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** De woorden van een naam (klein, zonder accenten); een koppelteken of apostrof scheidt woorden. */
export function naamWoorden(s: string): string[] {
  return basis(s).split(/[^a-z]+/).filter(Boolean);
}

/**
 * Dezelfde letters aan beide kanten: de MRZ zet ü om in UE, ö in OE, ä in AE, ß in SS en kent geen ij; na het weghalen
 * van accenten staat er "u" tegenover "ue". Beide kanten vouwen we tot één vorm, zodat Müller = MUELLER = Muller en
 * Thijs = THYS. Alleen voor vergelijken, nooit voor tonen.
 */
export function vouwLetters(w: string): string {
  return w.replace(/ue/g, "u").replace(/oe/g, "o").replace(/ae/g, "a").replace(/ss/g, "s").replace(/ij/g, "y").replace(/y/g, "i");
}

const zonderTussenvoegsels = (ws: readonly string[]): string[] => ws.filter((w) => !TUSSENVOEGSELS.has(w));
const zelfde = (a: string, b: string): boolean => vouwLetters(a) === vouwLetters(b);

/**
 * Een verkorting in het account van de officiële voornaam: "alex"/"alexander", "chris"/"christiaan". Minstens 4 letters,
 * anders is "Jan" ook het begin van "Janneke"; kortere roepnamen (Max, Tom, Bas) staan in ROEPNAMEN.
 */
function verkorting(account: string, officieel: string): boolean {
  const k = vouwLetters(account);
  return k.length >= 4 && vouwLetters(officieel).startsWith(k) && k !== vouwLetters(officieel);
}

/** Een roepnaam uit het account bij de officiële voornaam van het document. */
function roepnaamBij(account: string, officieel: string): boolean {
  return (ROEPNAMEN[account] ?? []).some((o) => zelfde(o, officieel));
}

/**
 * Staat het naamveld van de MRZ vol? Dan is het laatste woord mogelijk afgekapt. TD1 (ID-kaart) heeft 30 tekens, TD2 31,
 * TD3 (paspoort) 39; de lezer haalt de vulling (<) aan het eind weg, dus een afgekapt veld is precies zo breed.
 */
export function naamveldVol(doc: DocumentNaam): boolean {
  const breedte = basis(doc.achternaam).replace(/\s+/g, "<").length + 2 + basis(doc.voornamen).replace(/\s+/g, "<").length;
  return breedte >= 30;
}

/** Hoort de naam op het document bij deze accountnaam? Zie de uitleg bovenaan. */
export function documentNaamPast(accountNaam: string, doc: DocumentNaam): boolean {
  const account = naamWoorden(accountNaam);
  const accountZonder = zonderTussenvoegsels(account);
  const achterAlle = naamWoorden(doc.achternaam);
  const achter = zonderTussenvoegsels(achterAlle);
  const voornamen = zonderTussenvoegsels(naamWoorden(doc.voornamen));
  if (achter.length === 0 || voornamen.length === 0 || account.length === 0) return false;

  const vol = naamveldVol(doc);
  // het laatste woord van het veld (de laatste voornaam) kan afgekapt zijn; dan telt het als begin van het accountwoord
  const laatsteVoornaam = voornamen[voornamen.length - 1] as string;
  const afgekaptPast = (docWoord: string, accountWoord: string): boolean =>
    vol && docWoord === laatsteVoornaam && docWoord.length >= 3 && vouwLetters(accountWoord).startsWith(vouwLetters(docWoord));

  // achternaam: elk woord van het document staat in het account; aaneengeschreven ("El Bouti" = "Elbouti") alleen als
  // hele, opeenvolgende woorden: "Jong" is niet "Jan de Jonge"
  const doelAaneen = vouwLetters(achterAlle.join(""));
  let aaneen = false;
  for (let i = 0; i < account.length && !aaneen; i++) {
    for (let j = i + 1; j <= account.length && !aaneen; j++) aaneen = vouwLetters(account.slice(i, j).join("")) === doelAaneen;
  }
  const achternaamPast = achter.every((w) => accountZonder.some((a) => zelfde(a, w))) || aaneen;
  if (!achternaamPast) return false;

  // voornaam: een van de voornamen van het document is in het account terug te vinden
  const voorletters = accountZonder.filter((a) => a.length === 1);
  const alleenVoorletters = voorletters.length > 0 && accountZonder.every((a) => a.length === 1 || achter.some((w) => zelfde(a, w)));
  return voornamen.some(
    (v) =>
      accountZonder.some((a) => zelfde(a, v) || verkorting(a, v) || roepnaamBij(a, v) || afgekaptPast(v, a)) ||
      (alleenVoorletters && voorletters.some((l) => v.startsWith(l))),
  );
}
