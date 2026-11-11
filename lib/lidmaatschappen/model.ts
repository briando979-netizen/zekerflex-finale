// ---------------------------------------------------------------------------
// Lidmaatschappen voor sportscholen, studio's en trainers: leden, vormen (abonnement of strippenkaart), lidmaatschappen
// en bezoeken. Dit is het zuivere deel, zonder opslag (lib/lidmaatschappen/store.ts): invoer controleren met Nederlandse
// fouten, rekenen met kalenderdagen, statusovergangen, "loopt af" en "bijna op", de omzetschatting en de bewaartermijn.
//
// Alle datums zijn Nederlandse kalenderdagen als tekst ("2026-03-29"), zonder tijd en zonder zone: optellen en aftrekken
// gaat met Date.UTC op losse jaar/maand/dag, dus de zomer- en wintertijd kan er nooit tussen komen. Alleen het omzetten
// van een tijdstip naar een kalenderdag gebeurt met amsterdamDayKey (lib/time/amsterdam.ts).
//
// Wat dit onderdeel NIET doet: betalingen, incasso, facturen of herinneringsmails. Het houdt alleen bij wie lid is, van
// welke vorm, en wanneer iemand komt. Een geboortedatum wordt bewust niet bewaard: die is hier niet nodig.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

export const SOORTEN = ["week", "maand", "jaar", "strippenkaart"] as const;
export type Soort = (typeof SOORTEN)[number];
export const SOORT_NAAM: Record<Soort, string> = { week: "Per week", maand: "Per maand", jaar: "Per jaar", strippenkaart: "Strippenkaart" };
export const isLooptijd = (s: Soort): s is "week" | "maand" | "jaar" => s !== "strippenkaart";

export type Status = "actief" | "gepauzeerd" | "beeindigd";
/** De status zoals hij nu geldt: een lidmaatschap dat op de einddatum is verlopen of een kaart die op is, is "afgelopen". */
export type EffectieveStatus = Status | "afgelopen";

/** Een id van een vorm, lid, lidmaatschap of bezoek: 12 hexadecimale tekens (zo komt hij uit de opslag). */
export const LM_ID = /^[a-f0-9]{12}$/;

/** "Bijna op" bij een strippenkaart: hoogstens dit aantal bezoeken over. */
export const BIJNA_OP_GRENS = 2;
/** "Loopt af": binnen zoveel dagen (de einddatum zelf telt nog mee). */
export const LOOPT_AF_DAGEN = 30;
/** Beëindigde leden worden na zoveel jaar gewist. */
export const BEWAAR_JAREN = 2;

const MAX_PRIJS_CENT = 10_000_000; // € 100.000
const MAX_PERIODEN = 120;
const MAX_STRIPPEN = 1_000;
const MAX_MAANDEN = 60;
const MAX_TERUG_JAREN = 5;

export interface Vorm {
  id: string;
  naam: string;
  soort: Soort;
  /** looptijd: de prijs per periode (week, maand of jaar) in centen incl. btw; strippenkaart: de prijs van de kaart (mag 0 zijn) */
  prijsCent: number;
  /** eenmalig inschrijfgeld in centen incl. btw (0 = geen); alleen ter informatie, het wordt hier niet geïnd */
  inschrijfgeldCent: number;
  /** looptijd: na hoeveel perioden het lidmaatschap eindigt; null = doorlopend (einde open). Anders null */
  looptijdPerioden: number | null;
  /** strippenkaart: het aantal bezoeken op de kaart. Anders null */
  strippen: number | null;
  /** strippenkaart: hoeveel maanden de kaart geldig is. Anders null */
  geldigheidMaanden: number | null;
  gearchiveerd: boolean;
  gemaaktOp: string;
}

export interface Lid {
  id: string;
  /** "L-0001"; blijft na het wissen bij het lid staan en wordt nooit opnieuw vergeven */
  nummer: string;
  naam: string;
  telefoon: string;
  email: string;
  notitie: string;
  /** de laatste keer dat dit lid kwam (tijdstip van de server), of null */
  laatstGezien: string | null;
  /** persoonsgegevens gewist: naam, telefoon, e-mail en notitie zijn leeg */
  gewist: boolean;
  gewistOp: string | null;
  gemaaktOp: string;
}

