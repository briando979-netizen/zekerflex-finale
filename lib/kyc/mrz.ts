// ---------------------------------------------------------------------------
// MRZ lezen (9 nov 2026): de machineleesbare regels onderop een paspoort of
// ID-kaart, volgens ICAO 9303. Uit de tekst die de OCR vindt halen we het
// soort document, het land, het documentnummer, de geboorte- en vervaldatum en
// de naam, en we rekenen de controlecijfers na. Klopt een controlecijfer, dan
// is dat veld echt zo van het document gelezen; dat is hard bewijs, zonder
// biometrie en zonder externe dienst.
//
// Privacy: het vrije veld ("optional data") bevat op een Nederlandse ID-kaart
// en in een Nederlands paspoort het BSN. Dat veld gebruiken we alleen om het
// samengestelde controlecijfer na te rekenen en geven we NOOIT terug.
//
// Puur bestand (geen OCR, geen database): los te testen in tests/kyc-mrz.test.ts.
// De OCR zelf staat in lib/kyc/mrz-lezen.ts.
// ---------------------------------------------------------------------------

export type MrzFormaat = "TD1" | "TD2" | "TD3";
export type MrzSoort = "PASSPORT" | "ID_CARD" | "OTHER";

export interface MrzUitslag {
  formaat: MrzFormaat;
  soort: MrzSoort;
  /** uitgevend land, drie letters (NLD, BEL, D<< voor Duitsland) */
  land: string;
  documentnummer: string;
  nationaliteit: string;
  /** yyyy-mm-dd, of null als de datum geen echte datum is */
  geboortedatum: string | null;
  vervaldatum: string | null;
  geslacht: "M" | "V" | "X";
  achternaam: string;
  voornamen: string;
  controles: { documentnummer: boolean; geboortedatum: boolean; vervaldatum: boolean; totaal: boolean };
  /**
   * de velden die we gebruiken (nummer, geboortedatum, vervaldatum) hebben elk
   * een kloppend controlecijfer: die zijn dus echt zo van het document gelezen
   */
  geldig: boolean;
  /** ook het samengestelde controlecijfer klopt (dat dekt ook het vrije veld, dat we niet gebruiken) */
  volledig: boolean;
  /** de vervaldatum ligt vóór vandaag */
  verlopen: boolean;
}

const LENGTE: Record<MrzFormaat, number> = { TD1: 30, TD2: 36, TD3: 44 };

/** De waarde van één MRZ-teken: 0–9, A=10 … Z=35, < = 0. */
function waarde(c: string): number {
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
  return 0;
}

/** Het controlecijfer van ICAO 9303: gewichten 7-3-1, som modulo 10. */
export function controleCijfer(s: string): number {
  const gewicht = [7, 3, 1];
  let som = 0;
  for (let i = 0; i < s.length; i++) som += waarde(s[i] ?? "<") * (gewicht[i % 3] ?? 1);
  return som % 10;
}

const klopt = (veld: string, cijfer: string | undefined): boolean =>
  cijfer !== undefined && /^\d$/.test(cijfer) && controleCijfer(veld) === Number(cijfer);

// OCR verwart letters en cijfers die op elkaar lijken. Op een plek waar alleen
// een cijfer kan staan (datum, controlecijfer) maken we er een cijfer van, op een
// plek voor letters (land, naam) een letter.
const NAAR_CIJFER: Record<string, string> = { O: "0", Q: "0", D: "0", U: "0", I: "1", L: "1", T: "1", Z: "2", S: "5", B: "8", G: "6" };
const NAAR_LETTER: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G" };
const cijfers = (s: string) => [...s].map((c) => (Object.hasOwn(NAAR_CIJFER, c) ? NAAR_CIJFER[c]! : c)).join("");
const letters = (s: string) => [...s].map((c) => (Object.hasOwn(NAAR_LETTER, c) ? NAAR_LETTER[c]! : c)).join("");

