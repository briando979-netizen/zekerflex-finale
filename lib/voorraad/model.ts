// ---------------------------------------------------------------------------
// Voorraad van een bedrijf (winkel, kapper/salon, bouw/installatie): wat ligt er, wat is bijna op, en een logboek van
// elke wijziging. Dit is het zuivere deel, zonder opslag (lib/voorraad/store.ts): invoer controleren met Nederlandse
// fouten, de regels voor een mutatie of telling, "bijna op", de voorraadwaarde, de bestellijst en de CSV.
// Geen koppeling met de webshop: dit onderdeel houdt alleen bij wat er ligt.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";

export const EENHEDEN = ["stuk", "doos", "liter", "kilo", "meter", "set"] as const;
export type Eenheid = (typeof EENHEDEN)[number];

/** Alleen deze eenheden mogen een decimaal aantal hebben (tot drie cijfers achter de komma). */
const DECIMAAL: readonly Eenheid[] = ["liter", "kilo", "meter"];
export const heeftDecimalen = (e: Eenheid): boolean => DECIMAAL.includes(e);

export const REDENEN = ["inkoop", "verkoop", "gebruikt", "verlies", "telling", "correctie"] as const;
export type Reden = (typeof REDENEN)[number];

export const REDEN_NAAM: Record<Reden, string> = {
  inkoop: "Inkoop",
  verkoop: "Verkoop",
  gebruikt: "Gebruikt",
  verlies: "Verlies of breuk",
  telling: "Telling",
  correctie: "Correctie",
};

/** Een artikel-id: 12 hexadecimale tekens (zo komt hij uit nieuwArtikelId in de opslag). */
export const ARTIKEL_ID = /^[a-f0-9]{12}$/;

const MAX_GETAL = 1_000_000_000;
const MAX_KOSTPRIJS_CENT = 100_000_000; // € 1.000.000 per eenheid

export interface Artikel {
  id: string;
  naam: string;
  /** artikelnummer; leeg = geen. Uniek per organisatie (hoofdletterongevoelig) als het is ingevuld */
  sku: string;
  eenheid: Eenheid;
  /** het huidige aantal; altijd begin + de som van alle mutaties (zie store.ts) */
  aantal: number;
  /** het aantal bij het aanmaken; staat niet in het logboek, zodat een artikel zonder mutaties te wissen is */
  begin: number;
  /** de waarschuwingsgrens; 0 = geen waarschuwing */
  minimum: number;
  /** in centen per eenheid; null = onbekend */
  kostprijsCent: number | null;
  leverancier: string;
  locatie: string;
  notitie: string;
  gearchiveerd: boolean;
  gemaaktOp: string;
  bijgewerktOp: string;
}

export interface Mutatie {
  id: string;
  artikelId: string;
  /** de verandering: positief erbij, negatief eraf */
  verschil: number;
  nieuwAantal: number;
  reden: Reden;
  opmerking: string;
  /** alleen het gebruikers-id, nooit een naam of e-mailadres */
  door: string;
  op: string;
}

export interface ArtikelInvoer {
  naam: string;
  sku: string;
  eenheid: Eenheid;
  aantal: number;
  minimum: number;
  kostprijsCent: number | null;
  leverancier: string;
  locatie: string;
  notitie: string;
}

// --- tekst en getallen --------------------------------------------------------

export function schoneTekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Drie cijfers achter de komma: genoeg voor liters en kilo's, en geen drijvende-komma-afval in de som. */
export const rond3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Een getal uit een getal of uit tekst met Nederlandse komma ("12,5"). Anders NaN. */
export function leesGetal(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : Number.NaN;
  if (typeof v !== "string") return Number.NaN;
  const t = v.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Number(t);
}

/** Controleert een hoeveelheid voor deze eenheid: heel getal, of tot drie decimalen bij liter, kilo en meter. */
function controleerGetal(n: number, eenheid: Eenheid, naam: string): number {
  if (!Number.isFinite(n)) throw AppError.validation(`${naam}: vul een getal in.`);
  if (Math.abs(n) > MAX_GETAL) throw AppError.validation(`${naam}: dat getal is te groot.`);
  if (heeftDecimalen(eenheid)) {
    if (rond3(n) !== n) throw AppError.validation(`${naam}: gebruik hooguit drie cijfers achter de komma.`);
  } else if (!Number.isInteger(n)) {
    throw AppError.validation(`${naam}: bij ${eenheid === "stuk" ? "stuks" : eenheid === "doos" ? "dozen" : "sets"} kan alleen een heel getal.`);
  }
  return n;
}

// --- artikel controleren -------------------------------------------------------

