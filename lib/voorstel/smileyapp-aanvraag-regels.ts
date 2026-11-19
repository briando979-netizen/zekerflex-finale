import { amsterdamParts } from "@/lib/time/amsterdam";
import { INTERESSES, pakket, type PakketId } from "@/lib/voorstel/smileyapp";
import { geldigEmail } from "@/lib/voorstel/smileyapp-account-regels";
import { isTaal, type Taal } from "@/lib/voorstel/smileyapp-taal";

// ---------------------------------------------------------------------------
// Demo-aanvragen en partner-aanmeldingen van het SmileyApp-voorstel (19 nov
// 2026): wat een aanvraag mag bevatten, welk moment iemand kan kiezen voor een
// belafspraak en hoe lang een aanvraag blijft staan. Puur (geen kv of zod), dus
// los te testen en ook bruikbaar in het formulier en het beheer. Het moment is
// een voorkeur, geen bevestigde afspraak. Een vaste afspraak ontstaat alleen als
// de aanvrager een open tijd uit de agenda kiest (deel 6a,
// lib/voorstel/smileyapp-agenda-regels.ts); die staat dan in `afspraak`.
// ---------------------------------------------------------------------------

export type Soort = "demo" | "partner";
export const SOORTEN = ["demo", "partner"] as const;

// De opvolglijst (deel 6a): van nieuw naar klant of afgevallen. "afspraak" heet op het scherm "Demo gepland"; de
// sleutel bleef, zodat aanvragen van vóór deel 6a hun status houden. Het team mag elke status kiezen (ook terug).
export const STATUSSEN = ["nieuw", "gebeld", "afspraak", "gehad", "klant", "afgevallen"] as const;
export type Status = (typeof STATUSSEN)[number];
export const STATUS_LABEL: Record<Status, string> = { nieuw: "Nieuw", gebeld: "Gebeld", afspraak: "Demo gepland", gehad: "Demo gehad", klant: "Klant", afgevallen: "Afgevallen" };
export const isStatus = (s: unknown): s is Status => typeof s === "string" && (STATUSSEN as readonly string[]).includes(s);

/** Een aanvraag waarbij een tijd uit de agenda is geboekt, begint op "Demo gepland". */
export const STATUS_NA_BOEKEN: Status = "afspraak";

/**
 * Het team annuleert de geboekte tijd. Stond de aanvraag op "Demo gepland", dan gaat hij terug naar "Nieuw": er
 * moet weer iemand contact opnemen. Een status die het team daarna zelf koos (gehad, klant, afgevallen) blijft.
 */
export const statusNaAnnuleren = (status: Status): Status => (status === "afspraak" ? "nieuw" : status);

// ---- notities van het team ---------------------------------------------------

export const NOTITIE_TEKST_MAX = 1000;
export const NOTITIES_MAX = 30;

export interface Notitie {
  id: string;
  tekst: string;
  /** de naam van het teamlid dat de notitie schreef */
  door: string;
  op: string;
}

export const isNotitieId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{12}$/.test(id);

export type NotitieUitkomst = { ok: true; waarde: Notitie[] } | { ok: false; fout: string };

/** Voegt een notitie toe achteraan (de oudste eerst). Leeg, te lang of al dertig notities: een fout, niets veranderd. */
export function metNotitie(bestaand: readonly Notitie[], n: { id: string; tekst: string; door: string; op: string }): NotitieUitkomst {
  const tekst = n.tekst.replace(/\r\n?/g, "\n").trim();
  if (!tekst) return { ok: false, fout: "Typ eerst een notitie." };
  if (tekst.length > NOTITIE_TEKST_MAX) return { ok: false, fout: `Een notitie is hooguit ${NOTITIE_TEKST_MAX} tekens.` };
  if (bestaand.length >= NOTITIES_MAX) return { ok: false, fout: `Er staan al ${NOTITIES_MAX} notities bij deze aanvraag. Verwijder eerst een oude notitie.` };
  return { ok: true, waarde: [...bestaand, { id: n.id, tekst, door: n.door, op: n.op }] };
}

export interface Voorkeur {
  /** JJJJ-MM-DD, een Nederlandse kalenderdag */
  dag: string;
  /** HH:MM, Nederlandse tijd */
  tijd: string;
}

export interface Afspraak {
  tijd: string;
  start: string;
}

/** Het id van een tijd in de agenda: het begin in UTC als JJJJMMDDUUMM (lib/voorstel/smileyapp-agenda-regels.ts). */
export const isTijdId = (id: unknown): id is string => typeof id === "string" && /^\d{12}$/.test(id);

