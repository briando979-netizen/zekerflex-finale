// ---------------------------------------------------------------------------
// Kamers en verblijven (hotel, B&B, vakantieverhuur). Dit is het zuivere deel, zonder opslag en zonder tijdzones.
//
// Alles draait op Nederlandse KALENDERDAGEN als tekst ("2026-03-29"), nooit op tijdstippen. Een nacht is de nacht van de
// aankomstdag tot de volgende ochtend: een verblijf van 2026-03-28 tot 2026-03-30 is twee nachten (28 en 29 maart).
// Dagen tellen en optellen gaat via Date.UTC op hele dagen (middernacht UTC kent geen zomer- of wintertijd), dus de
// nachten verschuiven nooit rond de overgang van 29 maart of 25 oktober. Alleen "vandaag" komt van buiten (de aanroeper
// geeft die door, uit lib/time/amsterdam), zodat dit bestand ook in de browser kan zonder hydratiefout.
//
// Een nachtboeking blokkeert de kamer; vertrek op dag X en aankomst op dag X in dezelfde kamer botsen NIET. Een
// geannuleerde boeking blokkeert niets en telt niet mee in de bezetting.
// ---------------------------------------------------------------------------

export const MAX_KAMERS = 200;
export const MAX_BOEKINGEN = 20_000;
export const MAX_NACHTEN = 366;
export const MAX_BEZETTING_DAGEN = 31;
export const BEWAAR_JAREN = 2;
export const KALENDER_DAGEN = 14;

export const KAMER_ID = /^[0-9a-f]{12}$/;
/** "2026-0001": het jaar van het aanmaken en een volgnummer. Het getoonde nummer is K-2026-0001. */
export const BOEKING_ID = /^\d{4}-\d{4,6}$/;

// --- kalenderdagen -----------------------------------------------------------

const DAG = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DAG = 86_400_000;

/** Is dit een echte kalenderdag ("2028-02-29" wel, "2026-02-29" niet) tussen 2000 en 2100? */
export function isDag(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DAG.exec(s);
  if (!m) return false;
  const j = Number(m[1]);
  const mnd = Number(m[2]);
  const d = Number(m[3]);
  if (j < 2000 || j > 2100) return false;
  const t = new Date(Date.UTC(j, mnd - 1, d));
  return t.getUTCFullYear() === j && t.getUTCMonth() === mnd - 1 && t.getUTCDate() === d;
}

/** Het dagnummer sinds 1 januari 1970 (hele getallen, geen tijdzone). */
export function dagNr(dag: string): number {
  const m = DAG.exec(dag);
  if (!m) throw new Error("Geen kalenderdag.");
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_DAG;
}

export function plusDagen(dag: string, n: number): string {
  return new Date((dagNr(dag) + n) * MS_DAG).toISOString().slice(0, 10);
}

/** Het aantal nachten tussen aankomst en vertrek (negatief als het vertrek eerder is). */
export function aantalNachten(aankomst: string, vertrek: string): number {
  return dagNr(vertrek) - dagNr(aankomst);
}

/** Dezelfde dag n jaar eerder; 29 februari wordt 28 februari in een gewoon jaar. */
export function minJaren(dag: string, n: number): string {
  const m = DAG.exec(dag);
  if (!m) throw new Error("Geen kalenderdag.");
  const j = Number(m[1]) - n;
  const mnd = Number(m[2]);
  let d = Number(m[3]);
  const dagenInMaand = new Date(Date.UTC(j, mnd, 0)).getUTCDate();
  if (d > dagenInMaand) d = dagenInMaand;
  return `${String(j).padStart(4, "0")}-${m[2]}-${String(d).padStart(2, "0")}`;
}

const WEEKDAG_KORT = ["zo", "ma", "di", "wo", "do", "vr", "za"] as const;
const MAAND_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const;

/** "ma" voor een maandag: de weekdag van een kalenderdag, in de browser en op de server hetzelfde. */
export const weekdagKort = (dag: string): string => WEEKDAG_KORT[new Date(dagNr(dag) * MS_DAG).getUTCDay()] ?? "";

/** "12 nov" */
export const dagMaandKort = (dag: string): string => `${Number(dag.slice(8, 10))} ${MAAND_KORT[Number(dag.slice(5, 7)) - 1] ?? ""}`;

/** De opeenvolgende dagen vanaf `van`. */
export function dagenVanaf(van: string, aantal: number): string[] {
  return Array.from({ length: aantal }, (_, i) => plusDagen(van, i));
}