export interface Lidmaatschap {
  id: string;
  lidId: string;
  vormId: string;
  /** de gegevens van de vorm op het moment van afsluiten: een latere prijswijziging raakt bestaande lidmaatschappen niet */
  vormNaam: string;
  soort: Soort;
  prijsCent: number;
  status: Status;
  /** de eerste dag */
  startdatum: string;
  /** looptijd: de laatste dag (null = open); strippenkaart: de laatste dag dat de kaart geldt; beëindigd: de dag van het einde */
  einddatum: string | null;
  /** de dag dat de pauze inging (alleen bij status gepauzeerd) */
  pauzeSinds: string | null;
  /** de reden van het einde (alleen bij status beeindigd) */
  eindReden: string;
  /** strippenkaart: het aantal bezoeken bij de start. Anders null */
  strippenBegin: number | null;
  /** strippenkaart: het aantal bezoeken dat er al van af is (afgeleid uit het logboek, zie store.ts). Anders 0 */
  strippenGebruikt: number;
  gemaaktOp: string;
}

export interface Bezoek {
  id: string;
  lidId: string;
  /** het lidmaatschap waarvoor het bezoek telt; null = niet aan een lidmaatschap gekoppeld */
  lidmaatschapId: string | null;
  /** of er een strip van af is gegaan */
  strip: boolean;
  op: string;
  /** de Nederlandse kalenderdag van `op` */
  dag: string;
  /** alleen het gebruikers-id, nooit een naam */
  door: string;
}

// --- tekst en getallen --------------------------------------------------------

export function schoneTekst(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

const teLang = (v: unknown, max: number): boolean => typeof v === "string" && schoneTekst(v, 10_000).length > max;

/** Een getal uit een getal of uit tekst met Nederlandse komma ("12,5"). Anders NaN. */
export function leesGetal(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : Number.NaN;
  if (typeof v !== "string") return Number.NaN;
  const t = v.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Number(t);
}

/** Een heel getal binnen grenzen; leeg of ontbrekend geeft null. Anders een Nederlandse fout. */
function heelGetal(v: unknown, naam: string, min: number, max: number): number | null {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return null;
  const n = leesGetal(v);
  if (!Number.isInteger(n)) throw AppError.validation(`${naam}: vul een heel getal in.`);
  if (n < min || n > max) throw AppError.validation(`${naam}: kies een getal van ${min} tot en met ${max}.`);
  return n;
}

/** Bedrag in centen uit een getal (centen). */
function centen(v: unknown, naam: string, standaard: number | null): number {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    if (standaard === null) throw AppError.validation(`${naam}: vul een bedrag in.`);
    return standaard;
  }
  const n = typeof v === "number" ? v : Number.NaN;
  if (!Number.isInteger(n) || n < 0) throw AppError.validation(`${naam}: vul een bedrag van nul of meer in.`);
  if (n > MAX_PRIJS_CENT) throw AppError.validation(`${naam}: dat bedrag is te hoog.`);
  return n;
}

// --- kalenderdagen ----------------------------------------------------------------

const DAG = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Is dit een echte kalenderdag in de vorm "2028-02-29"? (29 februari alleen in een schrikkeljaar.) */
export function isDag(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DAG.exec(s);
  if (!m) return false;
  const [j, mnd, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(j, mnd - 1, d));
  return j >= 1900 && dt.getUTCFullYear() === j && dt.getUTCMonth() === mnd - 1 && dt.getUTCDate() === d;
}

const dagTekst = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
const dagMs = (s: string): number => {
  const m = DAG.exec(s);
  return Date.UTC(Number(m?.[1] ?? 1970), Number(m?.[2] ?? 1) - 1, Number(m?.[3] ?? 1));
};

/** De kalenderdag van een tijdstip in Nederland. */
export const vandaagVan = (nu: Date): string => amsterdamDayKey(nu);

