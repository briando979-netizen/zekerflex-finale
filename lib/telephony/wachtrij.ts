import { amsterdamParts } from "@/lib/time/amsterdam";
import { hangupAfter, say, sayAndGather, gatherDigits, xmlEscape } from "@/lib/telephony/twiml";
import { DEPT_LABEL, recogLang, type Lang } from "@/lib/telephony/scripts";

// ---------------------------------------------------------------------------
// Een medewerker spreken via de wachtrij (13 nov 2026, eigenaar: "zorg dat je in wachtrij komt en niet gelijk
// doorschakelt"). De beller komt in een Twilio-wachtrij (<Enqueue>) en hoort zijn plek; de telefoon van de medewerker
// (TELEPHONY_FORWARD_NUMBER) gaat over (lib/telephony/wachtrij-server.ts) en die neemt aan met toets 1 (zo neemt zijn
// voicemail nooit een beller over). Niemand binnen MAX_WACHT_S, buiten kantoortijd of geen nummer: een terugbelverzoek.
// Hier alleen de TwiML en de kantoortijd; geen opslag, geen taalmodel, dus dit valt nooit stil.
// ---------------------------------------------------------------------------

export const WACHTRIJ = "zekerflex-medewerker";
/** Zo lang (s) wacht een beller hooguit in de rij; daarna het terugbelaanbod. */
export const MAX_WACHT_S = 180;
/** Zo vaak gaat de telefoon van de medewerker hooguit over voor één beller; nam hij niet aan, dan het terugbelaanbod. */
export const MAX_POGINGEN = 2;

const T: Record<Lang, { naarRij: string; positie: string; nogSteeds: string; niemand: string; buitenTijd: string; bedankt: string; genoteerd: string }> = {
  nl: {
    naarRij: "Ik zet u in de wachtrij voor een medewerker. Een moment geduld alstublieft.",
    positie: "U bent nummer {n} in de wachtrij.",
    nogSteeds: "U staat nog in de wachtrij, als nummer {n}. Bedankt voor uw geduld.",
    niemand: "Er is nu geen medewerker vrij. Zeg na deze zin uw naam en wanneer we u mogen terugbellen, dan bellen we u zo snel mogelijk terug.",
    buitenTijd:
      "Onze medewerkers zijn nu niet bereikbaar: van maandag tot en met vrijdag van acht tot acht, en op zaterdag van tien tot vier. Zeg na deze zin uw naam en wanneer we u mogen terugbellen, dan bellen we u terug.",
    bedankt: "Dank u wel. We bellen u zo snel mogelijk terug. Een fijne dag nog.",
    genoteerd: "We hebben uw nummer genoteerd en bellen u terug. Tot ziens.",
  },
  en: {
    naarRij: "I'm putting you in the queue for a staff member. One moment please.",
    positie: "You are number {n} in the queue.",
    nogSteeds: "You are still in the queue, as number {n}. Thank you for your patience.",
    niemand: "No staff member is available right now. After this message, say your name and when we may call you back, and we will call you back as soon as possible.",
    buitenTijd:
      "Our staff can't be reached right now: Monday to Friday from eight to eight, and Saturday from ten to four. After this message, say your name and when we may call you back, and we will call you back.",
    bedankt: "Thank you. We will call you back as soon as possible. Have a nice day.",
    genoteerd: "We have noted your number and will call you back. Goodbye.",
  },
};

/** Gaat de telefoon van een medewerker nu over? Maandag tot en met vrijdag 8 tot 20 uur, zaterdag 10 tot 16 uur (Amsterdam). */
export function binnenKantoortijd(nu: Date): boolean {
  const p = amsterdamParts(nu);
  const uur = p.hour + p.minute / 60;
  if (p.weekday >= 1 && p.weekday <= 5) return uur >= 8 && uur < 20;
  if (p.weekday === 6) return uur >= 10 && uur < 16;
  return false;
}