/**
 * Controleert de invoer van een artikel. Gooit een Nederlandse validatiefout (422) bij de eerste fout.
 * `metAantal: false` (bewerken) laat het aantal buiten beschouwing: het aantal verandert alleen via een mutatie.
 */
export function valideerArtikel(o: Record<string, unknown>, opties: { metAantal: boolean }): ArtikelInvoer {
  const naam = schoneTekst(o.naam, 80);
  if (naam.length < 2) throw AppError.validation("Geef het artikel een naam van minstens 2 tekens.");
  if (typeof o.naam === "string" && schoneTekst(o.naam, 1000).length > 80) throw AppError.validation("De naam is te lang (hoogstens 80 tekens).");
  const eenheid = typeof o.eenheid === "string" && (EENHEDEN as readonly string[]).includes(o.eenheid) ? (o.eenheid as Eenheid) : null;
  if (!eenheid) throw AppError.validation(`Kies een eenheid uit de lijst: ${EENHEDEN.join(", ")}.`);
  const sku = schoneTekst(o.sku, 40);
  if (typeof o.sku === "string" && schoneTekst(o.sku, 1000).length > 40) throw AppError.validation("Het artikelnummer is te lang (hoogstens 40 tekens).");
  const leverancier = schoneTekst(o.leverancier, 80);
  const locatie = schoneTekst(o.locatie, 60);
  const notitie = schoneTekst(o.notitie, 300);
  if (typeof o.notitie === "string" && schoneTekst(o.notitie, 5000).length > 300) throw AppError.validation("De notitie is te lang (hoogstens 300 tekens).");

  let aantal = 0;
  if (opties.metAantal) {
    const n = o.aantal === undefined || o.aantal === "" || o.aantal === null ? 0 : leesGetal(o.aantal);
    aantal = controleerGetal(n, eenheid, "Aantal");
    if (aantal < 0) throw AppError.validation("Het beginaantal kan niet onder nul zijn.");
  }

  const mn = o.minimum === undefined || o.minimum === "" || o.minimum === null ? 0 : leesGetal(o.minimum);
  const minimum = controleerGetal(mn, eenheid, "Minimum");
  if (minimum < 0) throw AppError.validation("Het minimum kan niet onder nul zijn (0 betekent: geen waarschuwing).");

  let kostprijsCent: number | null = null;
  if (o.kostprijsCent !== undefined && o.kostprijsCent !== null && o.kostprijsCent !== "") {
    const c = leesGetal(o.kostprijsCent);
    if (!Number.isInteger(c) || c < 0 || c > MAX_KOSTPRIJS_CENT) throw AppError.validation("De kostprijs moet een bedrag van € 0 tot € 1.000.000 zijn.");
    kostprijsCent = c;
  }
  return { naam, sku, eenheid, aantal, minimum, kostprijsCent, leverancier, locatie, notitie };
}

/** Is dit artikelnummer al van een ander artikel? Hoofdletterongevoelig; een leeg nummer botst nooit. */
export function skuBezet(sku: string, anderen: readonly Pick<Artikel, "id" | "sku">[], eigenId?: string): boolean {
  const s = sku.trim().toLowerCase();
  if (!s) return false;
  return anderen.some((a) => a.id !== eigenId && a.sku.trim().toLowerCase() === s);
}

// --- mutatie en telling --------------------------------------------------------

export interface MutatieInvoer {
  reden: Reden;
  verschil: number;
  nieuw: number;
  opmerking: string;
}

/**
 * Wat een mutatie met het aantal doet. `hoeveelheid` is wat de gebruiker intikt:
 * - inkoop: erbij (> 0); verkoop, gebruikt, verlies: eraf (> 0)
 * - telling: het getelde aantal, een absolute waarde (>= 0); het verschil met het huidige aantal wordt gelogd
 * - correctie: een verschil met teken (niet 0), mag ook onder nul uitkomen
 * Verder mag het aantal niet onder nul komen.
 */
export function valideerMutatie(eenheid: Eenheid, huidig: number, o: Record<string, unknown>): MutatieInvoer {
  const reden = typeof o.reden === "string" && (REDENEN as readonly string[]).includes(o.reden) ? (o.reden as Reden) : null;
  if (!reden) throw AppError.validation("Kies een reden uit de lijst.");
  const h = controleerGetal(leesGetal(o.hoeveelheid), eenheid, "Hoeveelheid");
  const opmerking = schoneTekst(o.opmerking, 200);
  let verschil: number;
  let nieuw: number;
  if (reden === "telling") {
    if (h < 0) throw AppError.validation("Een telling kan niet onder nul zijn.");
    nieuw = h;
    verschil = rond3(h - huidig);
  } else if (reden === "correctie") {
    if (h === 0) throw AppError.validation("Een correctie van 0 verandert niets. Vul een verschil in, bijvoorbeeld 2 of -2.");
    verschil = h;
    nieuw = rond3(huidig + h);
  } else {
    if (h <= 0) throw AppError.validation("Vul een hoeveelheid groter dan 0 in.");
    verschil = reden === "inkoop" ? h : -h;
    nieuw = rond3(huidig + verschil);
    if (nieuw < 0) throw AppError.validation(`Zo veel ligt er niet: er ${huidig === 1 ? "ligt" : "liggen"} er ${huidig}. Doe een telling of correctie als de voorraad niet klopt.`);
  }
  if (Math.abs(nieuw) > MAX_GETAL) throw AppError.validation("Dat aantal is te groot.");
  return { reden, verschil, nieuw, opmerking };
}