/** Overlappen twee verblijven? Vertrek op de dag van aankomst van de ander telt NIET als overlap. */
export function overlapt(a1: string, v1: string, a2: string, v2: string): boolean {
  return a1 < v2 && a2 < v1;
}

// --- kamers --------------------------------------------------------------------

export type Schoon = "schoon" | "vuil" | "in-schoonmaak";
export const SCHOON_NAAM: Record<Schoon, string> = { schoon: "Schoon", vuil: "Vuil", "in-schoonmaak": "In schoonmaak" };
export const SCHOON_VOLGORDE: readonly Schoon[] = ["schoon", "vuil", "in-schoonmaak"];
export const isSchoon = (s: unknown): s is Schoon => typeof s === "string" && Object.hasOwn(SCHOON_NAAM, s);

export interface Kamer {
  id: string;
  naam: string;
  type: string;
  capaciteit: number;
  /** per nacht, in centen, inclusief btw; null = geen prijs ingevuld */
  prijsCent: number | null;
  schoon: Schoon;
  gearchiveerd: boolean;
  notitie: string;
  gemaaktOp: string;
  bijgewerktOp: string;
}

export interface KamerInhoud {
  naam: string;
  type: string;
  capaciteit: number;
  prijsCent: number | null;
  notitie: string;
}

// --- boekingen -----------------------------------------------------------------

export type BoekingStatus = "gereserveerd" | "ingecheckt" | "uitgecheckt" | "geannuleerd";
export const STATUS_NAAM: Record<BoekingStatus, string> = {
  gereserveerd: "Gereserveerd",
  ingecheckt: "Ingecheckt",
  uitgecheckt: "Uitgecheckt",
  geannuleerd: "Geannuleerd",
};
export const isStatus = (s: unknown): s is BoekingStatus => typeof s === "string" && Object.hasOwn(STATUS_NAAM, s);

/** Welke statussen kunnen er daarna volgen. Terug kan ook: een vergissing herstel je zonder de boeking opnieuw te maken. */
export const OVERGANGEN: Record<BoekingStatus, readonly BoekingStatus[]> = {
  gereserveerd: ["ingecheckt", "geannuleerd"],
  ingecheckt: ["uitgecheckt", "gereserveerd"],
  uitgecheckt: ["ingecheckt"],
  geannuleerd: ["gereserveerd"],
};

export interface Boeking {
  id: string;
  /** K-2026-0001 */
  nummer: string;
  kamerId: string;
  /** eerste nacht, als kalenderdag */
  aankomst: string;
  /** de ochtend van vertrek (de laatste nacht is de nacht ervoor) */
  vertrek: string;
  naam: string;
  telefoon: string;
  email: string;
  personen: number;
  opmerking: string;
  status: BoekingStatus;
  /** de prijs per nacht van de kamer op het moment van boeken of verplaatsen; null = geen prijs */
  prijsPerNachtCent: number | null;
  /** handmatig overschreven totaalprijs in centen; null = nachten × prijs per nacht */
  prijsOverschrijfCent: number | null;
  /** wanneer de gastgegevens zijn gewist (de boeking blijft als lege regel voor de bezetting) */
  gastGewistOp: string | null;
  gemaaktOp: string;
  bijgewerktOp: string;
}

export interface BoekingInhoud {
  kamerId: string;
  aankomst: string;
  vertrek: string;
  naam: string;
  telefoon: string;
  email: string;
  personen: number;
  opmerking: string;
  prijsOverschrijfCent: number | null;
}

export const nummerVan = (jaar: number, nr: string): string => `K-${jaar}-${nr}`;

/** Telt de boeking mee voor bezetting en botsing? Een geannuleerde boeking niet. */
export const telt = (b: Pick<Boeking, "status">): boolean => b.status !== "geannuleerd";

/** Het totaal in centen: de overschrijving, anders nachten × prijs per nacht; null zonder prijs. */
export function totaalCent(b: Pick<Boeking, "aankomst" | "vertrek" | "prijsPerNachtCent" | "prijsOverschrijfCent">): number | null {
  if (b.prijsOverschrijfCent !== null) return b.prijsOverschrijfCent;
  if (b.prijsPerNachtCent === null) return null;
  return aantalNachten(b.aankomst, b.vertrek) * b.prijsPerNachtCent;
}

// --- invoer controleren ---------------------------------------------------------

const fout = (m: string): never => {
  throw Object.assign(new Error(m), { kamersInvoer: true });
};
/** Is dit een foutmelding over invoer (in tegenstelling tot een programmeerfout)? */
export const isInvoerFout = (e: unknown): e is Error => e instanceof Error && Object.hasOwn(e, "kamersInvoer");