interface Beller {
  base: string;
  callId: string;
  lang: Lang;
  voice: string;
}

/** Vraag om een terugbelverzoek; het antwoord gaat naar /api/telephony/terugbellen. */
export function terugbelTwiml(o: Beller & { reden: "niemand" | "buitenTijd" }): string {
  return sayAndGather(T[o.lang][o.reden], `${o.base}/api/telephony/terugbellen?callId=${o.callId}`, { voice: o.voice, recogLang: recogLang(o.lang) });
}

/** Naar een medewerker: binnen kantoortijd en met een nummer in de wachtrij, anders meteen het terugbelaanbod. */
export function naarMedewerkerTwiml(o: Beller & { kantoor: boolean; heeftNummer: boolean }): string {
  if (!o.kantoor || !o.heeftNummer) return terugbelTwiml({ ...o, reden: o.kantoor ? "niemand" : "buitenTijd" });
  const wacht = `${o.base}/api/telephony/wachtrij?callId=${o.callId}`;
  const klaar = `${o.base}/api/telephony/wachtrij/klaar?callId=${o.callId}`;
  return say(T[o.lang].naarRij, o.voice) + `<Enqueue waitUrl="${xmlEscape(wacht)}" waitUrlMethod="POST" action="${xmlEscape(klaar)}" method="POST">${WACHTRIJ}</Enqueue>`;
}

/** Wat de beller hoort terwijl hij wacht; Twilio vraagt dit steeds opnieuw op. Na MAX_WACHT_S: uit de rij (dan het terugbelaanbod). */
export function wachtTwiml(o: { lang: Lang; voice: string; positie: number; wachttijd: number }): string {
  if (o.wachttijd >= MAX_WACHT_S) return "<Leave/>";
  const t = T[o.lang];
  const zin = (o.wachttijd < 5 ? t.positie : t.nogSteeds).replace("{n}", String(Math.max(1, Math.round(o.positie) || 1)));
  return say(zin, o.voice) + `<Pause length="20"/>`;
}

/** Na de wachtrij (Twilio QueueResult): verbonden of opgehangen is klaar; anders (te lang, fout) het terugbelaanbod. */
export function naWachtrijTwiml(o: Beller & { uitslag: string }): string {
  if (o.uitslag === "bridged" || o.uitslag === "hangup" || o.uitslag === "redirected") return "<Hangup/>";
  return terugbelTwiml({ ...o, reden: "niemand" });
}

/** Het einde van een terugbelverzoek (met of zonder ingesproken bericht). */
export function terugbelBedankt(lang: Lang, voice: string, metBericht: boolean): string {
  return hangupAfter(metBericht ? T[lang].bedankt : T[lang].genoteerd, voice);
}

/** De medewerker neemt op: wie er wacht, en "toets 1". Zonder toets (of zijn voicemail) blijft de beller in de rij. */
export function medewerkerTwiml(o: { base: string; callId: string; dept: string | null | undefined; voice?: string }): string {
  const label = o.dept && Object.hasOwn(DEPT_LABEL, o.dept) ? `: ${DEPT_LABEL[o.dept] ?? ""}` : "";
  return gatherDigits(`Er wacht een beller van ZekerFlex${label}. Toets 1 om het gesprek aan te nemen.`, `${o.base}/api/telephony/wachtrij/medewerker?callId=${o.callId}&stap=aannemen`, o.voice);
}

/** Toets 1: de beller die vooraan staat erbij; anders ophangen en blijft de beller wachten. */
export function aannemenTwiml(aangenomen: boolean, voice?: string): string {
  if (!aangenomen) return hangupAfter("Oké. De beller blijft nog even in de wachtrij.", voice);
  return say("Ik verbind u met de beller.", voice) + `<Dial><Queue>${WACHTRIJ}</Queue></Dial>` + hangupAfter("Het gesprek is afgelopen. Tot ziens.", voice);
}