/** Dagen erbij (of eraf met een negatief getal). */
export const plusDagen = (dag: string, n: number): string => dagTekst(dagMs(dag) + n * 86_400_000);

/** Het aantal dagen van `a` tot `b` (positief als b later is). */
export const dagenTussen = (a: string, b: string): number => Math.round((dagMs(b) - dagMs(a)) / 86_400_000);

/**
 * Maanden erbij (of eraf). Heeft de doelmaand die dag niet, dan wordt het de laatste dag van die maand:
 * 31 januari + 1 maand = 28 februari (29 in een schrikkeljaar); 29 februari 2028 + 1 jaar = 28 februari 2029.
 */
export function plusMaanden(dag: string, n: number): string {
  const m = DAG.exec(dag);
  const j = Number(m?.[1] ?? 1970);
  const mnd = Number(m?.[2] ?? 1);
  const d = Number(m?.[3] ?? 1);
  const totaal = j * 12 + (mnd - 1) + n;
  const nj = Math.floor(totaal / 12);
  const nm = ((totaal % 12) + 12) % 12;
  const laatste = new Date(Date.UTC(nj, nm + 1, 0)).getUTCDate();
  return dagTekst(Date.UTC(nj, nm, Math.min(d, laatste)));
}

/**
 * De laatste dag van een lidmaatschap dat `aantal` perioden duurt vanaf `start`: de dag vóór het begin van de periode
 * erna. Een maand vanaf 1 januari loopt dus t/m 31 januari; vanaf 15 januari t/m 14 februari; vanaf 31 januari t/m
 * 27 februari (28 februari is dan de eerste dag van de volgende periode). Een week is zeven dagen.
 */
export function eindeNaPerioden(start: string, soort: "week" | "maand" | "jaar", aantal: number): string {
  if (soort === "week") return plusDagen(start, aantal * 7 - 1);
  return plusDagen(plusMaanden(start, soort === "jaar" ? aantal * 12 : aantal), -1);
}

// --- vorm controleren -------------------------------------------------------------

export interface VormInvoer {
  naam: string;
  soort: Soort;
  prijsCent: number;
  inschrijfgeldCent: number;
  looptijdPerioden: number | null;
  strippen: number | null;
  geldigheidMaanden: number | null;
}

export function valideerVorm(o: Record<string, unknown>): VormInvoer {
  const naam = schoneTekst(o.naam, 60);
  if (naam.length < 2) throw AppError.validation("Geef de vorm een naam van minstens 2 tekens.");
  if (teLang(o.naam, 60)) throw AppError.validation("De naam is te lang (hoogstens 60 tekens).");
  const soort = typeof o.soort === "string" && (SOORTEN as readonly string[]).includes(o.soort) ? (o.soort as Soort) : null;
  if (!soort) throw AppError.validation("Kies de soort: per week, per maand, per jaar of strippenkaart.");
  const inschrijfgeldCent = centen(o.inschrijfgeldCent, "Inschrijfgeld", 0);
  if (isLooptijd(soort)) {
    const prijsCent = centen(o.prijsCent, "De prijs per periode", null);
    const perioden = heelGetal(o.looptijdPerioden, "Het aantal perioden", 1, MAX_PERIODEN);
    return { naam, soort, prijsCent, inschrijfgeldCent, looptijdPerioden: perioden, strippen: null, geldigheidMaanden: null };
  }
  const strippen = heelGetal(o.strippen, "Het aantal bezoeken op de kaart", 1, MAX_STRIPPEN);
  if (strippen === null) throw AppError.validation("Het aantal bezoeken op de kaart: vul een heel getal in.");
  const maanden = heelGetal(o.geldigheidMaanden, "De geldigheid in maanden", 1, MAX_MAANDEN);
  if (maanden === null) throw AppError.validation("De geldigheid in maanden: vul een heel getal in.");
  return { naam, soort, prijsCent: centen(o.prijsCent, "De prijs van de kaart", 0), inschrijfgeldCent, looptijdPerioden: null, strippen, geldigheidMaanden: maanden };
}

// --- lid controleren --------------------------------------------------------------

export interface LidInvoer {
  naam: string;
  telefoon: string;
  email: string;
  notitie: string;
}