// eslint-disable-next-line no-control-regex
const STUUR = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function tekst(v: unknown, max: number, label: string, verplicht = false): string {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") return fout(`${label} moet tekst zijn.`);
  const t = v.replace(STUUR, "").trim();
  if (verplicht && !t) return fout(`${label} is verplicht.`);
  if (t.length > max) return fout(`${label} mag hoogstens ${max} tekens hebben.`);
  return t;
}

function heel(v: unknown, label: string, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d+\s*$/.test(v) ? Number(v) : Number.NaN;
  if (!Number.isInteger(n) || n < min || n > max) return fout(`${label} moet een heel getal zijn van ${min} tot en met ${max}.`);
  return n;
}

function centen(v: unknown, label: string, max: number): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number.NaN;
  if (!Number.isInteger(n) || n < 0 || n > max) return fout(`${label} moet een bedrag in hele centen zijn, tussen 0 en ${max}.`);
  return n;
}

export function valideerKamer(o: Record<string, unknown>): KamerInhoud {
  return {
    naam: tekst(o.naam, 40, "De naam of het nummer van de kamer", true),
    type: tekst(o.type, 60, "Het type kamer"),
    capaciteit: heel(o.capaciteit, "De capaciteit", 1, 20),
    prijsCent: centen(o.prijsCent, "De prijs per nacht", 1_000_000),
    notitie: tekst(o.notitie, 300, "De notitie"),
  };
}

/** Is de kamernaam al in gebruik (hoofdletters en spaties tellen niet; gearchiveerde kamers tellen mee)? */
export function kamerNaamBezet(naam: string, kamers: readonly Kamer[], negeerId?: string): boolean {
  const sleutel = naam.trim().toLowerCase();
  return kamers.some((k) => k.id !== negeerId && k.naam.trim().toLowerCase() === sleutel);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFOON = /^[0-9+()\-./ ]+$/;

/** De velden van een boeking. Bij een boeking waarvan de gastgegevens gewist zijn, blijven die leeg en is een naam niet verplicht. */
export function valideerBoeking(o: Record<string, unknown>, opties: { gewist?: boolean } = {}): BoekingInhoud {
  const kamerId = typeof o.kamerId === "string" && KAMER_ID.test(o.kamerId) ? o.kamerId : fout("Kies een kamer.");
  const aankomst = isDag(o.aankomst) ? o.aankomst : fout("De aankomstdatum is geen geldige datum.");
  const vertrek = isDag(o.vertrek) ? o.vertrek : fout("De vertrekdatum is geen geldige datum.");
  const nachten = aantalNachten(aankomst, vertrek);
  if (nachten < 1) fout("De vertrekdatum moet na de aankomstdatum liggen (een verblijf is minstens één nacht).");
  if (nachten > MAX_NACHTEN) fout(`Een verblijf duurt hoogstens ${MAX_NACHTEN} nachten.`);
  const gewist = opties.gewist === true;
  const telefoon = gewist ? "" : tekst(o.telefoon, 40, "Het telefoonnummer");
  if (telefoon && (!TELEFOON.test(telefoon) || telefoon.replace(/\D/g, "").length < 6)) fout("Het telefoonnummer klopt niet. Gebruik alleen cijfers, spaties, + en -.");
  const email = gewist ? "" : tekst(o.email, 120, "Het e-mailadres");
  if (email && !EMAIL.test(email)) fout("Het e-mailadres klopt niet.");
  return {
    kamerId,
    aankomst,
    vertrek,
    naam: gewist ? "" : tekst(o.naam, 80, "De naam van de gast", true),
    telefoon,
    email,
    personen: heel(o.personen, "Het aantal personen", 1, 20),
    opmerking: gewist ? "" : tekst(o.opmerking, 500, "De opmerking"),
    prijsOverschrijfCent: centen(o.prijsOverschrijfCent, "De totaalprijs", 100_000_000),
  };
}

// --- plaatsing: botsing, capaciteit, archief --------------------------------------

export type Plaatsing = { ok: true } | { ok: false; fout: string };

/** Een nacht in leesbare vorm: "2026-03-28" → "28-03-2026". */
export const nlDag = (dag: string): string => dag.split("-").reverse().join("-");

/** De boekingen van een kamer die in de gevraagde nachten een nacht bezetten (geannuleerd telt niet). */
export function botsingen(boekingen: readonly Boeking[], kamerId: string, aankomst: string, vertrek: string, negeerId?: string): Boeking[] {
  return boekingen.filter((b) => b.kamerId === kamerId && b.id !== negeerId && telt(b) && overlapt(aankomst, vertrek, b.aankomst, b.vertrek));
}

/** Is de kamer in deze nachten vrij? */
export function isBeschikbaar(boekingen: readonly Boeking[], kamerId: string, aankomst: string, vertrek: string, negeerId?: string): boolean {
  return botsingen(boekingen, kamerId, aankomst, vertrek, negeerId).length === 0;
}

/** Mag deze boeking in deze kamer staan: kamer actief, genoeg plaats voor de personen, geen dubbele boeking. */
export function controleerPlaatsing(inhoud: Pick<BoekingInhoud, "kamerId" | "aankomst" | "vertrek" | "personen">, kamer: Kamer | undefined, boekingen: readonly Boeking[], negeerId?: string): Plaatsing {
  if (!kamer) return { ok: false, fout: "Deze kamer bestaat niet (meer)." };
  if (kamer.gearchiveerd) return { ok: false, fout: `Kamer ${kamer.naam} is gearchiveerd. Haal de kamer eerst terug of kies een andere kamer.` };
  if (inhoud.personen > kamer.capaciteit) return { ok: false, fout: `Kamer ${kamer.naam} is voor hoogstens ${kamer.capaciteit} ${kamer.capaciteit === 1 ? "persoon" : "personen"}; je vulde ${inhoud.personen} in.` };
  const bots = botsingen(boekingen, kamer.id, inhoud.aankomst, inhoud.vertrek, negeerId)[0];
  if (bots) return { ok: false, fout: `Kamer ${kamer.naam} is in deze nachten al bezet door boeking ${bots.nummer} (${nlDag(bots.aankomst)} tot ${nlDag(bots.vertrek)}). Aankomen op de dag dat een gast vertrekt kan wel.` };
  return { ok: true };
}

/** De kamers die vrij zijn voor deze aankomst en dit vertrek en groot genoeg zijn; de kleinste (passendste) eerst. */
export function vrijeKamers(kamers: readonly Kamer[], boekingen: readonly Boeking[], aankomst: string, vertrek: string, personen: number, negeerId?: string): Kamer[] {
  return kamers
    .filter((k) => !k.gearchiveerd && k.capaciteit >= personen && isBeschikbaar(boekingen, k.id, aankomst, vertrek, negeerId))
    .sort((a, b) => a.capaciteit - b.capaciteit || a.naam.localeCompare(b.naam, "nl", { numeric: true }));
}

/** Heeft de kamer nog een boeking die niet voorbij is (gereserveerd of ingecheckt, vertrek na vandaag)? */
export function toekomstigeBoekingen(boekingen: readonly Boeking[], kamerId: string, vandaag: string): Boeking[] {
  return boekingen.filter((b) => b.kamerId === kamerId && (b.status === "gereserveerd" || b.status === "ingecheckt") && b.vertrek > vandaag);
}

// --- status ----------------------------------------------------------------------

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; fout: string };

