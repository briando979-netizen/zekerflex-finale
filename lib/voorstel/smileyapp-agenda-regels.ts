import { amsterdamClock, amsterdamDayKey, parseAmsterdamLocal } from "@/lib/time/amsterdam";
import { dagTekst, isTijdId } from "@/lib/voorstel/smileyapp-aanvraag-regels";

// ---------------------------------------------------------------------------
// De agenda voor demo-afspraken van het SmileyApp-voorstel (deel 6a): het team
// zet tijden open (datum en begintijd in Nederlandse tijd, vaste duur), een
// aanvrager kiest er een. Puur (geen kv of zod), dus los te testen en ook
// bruikbaar in het beheer. Een tijd wordt bewaard als een moment in UTC; alles
// wat een mens leest is Nederlandse tijd, via lib/time/amsterdam.ts. Het
// agendabestand (.ics) heeft tijden in UTC met Z, zodat elke agenda het goed zet.
// ---------------------------------------------------------------------------

export const DEMO_MINUTEN = 30;
export const OPEN_TIJDEN_MAX = 200;
/** Een tijd die binnen een uur begint, is niet meer te kiezen: het team moet het nog kunnen zien. */
export const BOEK_MINUTEN_VOORAF = 60;
/** Verder dan een jaar vooruit is een tikfout. */
export const AGENDA_DAGEN_VOORUIT = 366;
/** Een geboekte tijd blijft na afloop nog dertig dagen in de agenda staan, daarna ruimt de lijst hem op. */
export const AGENDA_BEWAAR_DAGEN = 30;

export interface Tijd {
  /** het begin in UTC als JJJJMMDDUUMM; ook de sleutel in de opslag, dus één tijd per begin */
  id: string;
  /** het begin, ISO in UTC */
  start: string;
  status: "open" | "geboekt";
  /** wie van het team de tijd openzette */
  door: string;
  aangemaakt: string;
  /** het id van de aanvraag die de tijd boekte */
  aanvraag?: string;
  geboektOp?: string;
}

/** Wat de site van een open tijd krijgt: alleen het id en het begin. Geen namen, ook niet van het team. */
export interface OpenTijd {
  id: string;
  start: string;
}

export const tijdId = (start: Date) => start.toISOString().replace(/[-:T]/g, "").slice(0, 12);

/** Het begin dat bij een id hoort, of null als het id geen echt moment is. */
export function startVanId(id: string): Date | null {
  if (!isTijdId(id)) return null;
  const d = new Date(`${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(8, 10)}:${id.slice(10, 12)}:00Z`);
  return Number.isNaN(d.getTime()) || tijdId(d) !== id ? null : d;
}

export const eindVan = (start: Date) => new Date(start.getTime() + DEMO_MINUTEN * 60_000);

export type MomentUitkomst = { ok: true; start: Date } | { ok: false; veld: "datum" | "tijd"; fout: string };

/**
 * Leest een datum (JJJJ-MM-DD) en begintijd (UU:MM) als Nederlandse tijd. Geweigerd: een datum of tijd die niet
 * bestaat (ook het uur dat bij het ingaan van de zomertijd wordt overgeslagen), een tijd die niet op vijf minuten
 * valt, het verleden en meer dan een jaar vooruit.
 */
export function leesMoment(datum: string, tijd: string, nu: Date): MomentUitkomst {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return { ok: false, veld: "datum", fout: "Kies een datum." };
  if (!/^\d{2}:\d{2}$/.test(tijd)) return { ok: false, veld: "tijd", fout: "Kies een begintijd." };
  const start = parseAmsterdamLocal(`${datum}T${tijd}`);
  // heen en terug: 31 februari of 02:30 op de dag dat de klok vooruit gaat komt anders terug en bestaat dus niet
  if (Number.isNaN(start.getTime()) || amsterdamDayKey(start) !== datum) return { ok: false, veld: "datum", fout: "Deze datum bestaat niet." };
  if (amsterdamClock(start) !== tijd) return { ok: false, veld: "tijd", fout: "Deze tijd bestaat niet op deze dag (de klok gaat dan een uur vooruit)." };
  if (Number(tijd.slice(3)) % 5 !== 0) return { ok: false, veld: "tijd", fout: "Kies een begintijd op vijf minuten, zoals 10:00 of 10:15." };
  if (start.getTime() <= nu.getTime()) return { ok: false, veld: "tijd", fout: "Deze tijd is al voorbij. Kies een tijd in de toekomst." };
  if (start.getTime() > nu.getTime() + AGENDA_DAGEN_VOORUIT * 86_400_000) return { ok: false, veld: "datum", fout: "Kies een datum binnen een jaar." };
  return { ok: true, start };
}