const EMAIL = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@.]+$/;

/**
 * Controleert de invoer van een lid: een naam, en minstens één van telefoon of e-mail. Andere velden (zoals een
 * geboortedatum) worden genegeerd en dus nooit bewaard.
 */
export function valideerLid(o: Record<string, unknown>): LidInvoer {
  const naam = schoneTekst(o.naam, 80);
  if (naam.length < 2) throw AppError.validation("Geef het lid een naam van minstens 2 tekens.");
  if (teLang(o.naam, 80)) throw AppError.validation("De naam is te lang (hoogstens 80 tekens).");
  const telefoon = schoneTekst(o.telefoon, 30);
  if (teLang(o.telefoon, 30)) throw AppError.validation("Het telefoonnummer is te lang (hoogstens 30 tekens).");
  if (telefoon && (!/^[0-9+() \-]+$/.test(telefoon) || telefoon.replace(/\D/g, "").length < 6)) {
    throw AppError.validation("Het telefoonnummer klopt niet. Gebruik alleen cijfers, spaties, + en -, bijvoorbeeld 06 12345678.");
  }
  const email = schoneTekst(o.email, 120).toLowerCase();
  if (teLang(o.email, 120)) throw AppError.validation("Het e-mailadres is te lang (hoogstens 120 tekens).");
  if (email && !EMAIL.test(email)) throw AppError.validation("Het e-mailadres klopt niet. Vul bijvoorbeeld naam@voorbeeld.nl in.");
  if (!telefoon && !email) throw AppError.validation("Vul minstens een telefoonnummer of een e-mailadres in, zodat je het lid kunt bereiken.");
  if (teLang(o.notitie, 300)) throw AppError.validation("De notitie is te lang (hoogstens 300 tekens).");
  return { naam, telefoon, email, notitie: schoneTekst(o.notitie, 300) };
}

/** De persoonsgegevens weg; nummer, id, laatst gezien en het aanmaakmoment blijven (de cijfers en bezoekregels hebben ze nodig). */
export function wisLidGegevens(lid: Lid, nu: Date): Lid {
  return { ...lid, naam: "", telefoon: "", email: "", notitie: "", gewist: true, gewistOp: nu.toISOString() };
}

/** Hoe een lid in een lijst heet. */
export const lidNaam = (l: Lid): string => (l.gewist ? "Gewist lid" : l.naam);

// --- lidmaatschap aanmaken ----------------------------------------------------------

/**
 * Een nieuw lidmaatschap uit een vorm. De startdatum is vandaag of eerder (maximaal vijf jaar terug, voor leden die al
 * lang komen): een lid dat volgende week begint, voer je volgende week in. Bij een looptijd met een vast aantal perioden
 * is de einddatum afgeleid; anders is hij open. Een strippenkaart krijgt zijn tegoed en de laatste geldige dag.
 */
export function bouwLidmaatschap(vorm: Vorm, lidId: string, id: string, startdatum: unknown, nu: Date): Lidmaatschap {
  const vandaag = vandaagVan(nu);
  const start = startdatum === undefined || startdatum === null || startdatum === "" ? vandaag : startdatum;
  if (!isDag(start)) throw AppError.validation("De startdatum klopt niet. Kies een bestaande datum.");
  if (start > vandaag) throw AppError.validation("De startdatum mag niet in de toekomst liggen. Voer het lidmaatschap in op de dag dat het begint.");
  if (start < plusMaanden(vandaag, -12 * MAX_TERUG_JAREN)) throw AppError.validation(`De startdatum ligt te ver terug (hoogstens ${MAX_TERUG_JAREN} jaar).`);
  const eind = isLooptijd(vorm.soort)
    ? vorm.looptijdPerioden === null
      ? null
      : eindeNaPerioden(start, vorm.soort, vorm.looptijdPerioden)
    : eindeNaPerioden(start, "maand", vorm.geldigheidMaanden ?? 1);
  return {
    id,
    lidId,
    vormId: vorm.id,
    vormNaam: vorm.naam,
    soort: vorm.soort,
    prijsCent: vorm.prijsCent,
    status: "actief",
    startdatum: start,
    einddatum: eind,
    pauzeSinds: null,
    eindReden: "",
    strippenBegin: isLooptijd(vorm.soort) ? null : vorm.strippen,
    strippenGebruikt: 0,
    gemaaktOp: nu.toISOString(),
  };
}

