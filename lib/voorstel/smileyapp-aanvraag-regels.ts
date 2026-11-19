import { amsterdamParts } from "@/lib/time/amsterdam";
import { INTERESSES, pakket, type PakketId } from "@/lib/voorstel/smileyapp";
import { geldigEmail } from "@/lib/voorstel/smileyapp-account-regels";

// ---------------------------------------------------------------------------
// Demo-aanvragen en partner-aanmeldingen van het SmileyApp-voorstel (19 nov
// 2026): wat een aanvraag mag bevatten, welk moment iemand kan kiezen voor een
// belafspraak en hoe lang een aanvraag blijft staan. Puur (geen kv of zod), dus
// los te testen en ook bruikbaar in het formulier en het beheer. Het moment is
// een voorkeur, geen bevestigde afspraak: er wordt niets in een agenda gezet.
// ---------------------------------------------------------------------------

export type Soort = "demo" | "partner";
export const SOORTEN = ["demo", "partner"] as const;

export const STATUSSEN = ["nieuw", "gebeld", "afspraak", "klant", "afgevallen"] as const;
export type Status = (typeof STATUSSEN)[number];
export const STATUS_LABEL: Record<Status, string> = { nieuw: "Nieuw", gebeld: "Gebeld", afspraak: "Afspraak gemaakt", klant: "Klant geworden", afgevallen: "Afgevallen" };
export const isStatus = (s: unknown): s is Status => typeof s === "string" && (STATUSSEN as readonly string[]).includes(s);

export interface Voorkeur {
  /** JJJJ-MM-DD, een Nederlandse kalenderdag */
  dag: string;
  /** HH:MM, Nederlandse tijd */
  tijd: string;
}

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
  status: Status;
  notitie?: string;
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
  bericht?: string | undefined;
  bron?: string | undefined;
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

export type Controle = { ok: true; waarde: NieuweAanvraag } | { ok: false; veld: string; fout: string };

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

  // een bron die niet klopt (een verminkte link) houdt de aanvraag niet tegen: hij valt gewoon weg
  const bron = leesBron(i.bron);
  const basis: NieuweAanvraag = { soort: i.soort, naam, bedrijf, email, ...(telefoon ? { telefoon } : {}), ...(bericht ? { bericht } : {}), ...(bron ? { bron } : {}) };

  if (i.soort === "partner") {
    const gekozen = [...new Set(i.interesses ?? [])];
    if (gekozen.some((x) => !(INTERESSES as readonly string[]).includes(x))) return fout("interesses", "Kies uit de lijst.");
    return { ok: true, waarde: { ...basis, ...(gekozen.length ? { interesses: gekozen } : {}) } };
  }

  const p = i.pakket ? pakket(i.pakket) : undefined;
  if (i.pakket && !p) return fout("pakket", "Kies een pakket uit de lijst.");
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