// --- bijna op, waarde, bestellijst ---------------------------------------------

/** Bijna op: het aantal is gelijk aan of onder het minimum, en er is een minimum ingesteld (> 0). */
export const isBijnaOp = (a: Pick<Artikel, "aantal" | "minimum">): boolean => a.minimum > 0 && a.aantal <= a.minimum;
/** Op: er ligt niets meer (of minder, na een correctie). */
export const isOp = (a: Pick<Artikel, "aantal">): boolean => a.aantal <= 0;

export interface Waarde {
  totaalCent: number;
  /** aantal artikelen met een kostprijs (alleen die tellen mee) */
  metPrijs: number;
  /** aantal artikelen (met voorraad) zonder kostprijs: niet meegerekend */
  zonderPrijs: number;
}

/** Som van aantal × kostprijs. Artikelen zonder kostprijs tellen niet mee; een negatief aantal telt als 0. */
export function voorraadWaarde(artikelen: readonly Artikel[]): Waarde {
  let totaalCent = 0;
  let metPrijs = 0;
  let zonderPrijs = 0;
  for (const a of artikelen) {
    if (a.gearchiveerd) continue;
    if (a.kostprijsCent === null) {
      zonderPrijs += 1;
      continue;
    }
    metPrijs += 1;
    totaalCent += Math.round(Math.max(a.aantal, 0) * a.kostprijsCent);
  }
  return { totaalCent, metPrijs, zonderPrijs };
}

export interface BestelGroep {
  leverancier: string;
  regels: { artikel: Artikel; tekort: number }[];
}

export const ONBEKENDE_LEVERANCIER = "Leverancier onbekend";

/** De bijna-op-artikelen per leverancier, met het tekort tot het minimum. Gearchiveerde artikelen doen niet mee. */
export function bestellijst(artikelen: readonly Artikel[]): BestelGroep[] {
  const groepen = new Map<string, BestelGroep>();
  for (const a of artikelen) {
    if (a.gearchiveerd || !isBijnaOp(a)) continue;
    const naam = a.leverancier || ONBEKENDE_LEVERANCIER;
    const g = groepen.get(naam) ?? { leverancier: naam, regels: [] };
    g.regels.push({ artikel: a, tekort: Math.max(rond3(a.minimum - a.aantal), 0) });
    groepen.set(naam, g);
  }
  const lijst = [...groepen.values()];
  for (const g of lijst) g.regels.sort((x, y) => x.artikel.naam.localeCompare(y.artikel.naam, "nl"));
  // bekende leveranciers eerst, dan op naam; "onbekend" onderaan
  return lijst.sort((x, y) => (x.leverancier === ONBEKENDE_LEVERANCIER ? 1 : 0) - (y.leverancier === ONBEKENDE_LEVERANCIER ? 1 : 0) || x.leverancier.localeCompare(y.leverancier, "nl"));
}

/** Een getal zoals een Nederlander het schrijft: komma als decimaalteken, geen afval achter de komma. */
export const nlGetal = (n: number): string => String(rond3(n)).replace(".", ",");

export const eenheidTekst = (e: Eenheid, n: number): string => (e === "stuk" ? (n === 1 ? "stuk" : "stuks") : e === "doos" ? (n === 1 ? "doos" : "dozen") : e === "set" ? (n === 1 ? "set" : "sets") : e);

/**
 * De stand van een artikel op de bestellijst: "nu 3, minimum 3, op het minimum" als er niets aan het minimum ontbreekt,
 * anders "nu 2, minimum 10, tekort 8 stuks". ("tekort 0 stuks" las vreemd.) Eén functie, voor het scherm én de kopieerbare tekst.
 */
export function bestelStand(a: Artikel, tekort: number): string {
  const vast = `nu ${nlGetal(a.aantal)}, minimum ${nlGetal(a.minimum)}`;
  return tekort <= 0 ? `${vast}, op het minimum` : `${vast}, tekort ${nlGetal(tekort)} ${eenheidTekst(a.eenheid, tekort)}`;
}

