import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// De ZekerFlex community (22 nov 2026, eigenaar: "een communicatie op zekerflex zelf … waar iedereen kan deelnemen praten
// uploaden openbaar"): een openbaar forum op /community. Dit bestand is puur (geen prisma, geen kv, geen zod): de schermen in
// de browser en de server gebruiken dezelfde grenzen, dezelfde controle en dezelfde weergave. De opslag staat in
// lib/community/store.ts, de foto's in lib/community/fotos.ts.
//
// Tekst van gebruikers is altijd platte tekst: geen HTML en geen markdown. Alleen een webadres wordt een link, met
// rel="nofollow ugc noopener" (components/community/PlatteTekst.tsx).
// ---------------------------------------------------------------------------

export const CATEGORIEEN = [
  { sleutel: "algemeen", naam: "Algemeen", uitleg: "Alles wat nergens anders past." },
  { sleutel: "vragen", naam: "Vragen", uitleg: "Vraag het aan andere werkers en bedrijven." },
  { sleutel: "ervaringen", naam: "Ervaringen", uitleg: "Hoe ging je klus of je eerste dienst?" },
  { sleutel: "tips", naam: "Tips", uitleg: "Wat je anderen wilt meegeven." },
  { sleutel: "bedrijven", naam: "Voor bedrijven", uitleg: "Personeel, planning en inhuren." },
  { sleutel: "ideeen", naam: "Ideeën voor ZekerFlex", uitleg: "Wat kan er beter aan ZekerFlex?" },
] as const;

export type Categorie = (typeof CATEGORIEEN)[number]["sleutel"];

const CATEGORIE_NAAM: Record<Categorie, string> = {
  algemeen: "Algemeen",
  vragen: "Vragen",
  ervaringen: "Ervaringen",
  tips: "Tips",
  bedrijven: "Voor bedrijven",
  ideeen: "Ideeën voor ZekerFlex",
};

/** Een vaste tabel bevragen met Object.hasOwn (AGENTS.md): anders telt "constructor" uit de URL als categorie. */
export function isCategorie(v: unknown): v is Categorie {
  return typeof v === "string" && Object.hasOwn(CATEGORIE_NAAM, v);
}

export function categorieNaam(c: Categorie): string {
  return CATEGORIE_NAAM[c];
}

export const GRENZEN = {
  titelMin: 5,
  titelMax: 120,
  tekstMin: 10,
  tekstMax: 5000,
  reactieMin: 2,
  reactieMax: 3000,
  fotosOnderwerp: 4,
  fotosReactie: 2,
  /** webadressen per bericht (titel en tekst samen) */
  links: 2,
  onderwerpenPerDag: 5,
  reactiesPerDag: 40,
  /** een account dat jonger is dan dit, kan nog niet posten (tegen spam) */
  accountMinuten: 10,
  fotoBytes: 8 * 1024 * 1024,
  fotoPx: 1600,
  /** na zoveel meldingen van verschillende mensen is een bericht verborgen tot beheer kijkt */
  verbergNa: 3,
  toelichting: 500,
  /** reacties per onderwerp; daarna is het onderwerp vol */
  reactiesPerOnderwerp: 500,
} as const;

export const MELD_REDENEN = [
  { sleutel: "spam", naam: "Spam of reclame" },
  { sleutel: "beledigend", naam: "Beledigend of kwetsend" },
  { sleutel: "oplichting", naam: "Oplichting of nep" },
  { sleutel: "prive", naam: "Privégegevens van iemand" },
  { sleutel: "anders", naam: "Iets anders" },
] as const;

export type MeldReden = (typeof MELD_REDENEN)[number]["sleutel"];

const MELD_NAAM: Record<MeldReden, string> = {
  spam: "Spam of reclame",
  beledigend: "Beledigend of kwetsend",
  oplichting: "Oplichting of nep",
  prive: "Privégegevens van iemand",
  anders: "Iets anders",
};

