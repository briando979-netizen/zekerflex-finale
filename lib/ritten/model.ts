// ---------------------------------------------------------------------------
// Ritten en voertuigen voor transport, koeriers en bedrijven met een wagenpark. Dit is het zuivere deel, zonder opslag
// (lib/ritten/store.ts): invoer controleren met Nederlandse fouten, het kenteken, de APK-lijst, de duur van een rit,
// de totalen per chauffeur en voertuig, dubbele boekingen en de toegestane statusovergangen.
// Uren en kilometers zijn handmatig: er is geen GPS, geen routeberekening en geen koppeling met uren goedkeuren of
// facturen. Alle klokkentijden zijn Nederlandse tijd (opgeslagen als UTC); een dag is een Nederlandse kalenderdag.
// ---------------------------------------------------------------------------

import { amsterdamDayKey, amsterdamLocalInput, amsterdamParts, parseAmsterdamLocal } from "@/lib/time/amsterdam";

export const STATUSSEN = ["gepland", "onderweg", "afgeleverd", "geannuleerd"] as const;
export type RitStatus = (typeof STATUSSEN)[number];

export const STATUS_NAAM: Record<RitStatus, string> = {
  gepland: "Gepland",
  onderweg: "Onderweg",
  afgeleverd: "Afgeleverd",
  geannuleerd: "Geannuleerd",
};

/** Toegestane overgangen: van de sleutel naar een van de waarden. Een rit kan terug naar gepland of heropend worden. */
export const OVERGANGEN: Record<RitStatus, readonly RitStatus[]> = {
  gepland: ["onderweg", "geannuleerd"],
  onderweg: ["afgeleverd", "gepland", "geannuleerd"],
  afgeleverd: ["onderweg"],
  geannuleerd: ["gepland"],
};

export const isStatus = (v: unknown): v is RitStatus => typeof v === "string" && (STATUSSEN as readonly string[]).includes(v);

export const MAX_TUSSENSTOPS = 10;
export const MAX_CHAUFFEURS = 50;
export const MAX_VOERTUIGEN = 100;
export const MAX_PERIODE_DAGEN = 31;
/** De naam waarmee een gewiste chauffeur in alle ritten wordt vervangen. */
export const VERWIJDERD = "Verwijderd";

/** Een rit-id is jaar-volgnummer ("2026-0001"); een voertuig-id is 8 hexadecimale tekens. */
export const RIT_ID = /^\d{4}-\d{4,6}$/;
export const VOERTUIG_ID = /^[a-f0-9]{8}$/;
const DAG = /^\d{4}-\d{2}-\d{2}$/;
const KLOKTIJD = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type Gecontroleerd<T> = { ok: true; waarde: T } | { ok: false; fout: string };

export interface Voertuig {
  id: string;
  /** genormaliseerd: hoofdletters, zonder streepjes of spaties */
  kenteken: string;
  omschrijving: string;
  laadvermogenKg: number | null;
  /** Nederlandse kalenderdag "2026-11-05"; null = onbekend */
  apk: string | null;
  notitie: string;
  gearchiveerd: boolean;
  gemaaktOp: string;
  bijgewerktOp: string;
}

export interface VoertuigInvoer {
  kenteken: string;
  omschrijving: string;
  laadvermogenKg: number | null;
  apk: string | null;
  notitie: string;
}

/** Wat een gebruiker invult bij een rit (zonder id, nummer en status). Tijden zijn UTC ISO-teksten. */
export interface RitInhoud {
  start: string;
  eind: string;
  van: string;
  naar: string;
  tussenstops: string[];
  klantNaam: string;
  lading: string;
  voertuigId: string | null;
  chauffeur: string;
  werkelijkStart: string | null;
  werkelijkEind: string | null;
  km: number | null;
  opmerking: string;
}

export interface Rit extends RitInhoud {
  id: string;
  nummer: string;
  status: RitStatus;
  /** true als de klantgegevens van deze rit zijn gewist (naam en adressen) */
  klantGewist: boolean;
  gemaaktOp: string;
  bijgewerktOp: string;
}

