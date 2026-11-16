import { env } from "@/lib/env";
import { amsterdamParts } from "@/lib/time/amsterdam";
import { gatherDigits, say, sayAndGather, twiml, xmlEscape } from "@/lib/telephony/twiml";
import { weekdagVan, ZINNEN, type Belplan, type LijnInstellingen, type MenuKeuze, type Terugval, type Weekdag } from "@/lib/telephony/lijn";

// ---------------------------------------------------------------------------
// De TwiML van een klantlijn (lib/telephony/lijn.ts): wat Twilio uitvoert bij een gesprek naar dat nummer. Elke
// vervolgstap gaat naar /api/telephony/lijn (handtekening vereist) met alleen het lijn-id en de stap in de URL;
// nooit het nummer of de woorden van de beller (adressen komen in logboeken).
// ---------------------------------------------------------------------------

const basis = () => env.APP_BASE_URL.replace(/\/+$/, "");

export const lijnUrl = (lijnId: string, stap: string, extra: Record<string, string> = {}) => `${basis()}/api/telephony/lijn?${new URLSearchParams({ lijn: lijnId, stap, ...extra }).toString()}`;

const pad = (n: number) => String(n).padStart(2, "0");

/** Dag en tijd in Nederland, voor de openingstijden. */
export function nuInNederland(d = new Date()): { dag: Weekdag; tijd: string } {
  const p = amsterdamParts(d);
  return { dag: weekdagVan(p.weekday), tijd: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Doorschakelen: alle nummers gaan tegelijk over (teamnummer); wie het eerst opneemt, heeft het gesprek. */
export function bellenTwiml(lijnId: string, nummers: readonly string[], seconden: number, opnemen: boolean, callerId: string): string {
  const opname = opnemen ? ` record="record-from-answer-dual" recordingStatusCallback="${xmlEscape(lijnUrl(lijnId, "opname", { soort: "opname" }))}" recordingStatusCallbackEvent="completed"` : "";
  return `<Dial callerId="${xmlEscape(callerId)}" timeout="${seconden}" action="${xmlEscape(lijnUrl(lijnId, "na-bellen"))}" method="POST"${opname}>${nummers.map((n) => `<Number>${xmlEscape(n)}</Number>`).join("")}</Dial>`;
}

/** Niemand neemt op, of het is buiten de openingstijden: de assistent, de voicemail of een nette melding. */
export function terugvalTwiml(lijnId: string, naam: string, terugval: Terugval): string {
  if (terugval === "assistent") return sayAndGather(ZINNEN.assistent(naam), lijnUrl(lijnId, "vraag"));
  if (terugval === "voicemail") {
    return (
      say(ZINNEN.voicemail(naam)) +
      `<Record maxLength="120" playBeep="true" timeout="5" trim="trim-silence" action="${xmlEscape(lijnUrl(lijnId, "voicemail"))}" method="POST" recordingStatusCallback="${xmlEscape(lijnUrl(lijnId, "opname", { soort: "voicemail" }))}" recordingStatusCallbackEvent="completed"/>` +
      say(ZINNEN.voicemailBedankt) +
      "<Hangup/>"
    );
  }
  return say(ZINNEN.niemand(naam)) + "<Hangup/>";
}

export function menuTwiml(lijnId: string, naam: string, menu: readonly MenuKeuze[], poging: number): string {
  return gatherDigits(ZINNEN.menu(naam, menu), lijnUrl(lijnId, "menu", { poging: String(poging) }));
}

/** Het begin van een gesprek op deze lijn. */
export function startTwiml(lijnId: string, plan: Belplan, inst: LijnInstellingen, callerId: string): string {
  const melding = plan.melding ? say(ZINNEN.melding) : "";
  if (plan.menu) return twiml(melding + menuTwiml(lijnId, inst.naam, plan.menu, 1));
  if (plan.bellen) return twiml(melding + bellenTwiml(lijnId, plan.bellen.nummers, plan.bellen.seconden, plan.melding, callerId));
  return twiml(melding + terugvalTwiml(lijnId, inst.naam, plan.terugval));
}
