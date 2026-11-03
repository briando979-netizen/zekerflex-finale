import { amsterdamToUtc } from "@/lib/time/amsterdam";
import { CONTACT } from "@/lib/voorstel/schwarzwald";

// ---------------------------------------------------------------------------
// Agendabestand (.ics) voor één reservering: iPhone/Apple Agenda, Outlook en
// elke andere agenda-app. Puur, dus los te testen. Tijden in UTC (de server
// draait in UTC; Nederlandse wandkloktijd gaat via amsterdamToUtc). Geen naam
// of contactgegevens van de gast erin: alleen wat, wanneer en waar.
// ---------------------------------------------------------------------------

export interface IcsBoeking {
  id: string;
  datum: string;
  tijd: string;
  personen: number;
  status: string;
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const tekst = (s: string) => s.replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");

const utf8 = new TextEncoder();

/**
 * Regels langer dan 75 bytes vouwen (RFC 5545): een vervolgregel begint met
 * een spatie (die telt mee). Per teken, dus een "ë" of emoji gaat nooit doormidden.
 */
export function vouw(regel: string): string {
  const delen: string[] = [];
  let deel = "";
  let bytes = 0;
  let max = 75;
  for (const teken of regel) {
    const n = utf8.encode(teken).length;
    if (bytes + n > max) {
      delen.push(deel);
      deel = "";
      bytes = 0;
      max = 74;
    }
    deel += teken;
    bytes += n;
  }
  delen.push(deel);
  return delen.join("\r\n ");
}

export function icsVoorBoeking(b: IcsBoeking, activiteit: string, duurMin: number, nu = new Date()): string {
  const [j, m, d] = b.datum.split("-").map(Number) as [number, number, number];
  const [u, min] = b.tijd.split(":").map(Number) as [number, number];
  const start = amsterdamToUtc(j, m, d, u, min);
  const eind = new Date(start.getTime() + duurMin * 60_000);
  const status = b.status === "geannuleerd" ? "CANCELLED" : b.status === "bevestigd" ? "CONFIRMED" : "TENTATIVE";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZekerFlex//Het Schwarzwald//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:schwarzwald-${b.id}@zekerflex.com`,
    `DTSTAMP:${utc(nu)}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(eind)}`,
    `SUMMARY:${tekst(`${activiteit} bij ${CONTACT.naam}`)}`,
    `LOCATION:${tekst(`${CONTACT.naam}, ${CONTACT.adres}, ${CONTACT.postcode}`)}`,
    `DESCRIPTION:${tekst(`Reservering ${b.id} voor ${b.personen} personen. Vragen of verzetten? Bel ${CONTACT.telefoon}.`)}`,
    `STATUS:${status}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${tekst(`Over 2 uur: ${activiteit} bij ${CONTACT.naam}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(vouw)
    .join("\r\n");
}