export function isMeldReden(v: unknown): v is MeldReden {
  return typeof v === "string" && Object.hasOwn(MELD_NAAM, v);
}

export function meldRedenNaam(r: MeldReden): string {
  return MELD_NAAM[r];
}

export type BerichtStatus = "zichtbaar" | "verborgen" | "verwijderd";
export type AuteurRol = "werker" | "bedrijf" | "team" | "lid";

export const ROL_LABEL: Record<AuteurRol, string> = {
  werker: "Werker",
  bedrijf: "Bedrijf",
  team: "ZekerFlex-team",
  lid: "Lid",
};

export interface Melding {
  id: string;
  /** wie meldde: "u:<userId>" met een account, "ip:<hash>" zonder; na het wissen van een account "gewist:<id>" */
  door: string;
  reden: MeldReden;
  toelichting: string;
  at: string;
}

/** Wat een onderwerp en een reactie gemeen hebben. */
export interface Bericht {
  id: string;
  /** de schrijver (User.id); null bij het welkomstonderwerp van het team en na het wissen van een account */
  auteurId: string | null;
  /** geschreven door het ZekerFlex-team zelf (het welkomstonderwerp) */
  team?: boolean;
  /** het account van de schrijver is gewist (AVG): de schrijver heet dan "Verwijderd account" */
  gewist?: boolean;
  tekst: string;
  /** foto-id's (lib/community/fotos.ts) */
  fotos: string[];
  at: string;
  /** wie dit handig vond (User.id's); de lijst gaat nooit naar de browser, alleen het aantal */
  handig: string[];
  meldingen: Melding[];
  /** wanneer beheer het bericht na meldingen bekeek en liet staan: oudere meldingen tellen dan niet meer mee */
  beoordeeldOp: string | null;
  status: BerichtStatus;
  /** undefined mag: de opslag laat zo'n veld weg (JSON), zo haalt beheer het weer weg */
  verborgenDoor?: "meldingen" | "beheer" | undefined;
  /** de reden die beheer gaf bij verbergen of verwijderen; de schrijver ziet hem bij zijn eigen bericht */
  beheerReden?: string | undefined;
}

export interface Onderwerp extends Bericht {
  /** wisselt bij elke wijziging (compare-and-swap in lib/community/store.ts) */
  versie: string;
  titel: string;
  slug: string;
  categorie: Categorie;
  vastgepind: boolean;
  /** zichtbare reacties */
  aantalReacties: number;
  /** de laatste activiteit (nieuw onderwerp of nieuwe reactie) */
  laatsteOp: string;
}

export type Reactie = Bericht;

export interface ReactieLijst {
  versie: string;
  onderwerpId: string;
  reacties: Reactie[];
}

// ---------------------------------------------------------------------------
// Het welkomstonderwerp: in de code, zodat het eerste bezoek niet leeg is. Geschreven door het ZekerFlex-team zelf (geen
// verzonnen gebruiker). Komt er een reactie op, dan bewaart de opslag een kopie met de tellers (lib/community/store.ts).
// ---------------------------------------------------------------------------

export const WELKOM_ID = "welkom";

export const WELKOM_TEKST = [
  "Fijn dat je er bent! Dit is de plek waar werkers en bedrijven van ZekerFlex elkaar vragen stellen, ervaringen delen en tips geven. Wij van het ZekerFlex-team lezen mee en reageren ook.",
  "Stel je hieronder even voor: wie ben je, wat voor werk doe je of zoek je, en in welke regio?",
  "Onze huisregels zijn kort:\n• Wees respectvol, ook als je het ergens niet mee eens bent.\n• Geen reclame. Een klus plaats je gewoon in de app.\n• Deel geen privégegevens, van jezelf of van een ander: geen telefoonnummer, adres, e-mailadres of rekeningnummer.\n• Zie je iets wat niet klopt? Klik op Melden bij dat bericht. We kijken ernaar.",
].join("\n\n");

