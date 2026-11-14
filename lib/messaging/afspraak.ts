import { parseAmsterdamLocal } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Een afspraak in de chat met aanmelden, zoals een evenement in WhatsApp (14 nov 2026): titel, begin, duur en plek;
// iedereen in het gesprek antwoordt "ik kom", "misschien" of "ik kan niet", zichtbaar met naam. Puur (geen kv of
// prisma): de server en de browser rekenen met dezelfde regels. Tijden staan in UTC; ingevuld wordt in Nederlandse tijd
// (parseAmsterdamLocal, AGENTS.md), en een .ics krijgt UTC met Z.
// ---------------------------------------------------------------------------

export type Antwoord = "ja" | "misschien" | "nee";
export const ANTWOORDEN: readonly Antwoord[] = ["ja", "misschien", "nee"];

export interface MessageAfspraak {
  /** begin en eind, ISO in UTC */
  start: string;
  eind: string;
  plek?: string;
  /** userId → antwoord */
  antwoorden: Record<string, Antwoord>;
  /** door de maker afgezegd: wanneer; daarna geen antwoorden meer */
  geannuleerd?: string;
}

export const AFSPRAAK_TITEL_MAX = 120;
export const AFSPRAAK_PLEK_MAX = 160;
const DUUR_MIN = 15;
const DUUR_MAX = 24 * 60;

const schoon = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Een nieuwe afspraak uit wat iemand invulde. `beginLokaal` is een datetime-local-waarde ("2026-11-15T14:00") in
 * Nederlandse tijd. Null als de titel leeg is, de tijd niet te lezen is, of het begin meer dan een dag voorbij is of
 * meer dan een jaar vooruit ligt.
 */
export function maakAfspraak(
  titel: string,
  beginLokaal: string,
  duurMinuten: number,
  plek: string | undefined,
  nu = new Date(),
): { titel: string; afspraak: MessageAfspraak } | null {
  const t = schoon(titel, AFSPRAAK_TITEL_MAX);
  if (!t || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(beginLokaal)) return null;
  const begin = parseAmsterdamLocal(beginLokaal);
  if (Number.isNaN(begin.getTime())) return null;
  if (begin.getTime() < nu.getTime() - 86_400_000 || begin.getTime() > nu.getTime() + 366 * 86_400_000) return null;
  const duur = Math.min(DUUR_MAX, Math.max(DUUR_MIN, Math.round(Number.isFinite(duurMinuten) ? duurMinuten : 60)));
  const p = plek ? schoon(plek, AFSPRAAK_PLEK_MAX) : "";
  return {
    titel: t,
    afspraak: { start: begin.toISOString(), eind: new Date(begin.getTime() + duur * 60_000).toISOString(), ...(p ? { plek: p } : {}), antwoorden: {} },
  };
}

/** Het antwoord van één persoon zetten (null = intrekken). Een afgezegde afspraak verandert niet. */
export function zetAntwoord(a: MessageAfspraak, userId: string, antwoord: Antwoord | null): MessageAfspraak {
  if (a.geannuleerd) return a;
  const antwoorden = { ...a.antwoorden };
  if (antwoord) antwoorden[userId] = antwoord;
  else delete antwoorden[userId];
  return { ...a, antwoorden };
}

export function annuleerAfspraak(a: MessageAfspraak, nu = new Date()): MessageAfspraak {
  return a.geannuleerd ? a : { ...a, geannuleerd: nu.toISOString() };
}

/** Wie wat antwoordde, per antwoord. */
export function perAntwoord(a: MessageAfspraak): Record<Antwoord, string[]> {
  const uit: Record<Antwoord, string[]> = { ja: [], misschien: [], nee: [] };
  for (const [uid, ant] of Object.entries(a.antwoorden)) if (ANTWOORDEN.includes(ant)) uit[ant].push(uid);
  return uit;
}

const icsTijd = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const icsTekst = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** De afspraak als .ics (iCalendar), met tijden in UTC en Z (AGENTS.md). */
export function alsIcs(titel: string, a: MessageAfspraak, uid: string, nu = new Date()): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZekerFlex//Chat//NL",
    "BEGIN:VEVENT",
    `UID:${uid}@zekerflex.com`,
    `DTSTAMP:${icsTijd(nu.toISOString())}`,
    `DTSTART:${icsTijd(a.start)}`,
    `DTEND:${icsTijd(a.eind)}`,
    `SUMMARY:${icsTekst(titel)}`,
    ...(a.plek ? [`LOCATION:${icsTekst(a.plek)}`] : []),
    ...(a.geannuleerd ? ["STATUS:CANCELLED"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