/**
 * Zet de status. Alleen de overgangen uit OVERGANGEN. Terug naar gereserveerd of ingecheckt vanuit geannuleerd moet
 * opnieuw passen (de nachten kunnen intussen zijn vergeven, de kamer kan gearchiveerd zijn).
 */
export function wisselStatus(b: Boeking, naar: BoekingStatus, kamer: Kamer | undefined, boekingen: readonly Boeking[], nu: Date): Resultaat<Boeking> {
  if (b.status === naar) return { ok: true, waarde: b };
  if (!OVERGANGEN[b.status].includes(naar)) return { ok: false, fout: `Een boeking die ${STATUS_NAAM[b.status].toLowerCase()} is, kan niet naar ${STATUS_NAAM[naar].toLowerCase()}.` };
  if (b.status === "geannuleerd") {
    const p = controleerPlaatsing(b, kamer, boekingen, b.id);
    if (!p.ok) return { ok: false, fout: p.fout };
  }
  return { ok: true, waarde: { ...b, status: naar, bijgewerktOp: nu.toISOString() } };
}

// --- persoonsgegevens ---------------------------------------------------------------

export const heeftGastgegevens = (b: Pick<Boeking, "naam" | "telefoon" | "email" | "opmerking">): boolean => Boolean(b.naam || b.telefoon || b.email || b.opmerking);

/** Naam, telefoon, e-mail en opmerking wissen. De boeking blijft als lege regel staan, zodat de bezetting klopt. */
export function wisGastgegevens(b: Boeking, nu: Date): Boeking {
  if (b.gastGewistOp !== null && !heeftGastgegevens(b)) return b;
  return { ...b, naam: "", telefoon: "", email: "", opmerking: "", gastGewistOp: nu.toISOString(), bijgewerktOp: nu.toISOString() };
}