// --- strippen en status ------------------------------------------------------------

/** Het aantal bezoeken dat er nog op de kaart staat (nooit onder nul); null bij een abonnement. */
export function tegoed(lm: Lidmaatschap): number | null {
  return lm.strippenBegin === null ? null : Math.max(0, lm.strippenBegin - lm.strippenGebruikt);
}

/** De status zoals hij op `vandaag` geldt (zie EffectieveStatus). */
export function effectieveStatus(lm: Lidmaatschap, vandaag: string): EffectieveStatus {
  if (lm.status === "beeindigd") return "beeindigd";
  if (lm.einddatum !== null && lm.einddatum < vandaag) return "afgelopen";
  if (tegoed(lm) === 0) return "afgelopen";
  return lm.status;
}

/** Mag er nu een bezoek op dit lidmaatschap? Zo niet: de Nederlandse uitleg. */
export function bezoekBlokkade(lm: Lidmaatschap, vandaag: string): string | null {
  if (lm.status === "beeindigd") return `Het lidmaatschap "${lm.vormNaam}" is beëindigd.`;
  if (lm.status === "gepauzeerd") return `Het lidmaatschap "${lm.vormNaam}" is gepauzeerd. Hervat het eerst.`;
  if (lm.einddatum !== null && lm.einddatum < vandaag) {
    return lm.strippenBegin === null ? `Het lidmaatschap "${lm.vormNaam}" is afgelopen op ${nlDag(lm.einddatum)}.` : `De strippenkaart "${lm.vormNaam}" is verlopen op ${nlDag(lm.einddatum)}.`;
  }
  if (tegoed(lm) === 0) return `De strippenkaart "${lm.vormNaam}" is op: er staan geen bezoeken meer op. Verkoop een nieuwe kaart.`;
  return null;
}

/**
 * Welk lidmaatschap telt voor een bezoek zonder gekozen lidmaatschap: een lopend abonnement gaat voor (daar gaat geen
 * strip af); anders de strippenkaart die het eerst verloopt. Geen enkel bruikbaar lidmaatschap: de uitleg waarom niet.
 */
export function kiesLidmaatschap(lms: Lidmaatschap[], vandaag: string): { lm: Lidmaatschap } | { fout: string } {
  if (lms.length === 0) return { fout: "Dit lid heeft nog geen lidmaatschap. Sluit eerst een abonnement of strippenkaart af." };
  const bruikbaar = lms.filter((l) => bezoekBlokkade(l, vandaag) === null);
  const abo = bruikbaar.find((l) => l.strippenBegin === null);
  if (abo) return { lm: abo };
  const kaarten = bruikbaar.filter((l) => l.strippenBegin !== null).sort((a, b) => (a.einddatum ?? "9999-12-31").localeCompare(b.einddatum ?? "9999-12-31") || a.id.localeCompare(b.id));
  const kaart = kaarten[0];
  if (kaart) return { lm: kaart };
  // niets bruikbaar: leg het nieuwste lidmaatschap uit
  const nieuwste = [...lms].sort((a, b) => b.gemaaktOp.localeCompare(a.gemaaktOp) || b.id.localeCompare(a.id))[0];
  return { fout: (nieuwste && bezoekBlokkade(nieuwste, vandaag)) ?? "Dit lid heeft geen bruikbaar lidmaatschap." };
}

export interface StatusActie {
  actie: "pauzeren" | "hervatten" | "beeindigen";
  /** pauzeren: de dag waarop de pauze ingaat (standaard vandaag) */
  datum?: unknown;
  reden?: unknown;
}