export const WELKOM: Onderwerp = {
  id: WELKOM_ID,
  versie: "0",
  titel: "Welkom in de ZekerFlex community: stel je voor!",
  slug: "stel-je-voor",
  categorie: "algemeen",
  vastgepind: true,
  aantalReacties: 0,
  laatsteOp: "2026-11-22T11:00:00.000Z",
  auteurId: null,
  team: true,
  tekst: WELKOM_TEKST,
  fotos: [],
  at: "2026-11-22T11:00:00.000Z",
  handig: [],
  meldingen: [],
  beoordeeldOp: null,
  status: "zichtbaar",
};

// ---------------------------------------------------------------------------
// Tekst schoonmaken en controleren
// ---------------------------------------------------------------------------

/** Regeleinden gelijk, onzichtbare tekens en stuurtekens weg, hooguit één lege regel achter elkaar. */
export function schoneTekst(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex -- stuurtekens bewust weghalen
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍⁠﻿]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Een titel is één regel. */
export function schoneTitel(s: string): string {
  return schoneTekst(s).replace(/\s+/g, " ");
}

/** Een webadres met http(s):// of www. ervoor. Geen lookbehind (Safari vóór 16.4, AGENTS.md). */
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
/** leestekens aan het eind horen bij de zin, niet bij het adres */
const STAART = /[.,;:!?)\]}'"»]+$/;

export type TekstDeel = { soort: "tekst"; tekst: string } | { soort: "link"; tekst: string; href: string };

function alsLink(ruw: string): { href: string; tekst: string } | null {
  const adres = ruw.replace(STAART, "");
  try {
    const u = new URL(/^www\./i.test(adres) ? `https://${adres}` : adres);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return { href: u.href, tekst: adres };
  } catch {
    return null;
  }
}

/** Hoeveel webadressen er in een tekst staan. */
export function telLinks(tekst: string): number {
  let n = 0;
  for (const m of tekst.matchAll(LINK)) if (alsLink(m[0])) n += 1;
  return n;
}

/** De tekst in stukken: gewone tekst en links. Een link toont hooguit 60 tekens. */
export function tekstDelen(tekst: string): TekstDeel[] {
  const uit: TekstDeel[] = [];
  let vanaf = 0;
  const plak = (t: string) => {
    if (!t) return;
    const vorige = uit[uit.length - 1];
    if (vorige && vorige.soort === "tekst") vorige.tekst += t;
    else uit.push({ soort: "tekst", tekst: t });
  };
  for (const m of tekst.matchAll(LINK)) {
    const start = m.index ?? 0;
    const link = alsLink(m[0]);
    if (!link) continue;
    plak(tekst.slice(vanaf, start));
    const zichtbaar = link.tekst.length > 60 ? `${link.tekst.slice(0, 57)}…` : link.tekst;
    uit.push({ soort: "link", tekst: zichtbaar, href: link.href });
    vanaf = start + link.tekst.length;
  }
  plak(tekst.slice(vanaf));
  return uit;
}

const EMAIL = /[A-Z0-9._%+-]+@((?:[A-Z0-9-]+\.)+[A-Z]{2,})/gi;
const NUMMERS = /(?:\+|\b)\d[\d\s().-]{7,18}\d/g;
const IBAN_NL = /NL\d{2}[A-Z]{4}\d{10}/i;

/** Een telefoonnummer: 10 cijfers met een 0 vooraan (06…, 020…), of 31 of 0031 met de rest, of een + met 10 tot 13 cijfers. */
function lijktTelefoon(ruw: string): boolean {
  const cijfers = ruw.replace(/\D/g, "");
  if (ruw.trim().startsWith("+")) return cijfers.length >= 10 && cijfers.length <= 13;
  if (cijfers.startsWith("0031")) return cijfers.length === 13;
  if (cijfers.startsWith("31")) return cijfers.length === 11;
  return cijfers.startsWith("0") && cijfers.length === 10;
}