/** Tekens die OCR voor "<" aanziet (geen letters: die kunnen echt zijn). */
const SCHUIN = /[«‹(\[{|]/g;

/** Maakt één OCR-regel MRZ-achtig: hoofdletters, geen spaties, alleen A–Z 0–9 <. */
function schoon(regel: string): string {
  return regel
    .toUpperCase()
    .replace(SCHUIN, "<")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9<]/g, "");
}

/**
 * Lijkt deze regel op een MRZ-regel? (Bijna) alleen MRZ-tekens. Kort mag: de
 * OCR laat de vulling (<<<) aan het eind vaak weg, en een naamregel is dan kort.
 */
function lijktMrz(ruw: string, schoonRegel: string): boolean {
  if (schoonRegel.length < 5 || schoonRegel.length > 48) return false;
  const zonderSpaties = ruw.replace(/\s+/g, "");
  // een gewone zin heeft kleine letters en leestekens; een MRZ-regel bijna niet
  return schoonRegel.length >= zonderSpaties.length * 0.85;
}

/** De vaste middelste regel van een ID-kaart: geboortedatum, cijfer, geslacht, vervaldatum, cijfer, land. */
const TD1_MIDDEN = /^[0-9OQDUILTZSBG]{7}[MF<X][0-9OQDUILTZSBG]{7}[A-Z0-9<]{3}/;
/** De tweede regel van een paspoort (TD3) of TD2: nummer, cijfer, land, geboorte + cijfer, geslacht, verval + cijfer. */
const TD3_TWEEDE = /^[A-Z0-9<]{9}[0-9OQDUILTZSBG][A-Z0-9<]{3}[0-9OQDUILTZSBG]{7}[MF<X][0-9OQDUILTZSBG]{7}/;

/**
 * Een los teken vóór een regel (vlekje, rand van de kaart) schuift alles op.
 * We schuiven hooguit drie tekens tot het vaste patroon past.
 */
function uitlijnen(r: string, patroon: RegExp): string | null {
  for (let k = 0; k <= Math.min(3, r.length - 20); k++) if (patroon.test(r.slice(k))) return r.slice(k);
  return null;
}

/** Brengt een regel op de juiste lengte: vullen met "<" aan het eind (vulling valt bij OCR vaak weg). */
function opLengte(r: string, lengte: number): string {
  return r.length >= lengte ? r.slice(0, lengte) : r.padEnd(lengte, "<");
}

/**
 * Zet een regel die op een controlecijfer eindigt op lengte: ontbrekende
 * vulling hoort vóór dat laatste cijfer, niet erachter.
 */
function opLengteMetSlot(r: string, lengte: number, vrijVanaf: number): string {
  if (r.length === lengte) return r;
  if (r.length > lengte) return r.slice(0, lengte);
  const slot = r.slice(-1);
  const kop = r.slice(0, -1);
  if (kop.length < vrijVanaf) return r.padEnd(lengte, "<");
  return kop.padEnd(lengte - 1, "<") + slot;
}

/** Zoekt in OCR-tekst de MRZ-regels (2 of 3 achter elkaar) en zet ze op lengte. */
export function zoekMrz(tekst: string): { formaat: MrzFormaat; regels: string[] } | null {
  const kandidaten = tekst
    .split(/\r?\n/)
    .map((ruw) => ({ ruw, r: schoon(ruw) }))
    .filter(({ ruw, r }) => lijktMrz(ruw, r))
    .map(({ r }) => r);

  // TD1 (ID-kaart, 3 × 30): we zoeken de vaste middelste regel; de eerste begint
  // met I, A of C en heeft minstens het documentnummer, de derde is de naam
  for (let i = 1; i + 1 < kandidaten.length; i++) {
    const b = kandidaten[i]!.length >= 26 && kandidaten[i]!.length <= 34 ? uitlijnen(kandidaten[i]!, TD1_MIDDEN) : null;
    const a = uitlijnen(kandidaten[i - 1]!, /^[IAC][A-Z0-9<][A-Z<]{3}/);
    const c = kandidaten[i + 1]!;
    if (b && a && a.length >= 15 && a.length <= 33 && c.length <= 33) {
      return { formaat: "TD1", regels: [opLengte(a, 30), opLengteMetSlot(b, 30, 18), opLengte(c, 30)] };
    }
  }
  // TD3 (paspoort, 2 × 44) of TD2 (2 × 36): de tweede regel is vol (hij eindigt op
  // een controlecijfer), de eerste begint met P, I, A, C of V en is de naamregel
  for (let i = 0; i + 1 < kandidaten.length; i++) {
    const a = uitlijnen(kandidaten[i]!, /^[PIACV][A-Z0-9<][A-Z<]{3}/);
    const b = uitlijnen(kandidaten[i + 1]!, TD3_TWEEDE);
    if (!a || !b || a.length < 10) continue;
    const formaat: MrzFormaat | null = b.length >= 40 && b.length <= 46 ? "TD3" : b.length >= 33 && b.length <= 38 ? "TD2" : null;
    if (!formaat) continue;
    const n = LENGTE[formaat];
    return { formaat, regels: [opLengte(a, n), opLengteMetSlot(b, n, 28)] };
  }
  return null;
}

/** yymmdd → yyyy-mm-dd; null als het geen bestaande datum is. */
function datum(yymmdd: string, soort: "geboorte" | "verval", nu: Date): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  const ditJaar = nu.getUTCFullYear() % 100;
  // geboren: niet in de toekomst; verlopen: documenten gelden hooguit ~ 20 jaar vooruit
  const eeuw = soort === "geboorte" ? (yy > ditJaar ? 1900 : 2000) : yy > ditJaar + 50 ? 1900 : 2000;
  const jaar = eeuw + yy;
  const d = new Date(Date.UTC(jaar, mm - 1, dd));
  if (d.getUTCFullYear() !== jaar || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${jaar}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** "VAN<ESSEN<<BRIANDO<JAN" → achternaam "VAN ESSEN", voornamen "BRIANDO JAN". */
function namen(veld: string): { achternaam: string; voornamen: string } {
  const [achter = "", ...rest] = letters(veld).split("<<");
  const netjes = (s: string) => s.replace(/<+/g, " ").trim().replace(/\s+/g, " ");
  return { achternaam: netjes(achter), voornamen: netjes(rest.join("<<")) };
}

const geslacht = (c: string): MrzUitslag["geslacht"] => (c === "M" ? "M" : c === "F" ? "V" : "X");

const soortVan = (code: string): MrzSoort => (code.startsWith("P") ? "PASSPORT" : /^[IAC]/.test(code) ? "ID_CARD" : "OTHER");

const telBits = (x: number): number => {
  let n = 0;
  for (let v = x; v; v &= v - 1) n++;
  return n;
};

/**
 * Een documentnummer met een verkeerd gelezen teken (O/0, I/1, S/5, B/8, Z/2)
 * maakt het controlecijfer kapot. We proberen de varianten, de kleinste
 * wijziging eerst, en herstellen alleen als er precies één variant klopt.
 * Twee plekken met hetzelfde gewicht (bijv. positie 0 en 3) zijn met geen enkel
 * controlecijfer uit elkaar te houden, ook niet met het samengestelde (dat begint
 * met hetzelfde nummer): dan gokken we niet en blijft het nummer ongeldig.
 */
function herstelNummer(nummer: string, cijfer: string | undefined, totaalKlopt: (n: string) => boolean): string {
  if (klopt(nummer, cijfer)) return nummer;
  const wissel: Record<string, string> = { O: "0", "0": "O", I: "1", "1": "I", S: "5", "5": "S", B: "8", "8": "B", Z: "2", "2": "Z" };
  const plekken = [...nummer].map((c, i) => (Object.hasOwn(wissel, c) ? i : -1)).filter((i) => i >= 0).slice(0, 8);
  const maskers = Array.from({ length: (1 << plekken.length) - 1 }, (_, i) => i + 1).sort((a, b) => telBits(a) - telBits(b));
  for (let wijzigingen = 1; wijzigingen <= plekken.length; wijzigingen++) {
    const passend = maskers
      .filter((m) => telBits(m) === wijzigingen)
      .map((masker) => {
        const tekens = [...nummer];
        plekken.forEach((p, bit) => {
          if (masker & (1 << bit)) tekens[p] = wissel[tekens[p]!] ?? tekens[p]!;
        });
        return tekens.join("");
      })
      .filter((p) => klopt(p, cijfer) && totaalKlopt(p));
    if (passend.length === 1) return passend[0]!;
    if (passend.length > 1) return nummer; // dubbelzinnig: niet gokken
  }
  return nummer;
}

/** Leest de velden uit gevonden MRZ-regels en rekent alle controlecijfers na. */
export function leesMrz(formaat: MrzFormaat, regels: string[], nu: Date = new Date()): MrzUitslag | null {
  const n = LENGTE[formaat];
  if (regels.length !== (formaat === "TD1" ? 3 : 2) || regels.some((r) => r.length !== n)) return null;

  let code: string, land: string, nummerVeld: string, nummerCijfer: string | undefined;
  let geboorte: string, geboorteCijfer: string | undefined, sekse: string, verval: string, vervalCijfer: string | undefined;
  let nationaliteit: string, totaalCijfer: string | undefined, naamVeld: string;
  /** de tekst waarover het samengestelde controlecijfer gaat, voor een gegeven documentnummer */
  let totaalVoor: (nummer: string) => string;

  if (formaat === "TD1") {
    const [r1, r2, r3] = [regels[0]!, regels[1]!, regels[2]!];
    code = letters(r1.slice(0, 2));
    land = letters(r1.slice(2, 5));
    nummerVeld = r1.slice(5, 14);
    nummerCijfer = cijfers(r1.slice(14, 15));
    const vrij1 = r1.slice(15, 30); // hier staat in NL het BSN: alleen voor het controlecijfer
    geboorte = cijfers(r2.slice(0, 6));
    geboorteCijfer = cijfers(r2.slice(6, 7));
    sekse = letters(r2.slice(7, 8));
    verval = cijfers(r2.slice(8, 14));
    vervalCijfer = cijfers(r2.slice(14, 15));
    nationaliteit = letters(r2.slice(15, 18));
    const staart = geboorte + geboorteCijfer + verval + vervalCijfer + r2.slice(18, 29);
    // een nummer langer dan 9 tekens loopt door in het vrije veld (controlecijfer is dan "<")
    if (r1[14] === "<" && /^[A-Z0-9]+</.test(vrij1)) {
      const verlenging = vrij1.slice(0, vrij1.indexOf("<"));
      nummerVeld = nummerVeld + verlenging.slice(0, -1);
      nummerCijfer = cijfers(verlenging.slice(-1));
      totaalVoor = () => r1.slice(5, 30) + staart;
    } else {
      totaalVoor = (nr) => nr + (nummerCijfer ?? "<") + vrij1 + staart;
    }
    totaalCijfer = cijfers(r2.slice(29, 30));
    naamVeld = r3;
  } else {
    const [r1, r2] = [regels[0]!, regels[1]!];
    code = letters(r1.slice(0, 2));
    land = letters(r1.slice(2, 5));
    naamVeld = r1.slice(5);
    nummerVeld = r2.slice(0, 9);
    nummerCijfer = cijfers(r2.slice(9, 10));
    nationaliteit = letters(r2.slice(10, 13));
    geboorte = cijfers(r2.slice(13, 19));
    geboorteCijfer = cijfers(r2.slice(19, 20));
    sekse = letters(r2.slice(20, 21));
    verval = cijfers(r2.slice(21, 27));
    vervalCijfer = cijfers(r2.slice(27, 28));
    const eind = formaat === "TD3" ? 43 : 35;
    // vrij veld (bij een NL-paspoort het BSN) + bij TD3 zijn eigen cijfer: alleen voor het controlecijfer
    const vrij = r2.slice(28, eind);
    totaalCijfer = cijfers(r2.slice(eind, eind + 1));
    totaalVoor = (nr) => nr + (nummerCijfer ?? "<") + geboorte + (geboorteCijfer ?? "<") + verval + (vervalCijfer ?? "<") + vrij;
  }

  // Nederlandse documentnummers bevatten nooit de letter O (sinds 2014): dat is altijd een 0
  if (land === "NLD") nummerVeld = nummerVeld.replace(/O/g, "0");
  const nummer = herstelNummer(nummerVeld, nummerCijfer, (nr) => klopt(totaalVoor(nr), totaalCijfer));

  const controles = {
    documentnummer: klopt(nummer, nummerCijfer),
    geboortedatum: klopt(geboorte, geboorteCijfer),
    vervaldatum: klopt(verval, vervalCijfer),
    totaal: klopt(totaalVoor(nummer), totaalCijfer),
  };
  const vervaldatum = datum(verval, "verval", nu);
  const vandaag = nu.toISOString().slice(0, 10);
  return {
    formaat,
    soort: soortVan(code),
    land,
    documentnummer: nummer.replace(/<+$/g, "").replace(/</g, ""),
    nationaliteit,
    geboortedatum: datum(geboorte, "geboorte", nu),
    vervaldatum,
    geslacht: geslacht(sekse),
    ...namen(naamVeld),
    controles,
    geldig: controles.documentnummer && controles.geboortedatum && controles.vervaldatum,
    volledig: controles.documentnummer && controles.geboortedatum && controles.vervaldatum && controles.totaal,
    verlopen: vervaldatum !== null && vervaldatum < vandaag,
  };
}

/** Zoeken en lezen in één: OCR-tekst erin, uitslag eruit (of null als er geen MRZ in staat). */
export function leesMrzUitTekst(tekst: string, nu: Date = new Date()): MrzUitslag | null {
  const gevonden = zoekMrz(tekst);
  return gevonden ? leesMrz(gevonden.formaat, gevonden.regels, nu) : null;
}

/** Hetzelfde documentnummer? Zonder spaties, hoofdletters, O en 0 gelijk (NL gebruikt geen O). */
export function zelfdeNummer(a: string, b: string): boolean {
  const n = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");
  return n(a) !== "" && n(a) === n(b);
}

/** De naam zoals op het document, voor vergelijken en tonen: "Briando van Essen". */
export function naamVoluit(u: Pick<MrzUitslag, "achternaam" | "voornamen">): string {
  const klein = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, voor: string, l: string) => voor + l.toUpperCase());
  return [klein(u.voornamen), klein(u.achternaam)].filter(Boolean).join(" ");
}