/**
 * Statusovergangen: actief → gepauzeerd, gepauzeerd → actief, en actief of gepauzeerd → beëindigd. Beëindigd is het einde.
 * Een pauze schuift de einddatum op met het aantal dagen dat de pauze duurde (de leden betalen niet voor een pauze, dus
 * de einddatum van een abonnement of de geldigheid van een kaart schuift mee). Bij beëindigen wordt de einddatum de dag
 * van het einde (vandaag, of een gekozen dag in het verleden) en is een reden verplicht.
 */
export function wijzigStatus(lm: Lidmaatschap, a: StatusActie, nu: Date): Lidmaatschap {
  const vandaag = vandaagVan(nu);
  if (lm.status === "beeindigd") throw AppError.conflict("Dit lidmaatschap is beëindigd en kan niet meer veranderen. Sluit zo nodig een nieuw lidmaatschap af.");
  if (a.actie === "pauzeren") {
    if (lm.status === "gepauzeerd") throw AppError.conflict("Dit lidmaatschap is al gepauzeerd.");
    if (effectieveStatus(lm, vandaag) === "afgelopen") throw AppError.conflict("Dit lidmaatschap is al afgelopen en kan niet meer worden gepauzeerd.");
    const dag = a.datum === undefined || a.datum === null || a.datum === "" ? vandaag : a.datum;
    if (!isDag(dag)) throw AppError.validation("De pauzedatum klopt niet. Kies een bestaande datum.");
    if (dag > vandaag) throw AppError.validation("De pauze kan niet in de toekomst ingaan. Pauzeer op de dag zelf.");
    if (dag < lm.startdatum) throw AppError.validation("De pauze kan niet ingaan vóór de startdatum van het lidmaatschap.");
    return { ...lm, status: "gepauzeerd", pauzeSinds: dag };
  }
  if (a.actie === "hervatten") {
    if (lm.status !== "gepauzeerd" || lm.pauzeSinds === null) throw AppError.conflict("Dit lidmaatschap is niet gepauzeerd.");
    const dagen = Math.max(0, dagenTussen(lm.pauzeSinds, vandaag));
    return { ...lm, status: "actief", pauzeSinds: null, einddatum: lm.einddatum === null ? null : plusDagen(lm.einddatum, dagen) };
  }
  if (a.actie === "beeindigen") {
    const reden = schoneTekst(a.reden, 200);
    if (reden.length < 2) throw AppError.validation("Geef een reden voor het einde van het lidmaatschap (bijvoorbeeld: verhuisd).");
    if (teLang(a.reden, 200)) throw AppError.validation("De reden is te lang (hoogstens 200 tekens).");
    const dag = a.datum === undefined || a.datum === null || a.datum === "" ? vandaag : a.datum;
    if (!isDag(dag)) throw AppError.validation("De einddatum klopt niet. Kies een bestaande datum.");
    if (dag > vandaag) throw AppError.validation("Een lidmaatschap beëindig je op de dag zelf of achteraf, niet vooruit.");
    if (dag < lm.startdatum) throw AppError.validation("De einddatum kan niet vóór de startdatum liggen.");
    return { ...lm, status: "beeindigd", pauzeSinds: null, einddatum: dag, eindReden: reden };
  }
  throw AppError.validation("Onbekende actie.");
}

// --- overzicht en cijfers ----------------------------------------------------------

/** De status van een lid: actief als minstens één lidmaatschap loopt, anders gepauzeerd, anders beëindigd; zonder lidmaatschap "zonder". */
export type LidStatus = "actief" | "gepauzeerd" | "beeindigd" | "zonder";

export function lidStatus(lms: Lidmaatschap[], vandaag: string): LidStatus {
  if (lms.length === 0) return "zonder";
  const s = lms.map((l) => effectieveStatus(l, vandaag));
  if (s.includes("actief")) return "actief";
  if (s.includes("gepauzeerd")) return "gepauzeerd";
  return "beeindigd";
}

/** Loopt dit lidmaatschap af binnen 30 dagen (vandaag en de einddatum zelf tellen mee)? Alleen een lopend lidmaatschap. */
export function looptAf(lm: Lidmaatschap, vandaag: string): boolean {
  if (effectieveStatus(lm, vandaag) !== "actief" || lm.einddatum === null) return false;
  const d = dagenTussen(vandaag, lm.einddatum);
  return d >= 0 && d <= LOOPT_AF_DAGEN;
}