/**
 * Staat er een e-mailadres, rekeningnummer of telefoonnummer in een openbaar bericht? Huisregel: geen privégegevens. Een
 * adres van ZekerFlex zelf (support@zekerflex.com) mag wel. Geeft de soort terug, of null. Het rekeningnummer eerst: de
 * cijfers van een IBAN lijken anders op een telefoonnummer.
 */
export function privegegevens(tekst: string): "e-mailadres" | "telefoonnummer" | "rekeningnummer" | null {
  for (const m of tekst.matchAll(EMAIL)) {
    const domein = (m[1] ?? "").toLowerCase();
    if (domein !== "zekerflex.com") return "e-mailadres";
  }
  if (IBAN_NL.test(tekst.replace(/\s+/g, ""))) return "rekeningnummer";
  for (const m of tekst.matchAll(NUMMERS)) if (lijktTelefoon(m[0])) return "telefoonnummer";
  return null;
}

function controleerInhoud(tekst: string): string | null {
  if (telLinks(tekst) > GRENZEN.links) return `Er mogen hooguit ${GRENZEN.links} links in een bericht.`;
  const prive = privegegevens(tekst);
  if (prive) return `Zet geen ${prive} in een openbaar bericht: iedereen kan het lezen. Haal het weg en probeer het opnieuw.`;
  return null;
}

/** Controle van een nieuw onderwerp (na schoonmaken). Geeft de foutmelding, of null als alles klopt. */
export function controleerOnderwerp(i: { titel: string; tekst: string; categorie: string; fotos: number }): string | null {
  if (!isCategorie(i.categorie)) return "Kies een onderwerp uit de lijst.";
  if (i.titel.length < GRENZEN.titelMin) return `De titel is te kort: minstens ${GRENZEN.titelMin} tekens.`;
  if (i.titel.length > GRENZEN.titelMax) return `De titel is te lang: hooguit ${GRENZEN.titelMax} tekens.`;
  if (i.tekst.length < GRENZEN.tekstMin) return `Je tekst is te kort: minstens ${GRENZEN.tekstMin} tekens.`;
  if (i.tekst.length > GRENZEN.tekstMax) return `Je tekst is te lang: hooguit ${GRENZEN.tekstMax} tekens.`;
  if (i.fotos > GRENZEN.fotosOnderwerp) return `Je kunt hooguit ${GRENZEN.fotosOnderwerp} foto's toevoegen.`;
  return controleerInhoud(`${i.titel}\n${i.tekst}`);
}

/** Controle van een reactie (na schoonmaken). */
export function controleerReactie(i: { tekst: string; fotos: number }): string | null {
  if (i.tekst.length < GRENZEN.reactieMin) return `Je reactie is te kort: minstens ${GRENZEN.reactieMin} tekens.`;
  if (i.tekst.length > GRENZEN.reactieMax) return `Je reactie is te lang: hooguit ${GRENZEN.reactieMax} tekens.`;
  if (i.fotos > GRENZEN.fotosReactie) return `Je kunt hooguit ${GRENZEN.fotosReactie} foto's bij een reactie zetten.`;
  return controleerInhoud(i.tekst);
}

// ---------------------------------------------------------------------------
// Foto's: alleen jpg, png, webp of heic, herkend aan de eerste bytes (niet aan wat de browser zegt)
// ---------------------------------------------------------------------------

export type FotoSoort = "jpg" | "png" | "webp" | "heic";

/** Merken (bytes 8-11 na "ftyp") van een HEIC/HEIF-foto van een iPhone; zelfde lijst als lib/boekhouding/bonnen/bestand.ts. */
const HEIC_MERKEN = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

