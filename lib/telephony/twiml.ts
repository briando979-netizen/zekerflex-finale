import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Minimale TwiML-bouwer (de XML die Twilio terugkrijgt en uitvoert). Geen SDK:
// gewone, correct ge-escapete strings. Genoeg voor spreken, luisteren (Gather
// met spraakherkenning), doorverbinden en ophangen.
// ---------------------------------------------------------------------------

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const VOICE = () => env.TELEPHONY_VOICE;

/** <Say> in het Nederlands met de ingestelde stem. */
export function say(text: string): string {
  return `<Say voice="${xmlEscape(VOICE())}" language="nl-NL">${xmlEscape(text)}</Say>`;
}

/** Spreek iets uit en luister daarna naar het antwoord (spraak → actie-URL). */
export function sayAndGather(text: string, actionUrl: string): string {
  return (
    `<Gather input="speech" language="nl-NL" speechTimeout="auto" action="${xmlEscape(actionUrl)}" method="POST">` +
    say(text) +
    `</Gather>` +
    // Niets gehoord: nog één poging, anders nette afsluiting.
    say("Ik hoorde niets. Je kunt ons altijd bereiken via de website.") +
    `<Hangup/>`
  );
}

export function hangupAfter(text: string): string {
  return say(text) + "<Hangup/>";
}

/** Verbind door naar een mens (bv. kantoornummer). */
export function dial(number: string): string {
  return `<Dial callerId="${xmlEscape(env.TWILIO_FROM_NUMBER ?? "")}">${xmlEscape(number)}</Dial>`;
}

export function twiml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}