// --- tekst en getallen --------------------------------------------------------

export function schoneTekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Tekst met regelafbrekingen (een opmerking): alleen overbodige witruimte weg. */
function schoneNotitie(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
}

const tekstTeLang = (v: unknown, max: number): boolean => typeof v === "string" && schoneTekst(v, 100_000).length > max;

export const rond2 = (n: number): number => Math.round(n * 100) / 100;
const rond1 = (n: number): number => Math.round(n * 10) / 10;

function leesGetal(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : Number.NaN;
  if (typeof v !== "string") return Number.NaN;
  const t = v.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

const leeg = (v: unknown): boolean => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

// --- dagen (Nederlandse kalenderdagen als "2026-11-05") ------------------------------

/** Is dit een echte kalenderdag in de vorm JJJJ-MM-DD? */
export function isDag(s: unknown): s is string {
  if (typeof s !== "string" || !DAG.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Een dag optellen (of aftrekken) met UTC-rekenwerk op de datum zelf; geen tijdstip, dus geen zomertijdfout. */
export function plusDagen(dag: string, n: number): string {
  const [j, m, d] = dag.split("-").map(Number);
  return new Date(Date.UTC(j ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

/** Het aantal dagen van `van` tot `tot` (beide meegeteld). */
export function aantalDagen(van: string, tot: string): number {
  return Math.round((Date.parse(`${tot}T00:00:00Z`) - Date.parse(`${van}T00:00:00Z`)) / 86_400_000) + 1;
}

/** De maandag en de zondag van de week waarin `dag` valt. */
export function weekVan(dag: string): { van: string; tot: string } {
  const wd = new Date(`${dag}T12:00:00Z`).getUTCDay(); // 0 = zondag
  const van = plusDagen(dag, -((wd + 6) % 7));
  return { van, tot: plusDagen(van, 6) };
}

/** "maandag 2 november"; de weekdag en maand in het Nederlands, op de datum zelf (geen tijdzone-afhankelijkheid). */
export function dagNaam(dag: string): string {
  return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${dag}T12:00:00Z`));
}

/** De dagen van een periode, in volgorde. */
export function dagenVan(van: string, tot: string): string[] {
  const n = Math.min(aantalDagen(van, tot), 366);
  return Array.from({ length: Math.max(0, n) }, (_, i) => plusDagen(van, i));
}

/** Controleert een periode: echte dagen, niet omgekeerd, hoogstens 31 dagen. */
export function controleerPeriode(van: unknown, tot: unknown): Gecontroleerd<{ van: string; tot: string }> {
  if (!isDag(van) || !isDag(tot)) return { ok: false, fout: "Geef de periode op als begin- en einddag (JJJJ-MM-DD)." };
  if (tot < van) return { ok: false, fout: "De einddag ligt voor de begindag." };
  if (aantalDagen(van, tot) > MAX_PERIODE_DAGEN) return { ok: false, fout: `Kies een periode van hooguit ${MAX_PERIODE_DAGEN} dagen.` };
  return { ok: true, waarde: { van, tot } };
}

// --- kenteken --------------------------------------------------------------------

/** Hoofdletters, zonder streepjes, spaties of punten. */
export const normaliseerKenteken = (v: unknown): string => (typeof v === "string" ? v.toUpperCase().replace(/[\s.\-]/g, "") : "");

/** Een Nederlands kenteken heeft 6 tekens uit cijfers en letters (de klinkersregel van de RDW bouwen we niet na). */
export const isKenteken = (v: string): boolean => /^[A-Z0-9]{6}$/.test(v);

/** Letter-cijferpatronen van de Nederlandse kentekens en waar de streepjes staan; onbekend patroon = 2-2-2. */
const KENTEKEN_SPLITS: Record<string, [number, number, number]> = {
  LLDDDD: [2, 2, 2],
  DDDDLL: [2, 2, 2],
  DDLLDD: [2, 2, 2],
  LLDDLL: [2, 2, 2],
  LLLLDD: [2, 2, 2],
  DDLLLL: [2, 2, 2],
  DDLLLD: [2, 3, 1],
  DLLLDD: [1, 3, 2],
  LLDDDL: [2, 3, 1],
  LDDDLL: [1, 3, 2],
  LLLDDL: [3, 2, 1],
  LDDLLL: [1, 2, 3],
};

/** "AB12CD" wordt "AB-12-CD" (zoals op de kentekenplaat); een onbekend patroon wordt in tweetallen gesplitst. */
export function formatKenteken(genormaliseerd: string): string {
  const k = normaliseerKenteken(genormaliseerd);
  if (!isKenteken(k)) return k;
  const patroon = k.replace(/[A-Z]/g, "L").replace(/[0-9]/g, "D");
  const [a, b] = KENTEKEN_SPLITS[patroon] ?? [2, 2, 2];
  return `${k.slice(0, a)}-${k.slice(a, a + b)}-${k.slice(a + b)}`;
}

/** Is dit kenteken al van een ander voertuig van de organisatie? Gearchiveerde voertuigen tellen mee. */
export const kentekenBezet = (kenteken: string, voertuigen: readonly Voertuig[], behalveId?: string): boolean => voertuigen.some((v) => v.id !== behalveId && v.kenteken === kenteken);

// --- voertuig controleren -------------------------------------------------------

export function valideerVoertuig(invoer: unknown): Gecontroleerd<VoertuigInvoer> {
  const o = (invoer && typeof invoer === "object" ? invoer : {}) as Record<string, unknown>;
  const kenteken = normaliseerKenteken(o.kenteken);
  if (!kenteken) return { ok: false, fout: "Vul het kenteken in." };
  if (!isKenteken(kenteken)) return { ok: false, fout: "Dit is geen kenteken: een Nederlands kenteken heeft 6 tekens (cijfers en letters), met of zonder streepjes." };
  const omschrijving = schoneTekst(o.omschrijving, 80);
  if (omschrijving.length < 2) return { ok: false, fout: "Geef het voertuig een omschrijving van minstens 2 tekens, bijvoorbeeld Bestelbus Ford Transit." };
  if (tekstTeLang(o.omschrijving, 80)) return { ok: false, fout: "De omschrijving is te lang (hoogstens 80 tekens)." };
  if (tekstTeLang(o.notitie, 300)) return { ok: false, fout: "De notitie is te lang (hoogstens 300 tekens)." };

  let laadvermogenKg: number | null = null;
  if (!leeg(o.laadvermogenKg)) {
    const n = leesGetal(o.laadvermogenKg);
    if (!Number.isInteger(n) || n < 1 || n > 100_000) return { ok: false, fout: "Het laadvermogen is een heel aantal kilo's tussen 1 en 100.000." };
    laadvermogenKg = n;
  }
  let apk: string | null = null;
  if (!leeg(o.apk)) {
    if (!isDag(o.apk)) return { ok: false, fout: "De APK-vervaldatum is geen echte datum (JJJJ-MM-DD)." };
    apk = o.apk;
  }
  return { ok: true, waarde: { kenteken, omschrijving, laadvermogenKg, apk, notitie: schoneNotitie(o.notitie, 300) } };
}

/** Een voertuig voor in een lijst of melding: "AB-12-CD (Bestelbus Ford Transit)". */
export const voertuigNaam = (v: Pick<Voertuig, "kenteken" | "omschrijving">): string => `${formatKenteken(v.kenteken)} (${v.omschrijving})`;

// --- APK -------------------------------------------------------------------------

export interface ApkMelding {
  voertuig: Voertuig;
  /** dagen tot de vervaldatum (vandaag = 0); negatief = al verlopen */
  dagen: number;
}

/**
 * De actieve voertuigen waarvan de APK binnen `dagen` dagen verloopt (of al is verlopen), de eerstvolgende bovenaan.
 * "Vandaag" is de Nederlandse kalenderdag van `nu`, de vervaldatum een Nederlandse kalenderdag.
 */
export function apkBinnenDagen(voertuigen: readonly Voertuig[], nu: Date, dagen = 30): ApkMelding[] {
  const vandaag = amsterdamDayKey(nu);
  const lijst: ApkMelding[] = [];
  for (const v of voertuigen) {
    if (v.gearchiveerd || !v.apk) continue;
    const rest = aantalDagen(vandaag, v.apk) - 1;
    if (rest <= dagen) lijst.push({ voertuig: v, dagen: rest });
  }
  return lijst.sort((a, b) => a.dagen - b.dagen || a.voertuig.kenteken.localeCompare(b.voertuig.kenteken));
}

// --- chauffeurs ---------------------------------------------------------------------

/** De lijst namen die het bedrijf zelf beheert (vrije tekst, geen accounts, geen rijbewijsgegevens). */
export function controleerChauffeurs(invoer: unknown): Gecontroleerd<string[]> {
  const o = (invoer && typeof invoer === "object" ? invoer : {}) as Record<string, unknown>;
  if (!Array.isArray(o.namen)) return { ok: false, fout: "Geef de namen van je chauffeurs op." };
  const gezien = new Set<string>();
  const namen: string[] = [];
  for (const n of o.namen) {
    const naam = schoneTekst(n, 60);
    if (!naam) continue;
    if (tekstTeLang(n, 60)) return { ok: false, fout: "Een naam is te lang (hoogstens 60 tekens)." };
    if (naam.toLowerCase() === VERWIJDERD.toLowerCase()) return { ok: false, fout: `De naam ${VERWIJDERD} is gereserveerd voor gewiste chauffeurs.` };
    if (gezien.has(naam.toLowerCase())) continue;
    gezien.add(naam.toLowerCase());
    namen.push(naam);
  }
  if (namen.length > MAX_CHAUFFEURS) return { ok: false, fout: `Je kunt hooguit ${MAX_CHAUFFEURS} chauffeurs in de lijst zetten.` };
  return { ok: true, waarde: namen };
}

// --- rit controleren --------------------------------------------------------------

/** Een klokkentijd "2026-11-05T09:00" in Nederlandse tijd naar een UTC-tijdstip; null bij onzin of een tijd die niet bestaat. */
export function leesKlokTijd(v: unknown): Date | null {
  if (typeof v !== "string" || !KLOKTIJD.test(v)) return null;
  const d = parseAmsterdamLocal(v);
  if (Number.isNaN(d.getTime()) || amsterdamLocalInput(d) !== v) return null;
  return d;
}

/**
 * Controleert de invoer van een rit. Tijden komen als "JJJJ-MM-DDTUU:MM" in Nederlandse tijd (zoals een datetime-local-
 * veld) en worden UTC. Een rit mag over middernacht gaan: het einde moet alleen na het begin liggen. Bij een rit waarvan
 * de klantgegevens zijn gewist (`klantGewist`) zijn van en naar niet meer verplicht.
 * Het voertuig en de chauffeur worden hier niet gecontroleerd tegen de lijsten (zie controleerKoppelingen).
 */
export function valideerRit(invoer: unknown, opties: { klantGewist?: boolean } = {}): Gecontroleerd<RitInhoud> {
  const o = (invoer && typeof invoer === "object" ? invoer : {}) as Record<string, unknown>;
  const start = leesKlokTijd(o.start);
  const eind = leesKlokTijd(o.eind);
  if (!start) return { ok: false, fout: "Vul de geplande start in als datum en tijd." };
  if (!eind) return { ok: false, fout: "Vul het geplande einde in als datum en tijd." };
  if (eind.getTime() <= start.getTime()) return { ok: false, fout: "Het geplande einde moet na de geplande start liggen." };
  if (eind.getTime() - start.getTime() > 7 * 86_400_000) return { ok: false, fout: "Een rit duurt hooguit 7 dagen. Splits een langere rit in meerdere ritten." };

  const van = schoneTekst(o.van, 200);
  const naar = schoneTekst(o.naar, 200);
  if (!opties.klantGewist) {
    if (van.length < 2) return { ok: false, fout: "Vul in waar de rit begint (adres of plaats)." };
    if (naar.length < 2) return { ok: false, fout: "Vul in waar de rit eindigt (adres of plaats)." };
  }
  if (tekstTeLang(o.van, 200) || tekstTeLang(o.naar, 200)) return { ok: false, fout: "Een adres is te lang (hoogstens 200 tekens)." };

  const ruweStops = Array.isArray(o.tussenstops) ? o.tussenstops : [];
  const tussenstops = ruweStops.map((s) => schoneTekst(s, 200)).filter(Boolean);
  if (tussenstops.length > MAX_TUSSENSTOPS) return { ok: false, fout: `Een rit heeft hooguit ${MAX_TUSSENSTOPS} tussenstops.` };
  if (ruweStops.some((s) => tekstTeLang(s, 200))) return { ok: false, fout: "Een adres is te lang (hoogstens 200 tekens)." };

  if (tekstTeLang(o.klantNaam, 80)) return { ok: false, fout: "De naam van de klant is te lang (hoogstens 80 tekens)." };
  if (tekstTeLang(o.lading, 300)) return { ok: false, fout: "De omschrijving van de lading is te lang (hoogstens 300 tekens)." };
  if (tekstTeLang(o.opmerking, 500)) return { ok: false, fout: "De opmerking is te lang (hoogstens 500 tekens)." };
  if (tekstTeLang(o.chauffeur, 60)) return { ok: false, fout: "De naam van de chauffeur is te lang (hoogstens 60 tekens)." };

  const voertuigId = leeg(o.voertuigId) ? null : typeof o.voertuigId === "string" && VOERTUIG_ID.test(o.voertuigId) ? o.voertuigId : "";
  if (voertuigId === "") return { ok: false, fout: "Dit voertuig bestaat niet." };

  const werkelijkStart = leeg(o.werkelijkStart) ? null : leesKlokTijd(o.werkelijkStart);
  const werkelijkEind = leeg(o.werkelijkEind) ? null : leesKlokTijd(o.werkelijkEind);
  if (!leeg(o.werkelijkStart) && !werkelijkStart) return { ok: false, fout: "De werkelijke start is geen datum met tijd." };
  if (!leeg(o.werkelijkEind) && !werkelijkEind) return { ok: false, fout: "Het werkelijke einde is geen datum met tijd." };
  if (werkelijkEind && !werkelijkStart) return { ok: false, fout: "Vul ook de werkelijke start in als je het werkelijke einde invult." };
  if (werkelijkStart && werkelijkEind && werkelijkEind.getTime() <= werkelijkStart.getTime()) return { ok: false, fout: "Het werkelijke einde moet na de werkelijke start liggen." };
  if (werkelijkStart && werkelijkEind && werkelijkEind.getTime() - werkelijkStart.getTime() > 7 * 86_400_000) return { ok: false, fout: "Een rit duurt hooguit 7 dagen." };

  let km: number | null = null;
  if (!leeg(o.km)) {
    const n = leesGetal(o.km);
    if (!Number.isFinite(n) || n < 0 || n > 99_999) return { ok: false, fout: "Vul de afgelegde kilometers in als getal tussen 0 en 99.999." };
    if (rond1(n) !== n) return { ok: false, fout: "Gebruik hooguit één cijfer achter de komma bij de kilometers." };
    km = n;
  }

  return {
    ok: true,
    waarde: {
      start: start.toISOString(),
      eind: eind.toISOString(),
      van,
      naar,
      tussenstops,
      klantNaam: schoneTekst(o.klantNaam, 80),
      lading: schoneNotitie(o.lading, 300),
      voertuigId,
      chauffeur: schoneTekst(o.chauffeur, 60),
      werkelijkStart: werkelijkStart ? werkelijkStart.toISOString() : null,
      werkelijkEind: werkelijkEind ? werkelijkEind.toISOString() : null,
      km,
      opmerking: schoneNotitie(o.opmerking, 500),
    },
  };
}

/**
 * Hoort het gekozen voertuig en de chauffeur bij deze organisatie? Een voertuig moet bestaan en niet gearchiveerd zijn,
 * een chauffeur moet in de lijst staan: tenzij het dezelfde is als wat de rit al had (een oude rit blijft bewerkbaar
 * als het voertuig later is gearchiveerd of de chauffeur is gewist). Geeft een foutmelding of null.
 */
export function controleerKoppelingen(inhoud: Pick<RitInhoud, "voertuigId" | "chauffeur">, voertuigen: readonly Voertuig[], chauffeurs: readonly string[], bestaand: Pick<RitInhoud, "voertuigId" | "chauffeur"> | null): string | null {
  if (inhoud.voertuigId && inhoud.voertuigId !== bestaand?.voertuigId) {
    const v = voertuigen.find((x) => x.id === inhoud.voertuigId);
    if (!v) return "Dit voertuig bestaat niet (meer).";
    if (v.gearchiveerd) return "Dit voertuig is gearchiveerd. Haal het eerst terug om het te gebruiken.";
  }
  if (inhoud.chauffeur && inhoud.chauffeur !== bestaand?.chauffeur && !chauffeurs.some((c) => c.toLowerCase() === inhoud.chauffeur.toLowerCase())) {
    return "Deze chauffeur staat niet in je lijst. Voeg de naam eerst toe bij Chauffeurs.";
  }
  return null;
}

// --- status ------------------------------------------------------------------------

/**
 * De status van een rit wijzigen. Onderweg zetten legt de werkelijke start vast (nu, als die nog leeg is); afgeleverd
 * legt het werkelijke einde vast; terug naar gepland of annuleren zet alleen de status, terug naar gepland wist ook de
 * werkelijke tijden. Dezelfde status opnieuw zetten verandert niets.
 */
export function wisselStatus(rit: Rit, naar: RitStatus, nu: Date): Gecontroleerd<Rit> {
  if (rit.status === naar) return { ok: true, waarde: rit };
  if (!OVERGANGEN[rit.status].includes(naar)) return { ok: false, fout: `Een rit die ${STATUS_NAAM[rit.status].toLowerCase()} is kan niet naar ${STATUS_NAAM[naar].toLowerCase()}.` };
  const iso = nu.toISOString();
  const nieuw: Rit = { ...rit, status: naar, bijgewerktOp: iso };
  if (naar === "onderweg") {
    nieuw.werkelijkStart = rit.werkelijkStart ?? iso;
    nieuw.werkelijkEind = null;
  } else if (naar === "afgeleverd") {
    const begin = rit.werkelijkStart ?? iso;
    nieuw.werkelijkStart = begin;
    nieuw.werkelijkEind = nu.getTime() > Date.parse(begin) ? iso : null;
  } else if (naar === "gepland") {
    nieuw.werkelijkStart = null;
    nieuw.werkelijkEind = null;
  }
  return { ok: true, waarde: nieuw };
}

/** Verwijderen kan alleen zolang de rit nog niet is gereden: gepland of geannuleerd. Een nummer blijft vergeven. */
export const magVerwijderen = (rit: Rit): boolean => rit.status === "gepland" || rit.status === "geannuleerd";

// --- klantgegevens en chauffeursnaam wissen -------------------------------------------

/** Naam van de klant en de adressen (van, naar, tussenstops) wissen; de rest van de rit blijft staan. */
export function wisKlantgegevens(rit: Rit, nu: Date): Rit {
  return { ...rit, klantNaam: "", van: "", naar: "", tussenstops: [], klantGewist: true, bijgewerktOp: nu.toISOString() };
}

/** Vervangt de naam van een chauffeur door "Verwijderd" (hoofdletterongevoelig). Geeft dezelfde rit terug als er niets verandert. */
export function wisChauffeurInRit(rit: Rit, naam: string, nu: Date): Rit {
  if (!rit.chauffeur || rit.chauffeur.toLowerCase() !== naam.trim().toLowerCase()) return rit;
  return { ...rit, chauffeur: VERWIJDERD, bijgewerktOp: nu.toISOString() };
}

// --- duur en totalen ---------------------------------------------------------------

/** Het tijdvak van een rit: het werkelijke als begin en einde bekend zijn, anders het geplande. */
export function ritTijdvak(rit: Pick<RitInhoud, "start" | "eind" | "werkelijkStart" | "werkelijkEind">): { van: number; tot: number; werkelijk: boolean } {
  if (rit.werkelijkStart && rit.werkelijkEind) {
    const van = Date.parse(rit.werkelijkStart);
    const tot = Date.parse(rit.werkelijkEind);
    if (tot > van) return { van, tot, werkelijk: true };
  }
  return { van: Date.parse(rit.start), tot: Date.parse(rit.eind), werkelijk: false };
}

/** De duur van een rit in hele minuten (werkelijk als dat bekend is, anders gepland). Geen zomertijdfouten: het zijn tijdstippen. */
export function ritMinuten(rit: Pick<RitInhoud, "start" | "eind" | "werkelijkStart" | "werkelijkEind">): number {
  const t = ritTijdvak(rit);
  return Math.max(0, Math.round((t.tot - t.van) / 60_000));
}

/** De duur van een rit in uren met twee decimalen. */
export const ritUren = (rit: Pick<RitInhoud, "start" | "eind" | "werkelijkStart" | "werkelijkEind">): number => rond2(ritMinuten(rit) / 60);

/** "2,5 uur" met Nederlandse komma. */
export const urenTekst = (uren: number): string => `${new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(uren)} uur`;

export const ritDag = (rit: Pick<RitInhoud, "start">): string => amsterdamDayKey(rit.start);

export interface TotaalRij {
  /** de naam van de chauffeur, het id van het voertuig; leeg = niet ingevuld */
  sleutel: string;
  aantal: number;
  uren: number;
  km: number;
}

export interface Totalen {
  van: string;
  tot: string;
  perChauffeur: TotaalRij[];
  perVoertuig: TotaalRij[];
  totaal: { aantal: number; uren: number; km: number };
}

function optellen(ritten: readonly Rit[], sleutelVan: (r: Rit) => string): TotaalRij[] {
  const per = new Map<string, { aantal: number; minuten: number; km: number }>();
  for (const r of ritten) {
    const s = sleutelVan(r);
    const rij = per.get(s) ?? { aantal: 0, minuten: 0, km: 0 };
    rij.aantal += 1;
    rij.minuten += ritMinuten(r);
    rij.km = rond1(rij.km + (r.km ?? 0));
    per.set(s, rij);
  }
  return [...per]
    .map(([sleutel, r]) => ({ sleutel, aantal: r.aantal, uren: rond2(r.minuten / 60), km: r.km }))
    .sort((a, b) => b.uren - a.uren || a.sleutel.localeCompare(b.sleutel, "nl"));
}

/**
 * Het aantal ritten, de uren en de kilometers per chauffeur en per voertuig over een periode van hooguit 31 dagen (op de
 * Nederlandse dag waarop de rit begint). Geannuleerde ritten tellen niet mee. Een rit die nog niet is gereden telt met
 * zijn geplande duur; kilometers zijn alleen wat handmatig is ingevuld.
 */
export function totalenOver(ritten: readonly Rit[], van: string, tot: string): Gecontroleerd<Totalen> {
  const p = controleerPeriode(van, tot);
  if (!p.ok) return p;
  const binnen = ritten.filter((r) => r.status !== "geannuleerd" && ritDag(r) >= van && ritDag(r) <= tot);
  const minuten = binnen.reduce((s, r) => s + ritMinuten(r), 0);
  return {
    ok: true,
    waarde: {
      van,
      tot,
      perChauffeur: optellen(binnen, (r) => r.chauffeur),
      perVoertuig: optellen(binnen, (r) => r.voertuigId ?? ""),
      totaal: { aantal: binnen.length, uren: rond2(minuten / 60), km: rond1(binnen.reduce((s, r) => s + (r.km ?? 0), 0)) },
    },
  };
}

// --- dubbele boekingen ----------------------------------------------------------------

/**
 * Waarschuwingen per rit-id voor ritten die in overlappende tijd hetzelfde voertuig of dezelfde chauffeur hebben. Alleen
 * waarschuwen, nooit blokkeren. Geannuleerde ritten tellen niet mee; ritten die aansluiten (einde = begin) overlappen niet.
 * De teksten noemen de naam van het voertuig of de chauffeur en het nummer van de andere rit.
 */
export function dubbeleBoekingen(ritten: readonly Rit[], voertuigen: readonly Voertuig[]): Record<string, string[]> {
  const uit: Record<string, string[]> = {};
  const voorVoertuig = new Map(voertuigen.map((v) => [v.id, v]));
  const voeg = (id: string, tekst: string) => {
    (uit[id] ??= []).push(tekst);
  };
  const groepen = new Map<string, Array<{ rit: Rit; van: number; tot: number }>>();
  const stop = (k: string, rit: Rit, t: { van: number; tot: number }) => {
    const groep = groepen.get(k) ?? [];
    groep.push({ rit, van: t.van, tot: t.tot });
    groepen.set(k, groep);
  };
  for (const r of ritten) {
    if (r.status === "geannuleerd") continue;
    const t = ritTijdvak(r);
    if (r.voertuigId) stop(`v:${r.voertuigId}`, r, t);
    if (r.chauffeur && r.chauffeur !== VERWIJDERD) stop(`c:${r.chauffeur.toLowerCase()}`, r, t);
  }
  for (const [sleutel, groep] of groepen) {
    groep.sort((a, b) => a.van - b.van || a.rit.id.localeCompare(b.rit.id));
    for (let i = 0; i < groep.length; i += 1) {
      const a = groep[i];
      if (!a) continue;
      for (let j = i + 1; j < groep.length; j += 1) {
        const b = groep[j];
        if (!b || b.van >= a.tot) break; // gesorteerd op begin: verderop kan niets meer overlappen met a
        const v = sleutel.startsWith("v:") ? voorVoertuig.get(sleutel.slice(2)) : undefined;
        const naam = sleutel.startsWith("v:") ? (v ? `Voertuig ${voertuigNaam(v)}` : "Dit voertuig") : `Chauffeur ${a.rit.chauffeur}`;
        voeg(a.rit.id, `${naam} is in die tijd ook ingepland bij ${b.rit.nummer}.`);
        voeg(b.rit.id, `${naam} is in die tijd ook ingepland bij ${a.rit.nummer}.`);
      }
    }
  }
  return uit;
}

// --- groeperen en filteren --------------------------------------------------------------

export interface RitFilter {
  status?: RitStatus | undefined;
  voertuigId?: string | undefined;
  chauffeur?: string | undefined;
}

/** Filtert op status, voertuig en chauffeur (een lege waarde telt niet mee). */
export function filterRitten(ritten: readonly Rit[], f: RitFilter): Rit[] {
  return ritten.filter((r) => (!f.status || r.status === f.status) && (!f.voertuigId || r.voertuigId === f.voertuigId) && (!f.chauffeur || r.chauffeur.toLowerCase() === f.chauffeur.toLowerCase()));
}

/** Ritten per Nederlandse dag van de periode (ook lege dagen), op begintijd. */
export function groepeerPerDag(ritten: readonly Rit[], van: string, tot: string): Array<{ dag: string; ritten: Rit[] }> {
  return dagenVan(van, tot).map((dag) => ({
    dag,
    ritten: ritten.filter((r) => ritDag(r) === dag).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)),
  }));
}

/** De Nederlandse week (maandag tot zondag) waarin `nu` valt. */
export const huidigeWeek = (nu: Date): { van: string; tot: string } => weekVan(amsterdamDayKey(nu));

/** Het jaar waarin `nu` valt, voor het volgnummer (Nederlands kalenderjaar). */
export const ritJaar = (nu: Date): number => amsterdamParts(nu).year;