export function fotoSoort(b: Uint8Array): FotoSoort | null {
  const tekens = (van: number, tot: number) => String.fromCharCode(...b.subarray(van, tot));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && b[0] === 0x89 && tekens(1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 12 && tekens(0, 4) === "RIFF" && tekens(8, 12) === "WEBP") return "webp";
  if (b.length >= 12 && tekens(4, 8) === "ftyp" && HEIC_MERKEN.has(tekens(8, 12).toLowerCase())) return "heic";
  return null;
}

// ---------------------------------------------------------------------------
// Naam en rol van de schrijver: voornaam en de eerste letter van de achternaam, nooit meer
// ---------------------------------------------------------------------------

const metHoofdletter = (w: string) => (w ? `${w.charAt(0).toUpperCase()}${w.slice(1)}` : w);

/** "jan van der berg" → "Jan B."; "Fatima" → "Fatima". Een naam met een @ of cijfers (een adres, een nummer) wordt "Lid van ZekerFlex". */
export function weergaveNaam(volledigeNaam: string | null | undefined): string {
  const naam = (volledigeNaam ?? "").replace(/\s+/g, " ").trim();
  if (!naam || /[@\d]/.test(naam)) return "Lid van ZekerFlex";
  const delen = naam.split(" ");
  const voornaam = metHoofdletter(delen[0] ?? "").slice(0, 30);
  if (delen.length < 2) return voornaam;
  const letter = Array.from(delen[delen.length - 1] ?? "")[0]?.toUpperCase();
  return letter && /\p{L}/u.test(letter) ? `${voornaam} ${letter}.` : voornaam;
}

/** De rol op het label: platformbeheer is het ZekerFlex-team, een bedrijfsrol is Bedrijf, een flexwerker Werker. */
export function rolVoor(rollen: readonly string[]): AuteurRol {
  if (rollen.includes("PLATFORM_ADMIN")) return "team";
  if (rollen.some((r) => r === "HQ_ADMIN" || r === "LOCAL_MANAGER" || r === "DISPUTE_MANAGER")) return "bedrijf";
  if (rollen.includes("FREELANCER")) return "werker";
  return "lid";
}

// ---------------------------------------------------------------------------
// Adressen
// ---------------------------------------------------------------------------

/** "Hoe vraag ik mijn uren goed aan?" → "hoe-vraag-ik-mijn-uren-goed-aan" */
export function maakSlug(titel: string): string {
  const s = titel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return s || "onderwerp";
}

export function onderwerpPad(o: Pick<Onderwerp, "id" | "slug">): string {
  return `/community/${o.id}${o.slug ? `-${o.slug}` : ""}`;
}

/** Het id uit het adres "/community/<id>-<slug>"; null als het geen geldig id is. */
export function idUitPad(param: string): string | null {
  const id = param.split("-")[0] ?? "";
  return /^[a-z0-9]{4,32}$/.test(id) ? id : null;
}

// ---------------------------------------------------------------------------
// Melden en verbergen
// ---------------------------------------------------------------------------

/** Meldingen die meetellen: van verschillende melders, en alleen die na de laatste beoordeling door beheer. */
export function tellendeMeldingen(b: Pick<Bericht, "meldingen" | "beoordeeldOp">): number {
  const na = b.meldingen.filter((m) => !b.beoordeeldOp || m.at > b.beoordeeldOp);
  return new Set(na.map((m) => m.door)).size;
}

/** Na GRENZEN.verbergNa meldingen van verschillende mensen is een zichtbaar bericht verborgen tot beheer kijkt. Niet het bericht van het team. */
export function moetVerbergen(b: Pick<Bericht, "meldingen" | "beoordeeldOp" | "status" | "team">): boolean {
  return b.status === "zichtbaar" && !b.team && tellendeMeldingen(b) >= GRENZEN.verbergNa;
}

/** Meldde deze melder dit bericht al (sinds de laatste beoordeling)? Dan telt een tweede keer niet. */
export function alGemeld(b: Pick<Bericht, "meldingen" | "beoordeeldOp">, door: string): boolean {
  return b.meldingen.some((m) => m.door === door && (!b.beoordeeldOp || m.at > b.beoordeeldOp));
}