/** Overlapt een nieuwe tijd met een bestaande? Elke demo duurt even lang, dus: minder dan die duur uit elkaar. */
export function overlapt(start: Date, bestaand: readonly Pick<Tijd, "start">[]): boolean {
  return bestaand.some((t) => Math.abs(new Date(t.start).getTime() - start.getTime()) < DEMO_MINUTEN * 60_000);
}

/** Mag het team deze tijd openzetten? Geeft de melding, of null als het mag. */
export function openzetFout(start: Date, bestaand: readonly Tijd[], nu: Date): string | null {
  const straks = bestaand.filter((t) => new Date(t.start).getTime() > nu.getTime());
  if (straks.filter((t) => t.status === "open").length >= OPEN_TIJDEN_MAX) return `Er staan al ${OPEN_TIJDEN_MAX} tijden open. Haal eerst een tijd weg.`;
  if (bestaand.some((t) => t.id === tijdId(start))) return "Deze tijd staat al in de agenda.";
  if (overlapt(start, bestaand)) return `Deze tijd overlapt met een andere tijd in de agenda (een demo duurt ${DEMO_MINUTEN} minuten).`;
  return null;
}

/** Is deze tijd nu te boeken? Alleen een open tijd die niet binnen het uur begint. */
export function isBoekbaar(t: Pick<Tijd, "start" | "status">, nu: Date): boolean {
  return t.status === "open" && new Date(t.start).getTime() >= nu.getTime() + BOEK_MINUTEN_VOORAF * 60_000;
}

/** De tijden die de site toont, de vroegste eerst, zonder namen. */
export function openVoorSite(tijden: readonly Tijd[], nu: Date): OpenTijd[] {
  return tijden
    .filter((t) => isBoekbaar(t, nu))
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((t) => ({ id: t.id, start: t.start }));
}

/** Moet de lijst deze tijd opruimen? Een open tijd zodra hij voorbij is, een geboekte dertig dagen na afloop. */
export function tijdVerlopen(t: Pick<Tijd, "start" | "status">, nu: Date): boolean {
  const start = new Date(t.start).getTime();
  if (Number.isNaN(start)) return true;
  return t.status === "open" ? start <= nu.getTime() : start + AGENDA_BEWAAR_DAGEN * 86_400_000 <= nu.getTime();
}

/** De Nederlandse dag (JJJJ-MM-DD) en kloktijd (UU:MM) van een begin: in de zomer en de winter het goede uur. */
export const dagEnTijd = (start: string | Date) => ({ dag: amsterdamDayKey(start), tijd: amsterdamClock(start) });

/** "maandag 23 november om 10:00 uur", in Nederlandse tijd. */
export function afspraakTekst(start: string | Date): string {
  const { dag, tijd } = dagEnTijd(start);
  return `${dagTekst(dag)} om ${tijd} uur`;
}

// ---- het agendabestand (.ics) ---------------------------------------------------

const icsTijd = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const icsTekst = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/([;,])/g, "\\$1");
/** Een regel van hooguit 75 bytes; langer gaat verder op een volgende regel die met een spatie begint (RFC 5545). */
function vouw(regel: string): string {
  const stukken: string[] = [];
  let rest = regel;
  while (rest.length > 60) {
    stukken.push(rest.slice(0, 60));
    rest = rest.slice(60);
  }
  stukken.push(rest);
  return stukken.join("\r\n ");
}

/**
 * De afspraak als agendabestand: begin en eind in UTC met Z (nooit een lokale tijd zonder zone), regels gescheiden
 * door CRLF. `uid` blijft gelijk voor dezelfde afspraak, zodat een agenda hem niet dubbel zet.
 */
export function afspraakIcs(o: { uid: string; start: string | Date; nu: Date; titel: string; omschrijving?: string }): string {
  const start = new Date(o.start);
  const regels = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZekerFlex//SmileyApp demo//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsTekst(o.uid)}`,
    `DTSTAMP:${icsTijd(o.nu)}`,
    `DTSTART:${icsTijd(start)}`,
    `DTEND:${icsTijd(eindVan(start))}`,
    `SUMMARY:${icsTekst(o.titel)}`,
    ...(o.omschrijving ? [`DESCRIPTION:${icsTekst(o.omschrijving)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${regels.map(vouw).join("\r\n")}\r\n`;
}