export interface Aanvraag {
  id: string;
  soort: Soort;
  naam: string;
  bedrijf: string;
  email: string;
  telefoon?: string;
  pakket?: PakketId;
  interesses?: string[];
  voorkeur?: Voorkeur;
  bericht?: string;
  /** waar de aanvraag vandaan kwam (?bron=beurs op de QR-code): een kort woord, alleen voor het team */
  bron?: string;
  /** de taal van het formulier (nl, en of de): in die taal wil iemand geholpen worden. Ontbreekt bij aanvragen van vóór de vertaling. */
  taal?: Taal;
  status: Status;
  /** de ene notitie van vóór deel 6a; nieuwe notities staan in `notities` */
  notitie?: string;
  /** notities van het team, de oudste eerst (hooguit NOTITIES_MAX) */
  notities?: Notitie[];
  /** de tijd uit de agenda die de aanvrager koos: `tijd` is het id van die tijd, `start` het begin (UTC) */
  afspraak?: Afspraak;
  behandeldDoor?: string;
  aangemaakt: string;
  gewijzigd: string;
}

/** Wat het formulier instuurt (alles nog ongecontroleerd). */
export interface AanvraagInvoer {
  soort: string;
  naam: string;
  bedrijf: string;
  email: string;
  telefoon?: string | undefined;
  pakket?: string | undefined;
  interesses?: readonly string[] | undefined;
  dag?: string | undefined;
  tijd?: string | undefined;
  /** demo: de tijd uit de agenda die iemand koos; dan vervalt het voorkeursmoment */
  tijdId?: string | undefined;
  bericht?: string | undefined;
  bron?: string | undefined;
  taal?: string | undefined;
  toestemming: boolean;
}

export type NieuweAanvraag = Omit<Aanvraag, "id" | "status" | "aangemaakt" | "gewijzigd">;

// ---- het voorkeursmoment ---------------------------------------------------

/** Doordeweeks van 09:00 tot 17:00, in halve uren: het laatste belmoment begint om 16:30. */
export const TIJDEN: readonly string[] = Array.from({ length: 16 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`);
export const DAGEN_VOORUIT = 42;

/** De kalenderdag `n` dagen na de Nederlandse dag van `nu`, als JJJJ-MM-DD. */
function dagNa(nu: Date, n: number): Date {
  const p = amsterdamParts(nu);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + n));
}

/** De dagen die iemand kan kiezen: werkdagen vanaf morgen tot en met zes weken vooruit (Nederlandse dagen). */
export function voorkeurDagen(nu: Date): string[] {
  const uit: string[] = [];
  for (let n = 1; n <= DAGEN_VOORUIT; n += 1) {
    const d = dagNa(nu, n);
    const weekdag = d.getUTCDay();
    if (weekdag !== 0 && weekdag !== 6) uit.push(d.toISOString().slice(0, 10));
  }
  return uit;
}

export function isVoorkeurDag(iso: string, nu: Date): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && voorkeurDagen(nu).includes(iso);
}

export const isVoorkeurTijd = (tijd: string) => TIJDEN.includes(tijd);

const WEEKDAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** "maandag 23 november": een vaste dag zonder tijd, dus de tijdzone van server of telefoon speelt geen rol. */
export function dagTekst(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAGEN[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MAANDEN[d.getUTCMonth()] ?? ""}`;
}

export const voorkeurTekst = (v: Voorkeur) => `${dagTekst(v.dag)} om ${v.tijd} uur`;

// ---- controle van een nieuwe aanvraag ----------------------------------------

export const BERICHT_MAX = 2000;
export const NOTITIE_MAX = 2000;
export const BRON_MAX = 30;

/** Een bron is een kort woord: alleen letters, cijfers en streepjes, hooguit 30 tekens. Anders: geen bron. */
export function leesBron(ruw: unknown): string | undefined {
  if (typeof ruw !== "string") return undefined;
  const b = ruw.trim().toLowerCase();
  return b.length <= BRON_MAX && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b) ? b : undefined;
}

const TELEFOON = /^\+?[0-9][0-9 ()\-.]{5,24}$/;

/** "tel:+31612345678": alleen cijfers en een plus, voor de bel-link in het beheer. */
export const telLink = (telefoon: string) => `tel:${telefoon.replace(/[^\d+]/g, "")}`;

/** `tijdId`: de gekozen tijd uit de agenda; de route boekt die (of weigert als een ander net eerder was). */
export type Controle = { ok: true; waarde: NieuweAanvraag; tijdId?: string } | { ok: false; veld: string; fout: string };

/** De melding als de gekozen tijd niet (meer) vrij is; ook het antwoord van de route als een ander net eerder was. */
export const TIJD_BEZET = "Deze tijd is niet meer vrij. Kies een andere tijd uit de lijst.";