// ---------------------------------------------------------------------------
// Grenzen per dag en per account
// ---------------------------------------------------------------------------

export interface DagTeller {
  /** de Amsterdamse dag, JJJJ-MM-DD */
  dag: string;
  onderwerpen: number;
  reacties: number;
}

/** Telt één onderwerp of reactie op voor deze dag; null als de daggrens al bereikt is. Een nieuwe dag begint bij nul. */
export function telOp(teller: DagTeller | undefined, dag: string, soort: "onderwerpen" | "reacties"): DagTeller | null {
  const huidig: DagTeller = teller && teller.dag === dag ? teller : { dag, onderwerpen: 0, reacties: 0 };
  const max = soort === "onderwerpen" ? GRENZEN.onderwerpenPerDag : GRENZEN.reactiesPerDag;
  if (huidig[soort] >= max) return null;
  return { ...huidig, [soort]: huidig[soort] + 1 };
}

export function daggrensTekst(soort: "onderwerpen" | "reacties"): string {
  return soort === "onderwerpen"
    ? `Je hebt vandaag al ${GRENZEN.onderwerpenPerDag} onderwerpen gestart. Morgen kan het weer.`
    : `Je hebt vandaag al ${GRENZEN.reactiesPerDag} reacties geplaatst. Morgen kan het weer.`;
}

/** Is dit account nog te nieuw om te posten (tegen spam)? */
export function accountTeNieuw(aangemaakt: Date, nu: Date): boolean {
  return nu.getTime() - aangemaakt.getTime() < GRENZEN.accountMinuten * 60_000;
}

// ---------------------------------------------------------------------------
// Overzicht en tijd
// ---------------------------------------------------------------------------

export type Sortering = "actief" | "nieuw";

/** Zichtbare onderwerpen, eventueel van één categorie: vastgepind bovenaan, dan de actiefste (laatste reactie) of de nieuwste. */
export function sorteerOnderwerpen(lijst: readonly Onderwerp[], sortering: Sortering, categorie: Categorie | null = null): Onderwerp[] {
  const sleutel = (o: Onderwerp) => (sortering === "nieuw" ? o.at : o.laatsteOp);
  return lijst
    .filter((o) => o.status === "zichtbaar" && (!categorie || o.categorie === categorie))
    .sort((a, b) => Number(b.vastgepind) - Number(a.vastgepind) || sleutel(b).localeCompare(sleutel(a)));
}

/** Het begin van een tekst voor een kaart in het overzicht. */
export function uittreksel(tekst: string, max = 180): string {
  const plat = tekst.replace(/\s+/g, " ").trim();
  if (plat.length <= max) return plat;
  const stuk = plat.slice(0, max);
  const spatie = stuk.lastIndexOf(" ");
  return `${(spatie > max * 0.6 ? stuk.slice(0, spatie) : stuk).trimEnd()}…`;
}

const DATUM = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

/** "zojuist", "12 minuten geleden", "vandaag om 14:05", "gisteren om 09:10" of "3 november 2026" (Nederlandse tijd). */
export function wanneer(iso: string, nu: Date): string {
  const t = new Date(iso);
  const minuten = Math.floor((nu.getTime() - t.getTime()) / 60_000);
  if (minuten < 1) return "zojuist";
  if (minuten < 60) return minuten === 1 ? "1 minuut geleden" : `${minuten} minuten geleden`;
  const dag = amsterdamDayKey(t);
  if (dag === amsterdamDayKey(nu)) return `vandaag om ${amsterdamClock(t)}`;
  const [j, m, d] = amsterdamDayKey(nu).split("-").map(Number);
  const gisteren = amsterdamDayKey(new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1, 12)));
  if (dag === gisteren) return `gisteren om ${amsterdamClock(t)}`;
  return DATUM.format(t);
}