/**
 * Boekingen waarvan de gastgegevens niet langer bewaard horen te worden: uitgecheckt met vertrek langer dan twee jaar
 * geleden en nog niet gewist. Een geannuleerde of nooit afgesloten boeking valt hier bewust buiten (die is zelf
 * af te handelen), net als alles wat korter dan twee jaar geleden is.
 */
export function teWissenNaBewaartermijn(boekingen: readonly Boeking[], vandaag: string): Boeking[] {
  const grens = minJaren(vandaag, BEWAAR_JAREN);
  return boekingen.filter((b) => b.status === "uitgecheckt" && b.vertrek < grens && heeftGastgegevens(b));
}

// --- dagoverzicht en kalender ------------------------------------------------------------

/** Wie komt er op deze dag aan (gereserveerd en aankomst vandaag), op kamernaam. */
export function aankomstenOp(boekingen: readonly Boeking[], dag: string): Boeking[] {
  return boekingen.filter((b) => b.status === "gereserveerd" && b.aankomst === dag);
}

/** Wie vertrekt er op deze dag (ingecheckt en vertrek vandaag). */
export function vertrekkenOp(boekingen: readonly Boeking[], dag: string): Boeking[] {
  return boekingen.filter((b) => b.status === "ingecheckt" && b.vertrek === dag);
}

/** De boeking die in de nacht van deze dag in de kamer ligt, als die er is. */
export function boekingInNacht(boekingen: readonly Boeking[], kamerId: string, dag: string): Boeking | undefined {
  return boekingen.find((b) => b.kamerId === kamerId && telt(b) && b.aankomst <= dag && dag < b.vertrek);
}

export interface KalenderCel {
  dag: string;
  boeking: Boeking | null;
  /** de eerste nacht van deze boeking binnen het getoonde venster */
  begin: boolean;
}

/** Eén rij van de kalender: per dag de boeking van die nacht. */
export function kalenderRij(boekingen: readonly Boeking[], kamerId: string, dagen: readonly string[]): KalenderCel[] {
  return dagen.map((dag, i) => {
    const boeking = boekingInNacht(boekingen, kamerId, dag) ?? null;
    const vorige = i > 0 ? boekingInNacht(boekingen, kamerId, dagen[i - 1] ?? "") : undefined;
    return { dag, boeking, begin: boeking !== null && vorige?.id !== boeking.id };
  });
}

// --- bezetting ------------------------------------------------------------------------

export interface Bezetting {
  /** het aantal dagen (nachten) in de periode */
  dagen: number;
  /** kamer-nachten die beschikbaar waren: kamers × dagen */
  beschikbaar: number;
  /** kamer-nachten die bezet waren */
  bezet: number;
  /** bezet / beschikbaar in procenten, met één decimaal; 0 zonder beschikbare nachten */
  procent: number;
}

/**
 * De bezetting over een periode, van `van` tot en met `tot` (elke dag is een nacht): bezette kamer-nachten gedeeld door
 * beschikbare kamer-nachten. Geef alleen de kamers mee die meetellen (de actieve). Een geannuleerde boeking telt niet,
 * en een kamer-nacht telt één keer, ook als er per vergissing twee boekingen op staan.
 */
export function bezetting(kamers: readonly Kamer[], boekingen: readonly Boeking[], van: string, tot: string): Resultaat<Bezetting> {
  if (!isDag(van) || !isDag(tot)) return { ok: false, fout: "De periode heeft geen geldige data." };
  const dagen = aantalNachten(van, tot) + 1;
  if (dagen < 1) return { ok: false, fout: "De einddatum mag niet voor de begindatum liggen." };
  if (dagen > MAX_BEZETTING_DAGEN) return { ok: false, fout: `Een periode is hoogstens ${MAX_BEZETTING_DAGEN} dagen.` };
  const lijst = dagenVanaf(van, dagen);
  const inPeriode = boekingen.filter((b) => telt(b) && overlapt(van, plusDagen(tot, 1), b.aankomst, b.vertrek));
  let bezet = 0;
  for (const k of kamers) for (const dag of lijst) if (boekingInNacht(inPeriode, k.id, dag)) bezet += 1;
  const beschikbaar = kamers.length * dagen;
  const procent = beschikbaar === 0 ? 0 : Math.round((bezet / beschikbaar) * 1000) / 10;
  return { ok: true, waarde: { dagen, beschikbaar, bezet, procent } };
}