/** Een lopende strippenkaart met hoogstens 2 bezoeken over (ook 0: dan is hij net op). */
export function stripBijnaOp(lm: Lidmaatschap, vandaag: string): boolean {
  const t = tegoed(lm);
  if (t === null || lm.status !== "actief") return false;
  if (lm.einddatum !== null && lm.einddatum < vandaag) return false;
  return t <= BIJNA_OP_GRENS;
}

export type LedenFilter = "alle" | "actief" | "gepauzeerd" | "beeindigd" | "loopt-af" | "bijna-op";

/** Groepeert de lidmaatschappen per lid. */
export function perLid(lms: Lidmaatschap[]): Map<string, Lidmaatschap[]> {
  const kaart = new Map<string, Lidmaatschap[]>();
  for (const l of lms) kaart.set(l.lidId, [...(kaart.get(l.lidId) ?? []), l]);
  return kaart;
}

/** Zoeken (nummer, naam, telefoon, e-mail) en filteren; gesorteerd op naam, gewiste leden onderaan op nummer. */
export function filterLeden(leden: Lid[], lms: Lidmaatschap[], opties: { zoek?: string; filter?: LedenFilter }, vandaag: string): Lid[] {
  const groepen = perLid(lms);
  const q = (opties.zoek ?? "").trim().toLowerCase();
  const filter = opties.filter ?? "alle";
  return leden
    .filter((l) => {
      const eigen = groepen.get(l.id) ?? [];
      if (q && ![l.nummer, l.naam, l.telefoon, l.email].some((t) => t.toLowerCase().includes(q))) return false;
      switch (filter) {
        case "actief":
        case "gepauzeerd":
        case "beeindigd":
          return lidStatus(eigen, vandaag) === filter;
        case "loopt-af":
          return eigen.some((x) => looptAf(x, vandaag));
        case "bijna-op":
          return eigen.some((x) => stripBijnaOp(x, vandaag));
        default:
          return true;
      }
    })
    .sort((a, b) => Number(a.gewist) - Number(b.gewist) || a.naam.localeCompare(b.naam, "nl") || a.nummer.localeCompare(b.nummer));
}

export interface Aandacht {
  lidId: string;
  lidmaatschapId: string;
  soort: "loopt-af" | "bijna-op";
  tekst: string;
}

/** Wat aandacht vraagt: lidmaatschappen die binnen 30 dagen aflopen en strippenkaarten die bijna op zijn, het eerst-urgente bovenaan. */
export function aandachtLijst(leden: Lid[], lms: Lidmaatschap[], vandaag: string): Aandacht[] {
  const lid = new Map(leden.map((l) => [l.id, l]));
  const uit: { a: Aandacht; volgorde: number }[] = [];
  for (const lm of lms) {
    const l = lid.get(lm.lidId);
    if (!l || l.gewist) continue;
    const wie = `${l.naam} (${l.nummer})`;
    if (stripBijnaOp(lm, vandaag)) {
      const t = tegoed(lm) ?? 0;
      uit.push({ a: { lidId: lm.lidId, lidmaatschapId: lm.id, soort: "bijna-op", tekst: `${wie}: ${lm.vormNaam}, ${t === 0 ? "geen bezoek meer over" : t === 1 ? "nog 1 bezoek over" : `nog ${t} bezoeken over`}` }, volgorde: t });
    }
    if (looptAf(lm, vandaag) && lm.einddatum !== null) {
      const d = dagenTussen(vandaag, lm.einddatum);
      uit.push({ a: { lidId: lm.lidId, lidmaatschapId: lm.id, soort: "loopt-af", tekst: `${wie}: ${lm.vormNaam} loopt ${d === 0 ? "vandaag" : `over ${d} ${d === 1 ? "dag" : "dagen"}`} af (${nlDag(lm.einddatum)})` }, volgorde: d });
    }
  }
  return uit.sort((x, y) => x.volgorde - y.volgorde || x.a.tekst.localeCompare(y.a.tekst, "nl")).map((x) => x.a);
}