export function valideerAanvraag(i: AanvraagInvoer, nu: Date): Controle {
  const fout = (veld: string, tekst: string): Controle => ({ ok: false, veld, fout: tekst });
  if (i.soort !== "demo" && i.soort !== "partner") return fout("soort", "Onbekend formulier.");
  const naam = i.naam.trim();
  const bedrijf = i.bedrijf.trim();
  const email = i.email.trim().toLowerCase();
  const telefoon = (i.telefoon ?? "").trim();
  const bericht = (i.bericht ?? "").trim();
  if (naam.length < 2 || naam.length > 80) return fout("naam", "Vul je naam in.");
  if (bedrijf.length < 2 || bedrijf.length > 120) return fout("bedrijf", "Vul de naam van je bedrijf of organisatie in.");
  if (!geldigEmail(email)) return fout("email", "Vul een geldig e-mailadres in.");
  if (telefoon && !TELEFOON.test(telefoon)) return fout("telefoon", "Dit telefoonnummer klopt niet. Gebruik alleen cijfers, spaties en eventueel een plus.");
  if (bericht.length > BERICHT_MAX) return fout("bericht", `Je bericht is te lang (maximaal ${BERICHT_MAX} tekens).`);
  if (i.toestemming !== true) return fout("toestemming", "Vink aan dat SmileyApp contact met je mag opnemen over deze aanvraag.");
  // de taal van het formulier: alleen nl, en of de. Een formulier zonder taal (een oude pagina) blijft geldig.
  if (i.taal !== undefined && !isTaal(i.taal)) return fout("taal", "Onbekende taal.");

  // een bron die niet klopt (een verminkte link) houdt de aanvraag niet tegen: hij valt gewoon weg
  const bron = leesBron(i.bron);
  const basis: NieuweAanvraag = { soort: i.soort, naam, bedrijf, email, ...(telefoon ? { telefoon } : {}), ...(bericht ? { bericht } : {}), ...(bron ? { bron } : {}), ...(i.taal ? { taal: i.taal } : {}) };

  if (i.soort === "partner") {
    const gekozen = [...new Set(i.interesses ?? [])];
    if (gekozen.some((x) => !(INTERESSES as readonly string[]).includes(x))) return fout("interesses", "Kies uit de lijst.");
    return { ok: true, waarde: { ...basis, ...(gekozen.length ? { interesses: gekozen } : {}) } };
  }

  const p = i.pakket ? pakket(i.pakket) : undefined;
  if (i.pakket && !p) return fout("pakket", "Kies een pakket uit de lijst.");
  // een tijd uit de agenda gaat voor het voorkeursmoment: de afspraak staat dan vast, dus dag en tijd tellen niet meer
  const tijdId = (i.tijdId ?? "").trim();
  if (tijdId) {
    if (!isTijdId(tijdId)) return fout("tijdId", TIJD_BEZET);
    if (!telefoon) return fout("telefoon", "Vul je telefoonnummer in, dan kunnen we je bereiken als er iets verandert.");
    return { ok: true, waarde: { ...basis, ...(p ? { pakket: p.id } : {}) }, tijdId };
  }
  const dag = (i.dag ?? "").trim();
  const tijd = (i.tijd ?? "").trim();
  if (!dag && !tijd) return { ok: true, waarde: { ...basis, ...(p ? { pakket: p.id } : {}) } };
  if (!dag) return fout("dag", "Kies ook een dag, of laat de tijd leeg.");
  if (!tijd) return fout("tijd", "Kies ook een tijd, of laat de dag leeg.");
  if (!isVoorkeurDag(dag, nu)) return fout("dag", "Kies een werkdag vanaf morgen, hooguit zes weken vooruit.");
  if (!isVoorkeurTijd(tijd)) return fout("tijd", "Kies een tijd tussen 09:00 en 17:00 uur.");
  if (!telefoon) return fout("telefoon", "Vul je telefoonnummer in, dan kunnen we je op dat moment bellen.");
  return { ok: true, waarde: { ...basis, ...(p ? { pakket: p.id } : {}), voorkeur: { dag, tijd } } };
}

// ---- bewaren -------------------------------------------------------------------

/** Een aanvraag vervalt twaalf maanden na de laatste wijziging (AVG: niet langer dan nodig). */
export const BEWAAR_MAANDEN = 12;

export function aanvraagVerlopen(gewijzigd: string, nu: Date): boolean {
  const d = new Date(gewijzigd);
  if (Number.isNaN(d.getTime())) return true;
  const eind = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + BEWAAR_MAANDEN, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  return eind <= nu.getTime();
}

export const isAanvraagId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{16}$/.test(id);