/** De bestellijst als gewone tekst, per leverancier, om te kopiëren in een mail of app. */
export function bestelTekst(groepen: readonly BestelGroep[]): string {
  if (groepen.length === 0) return "Niets te bestellen.";
  return groepen
    .map((g) => {
      const regels = g.regels.map(({ artikel: a, tekort }) => `- ${a.naam}${a.sku ? ` (${a.sku})` : ""}: ${bestelStand(a, tekort)}`);
      return `${g.leverancier}\n${regels.join("\n")}`;
    })
    .join("\n\n");
}

// --- zoeken, filteren, sorteren --------------------------------------------------

export type VoorraadFilter = "alle" | "bijna" | "op";
export type VoorraadSortering = "naam" | "aantal" | "waarde";

export interface LijstOpties {
  zoek?: string;
  filter?: VoorraadFilter;
  sortering?: VoorraadSortering;
  aflopend?: boolean;
  metGearchiveerd?: boolean;
}

export function filterEnSorteer(artikelen: readonly Artikel[], o: LijstOpties = {}): Artikel[] {
  const zoek = (o.zoek ?? "").trim().toLowerCase();
  const filter = o.filter ?? "alle";
  let lijst = artikelen.filter((a) => (o.metGearchiveerd ? true : !a.gearchiveerd));
  if (zoek) lijst = lijst.filter((a) => [a.naam, a.sku, a.leverancier].some((t) => t.toLowerCase().includes(zoek)));
  if (filter === "bijna") lijst = lijst.filter(isBijnaOp);
  else if (filter === "op") lijst = lijst.filter(isOp);
  const sleutel = (a: Artikel): number => (o.sortering === "aantal" ? a.aantal : o.sortering === "waarde" ? (a.kostprijsCent === null ? -1 : Math.max(a.aantal, 0) * a.kostprijsCent) : 0);
  const richting = o.aflopend ? -1 : 1;
  return [...lijst].sort((x, y) => (o.sortering === "aantal" || o.sortering === "waarde" ? (sleutel(x) - sleutel(y)) * richting || x.naam.localeCompare(y.naam, "nl") : x.naam.localeCompare(y.naam, "nl") * richting));
}

// --- CSV (Excel, Nederlands) ------------------------------------------------------

/**
 * Een tekstcel voor CSV met `;` als scheiding. Een cel die met = + - @ (of een tab/regeleinde) begint, zou in Excel als
 * formule worden uitgevoerd (CSV-injectie): die krijgt een voorloop-apostrof. Daarna `"` verdubbeld en de cel tussen
 * aanhalingstekens als hij `;`, `"` of een regeleinde bevat.
 */
export function csvTekst(waarde: string): string {
  const veilig = /^[=+\-@\t\r]/.test(waarde) ? `'${waarde}` : waarde;
  return /[;"\r\n]/.test(veilig) ? `"${veilig.replace(/"/g, '""')}"` : veilig;
}

const euroCsv = (cent: number): string => (cent / 100).toFixed(2).replace(".", ",");

export const CSV_KOP = ["Naam", "Artikelnummer", "Eenheid", "Aantal", "Minimum", "Kostprijs (euro)", "Waarde (euro)", "Status", "Leverancier", "Locatie", "Notitie"] as const;

export const statusTekst = (a: Pick<Artikel, "aantal" | "minimum">): string => (isOp(a) ? "Op" : isBijnaOp(a) ? "Bijna op" : "Op voorraad");

/**
 * De voorraad als CSV die Excel direct goed opent: `;`-gescheiden, Nederlandse komma's, UTF-8 met BOM, regeleinden CRLF.
 * Getallen (ook een negatief aantal) zijn eigen cellen en krijgen dus geen apostrof; alleen tekst die we niet zelf maakten wel.
 */
export function voorraadCsv(artikelen: readonly Artikel[]): string {
  const regels = artikelen
    .filter((a) => !a.gearchiveerd)
    .sort((x, y) => x.naam.localeCompare(y.naam, "nl"))
    .map((a) =>
      [
        csvTekst(a.naam),
        csvTekst(a.sku),
        a.eenheid,
        nlGetal(a.aantal),
        nlGetal(a.minimum),
        a.kostprijsCent === null ? "" : euroCsv(a.kostprijsCent),
        a.kostprijsCent === null ? "" : euroCsv(Math.round(Math.max(a.aantal, 0) * a.kostprijsCent)),
        statusTekst(a),
        csvTekst(a.leverancier),
        csvTekst(a.locatie),
        csvTekst(a.notitie),
      ].join(";"),
    );
  return `﻿${[CSV_KOP.join(";"), ...regels].join("\r\n")}\r\n`;
}