/**
 * De omrekening naar een bedrag per maand, vastgelegd: een maand telt voor 1; een week voor 52/12 (een jaar heeft 52 weken
 * en 12 maanden, dus 4,333... week per maand); een jaar voor 1/12. Een strippenkaart telt niet mee (geen terugkerende omzet).
 * Het resultaat is niet afgerond (centen met breuk); afronden gebeurt één keer over de som.
 */
export function perMaandCent(soort: Soort, prijsCent: number): number {
  if (soort === "week") return (prijsCent * 52) / 12;
  if (soort === "jaar") return prijsCent / 12;
  if (soort === "maand") return prijsCent;
  return 0;
}

/** De verwachte terugkerende omzet per maand in centen (incl. btw), uit de lopende abonnementen. Een schatting, geen boekhouding. */
export function omzetPerMaandCent(lms: Lidmaatschap[], vandaag: string): number {
  const som = lms.filter((l) => isLooptijd(l.soort) && effectieveStatus(l, vandaag) === "actief").reduce((s, l) => s + perMaandCent(l.soort, l.prijsCent), 0);
  return Math.round(som);
}

export interface Cijfers {
  actieveLeden: number;
  gepauzeerdeLeden: number;
  omzetPerMaandCent: number;
  looptAf: number;
  stripBijnaOp: number;
}

export function berekenCijfers(leden: Lid[], lms: Lidmaatschap[], vandaag: string): Cijfers {
  const groepen = perLid(lms);
  const statussen = leden.map((l) => lidStatus(groepen.get(l.id) ?? [], vandaag));
  return {
    actieveLeden: statussen.filter((s) => s === "actief").length,
    gepauzeerdeLeden: statussen.filter((s) => s === "gepauzeerd").length,
    omzetPerMaandCent: omzetPerMaandCent(lms, vandaag),
    looptAf: lms.filter((l) => looptAf(l, vandaag)).length,
    stripBijnaOp: lms.filter((l) => stripBijnaOp(l, vandaag)).length,
  };
}

// --- bewaartermijn -------------------------------------------------------------------

/**
 * Welke leden zijn aan het wissen toe: nog niet gewist, geen lopend of gepauzeerd lidmaatschap, en sinds meer dan twee
 * jaar niets meer gebeurd (de laatste einddatum, het laatste bezoek, of bij een lid zonder lidmaatschap de dag van
 * aanmaken). Precies twee jaar geleden is nog niet "ouder dan". Alleen de ids; wissen doet de opslag.
 */
export function teWissenLeden(leden: Lid[], lms: Lidmaatschap[], vandaag: string): string[] {
  const grens = plusMaanden(vandaag, -12 * BEWAAR_JAREN);
  const groepen = perLid(lms);
  return leden
    .filter((l) => {
      if (l.gewist) return false;
      const eigen = groepen.get(l.id) ?? [];
      if (eigen.some((x) => ["actief", "gepauzeerd"].includes(effectieveStatus(x, vandaag)))) return false;
      const dagen = [amsterdamDayKey(l.gemaaktOp), ...(l.laatstGezien ? [amsterdamDayKey(l.laatstGezien)] : []), ...eigen.flatMap((x) => (x.einddatum ? [x.einddatum] : []))];
      return dagen.reduce((a, b) => (a > b ? a : b)) < grens;
    })
    .map((l) => l.id);
}

// --- weergave --------------------------------------------------------------------------

/** "29 feb 2028" uit "2028-02-29" (zonder tijdzone te raken). */
export function nlDag(dag: string): string {
  const m = DAG.exec(dag);
  if (!m) return dag;
  const maanden = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  return `${Number(m[3])} ${maanden[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

/** Een bedrag in centen als "€ 12,50" (zonder Intl: dezelfde tekst op server en telefoon). */
export function euroTekst(cent: number): string {
  const hele = Math.floor(Math.abs(cent) / 100);
  const rest = String(Math.abs(cent) % 100).padStart(2, "0");
  return `${cent < 0 ? "-" : ""}€ ${String(hele).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${rest}`;
}
