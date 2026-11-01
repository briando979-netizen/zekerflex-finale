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

/** <Say> met de opgegeven stem (of de standaardstem). */
export function say(text: string, voice?: string): string {
  const v = voice ?? VOICE();
  // Polly/Google-stemmen bepalen hun taal zelf; een language-attribuut erbij kan
  // Twilio laten terugvallen op een robotachtige basisstem. Alleen basisstemmen
  // (man/vrouw/alice) krijgen language mee.
  const lang = v.includes(".") ? "" : ` language="nl-NL"`;
  return `<Say voice="${xmlEscape(v)}"${lang}>${xmlEscape(text)}</Say>`;
}

// Deepgram kent Nederlands als "nl", de andere modellen als "nl-NL".
const speechLanguage = (recog: string, model: string): string => (model.startsWith("deepgram") && recog === "nl-NL" ? "nl" : recog);

/** Spreek iets uit en luister daarna naar het gesproken antwoord (spraak → actie-URL). */
export function sayAndGather(
  text: string,
  actionUrl: string,
  opts: { voice?: string; recogLang?: string } = {},
): string {
  const voice = opts.voice;
  const recog = opts.recogLang ?? "nl-NL";
  const english = recog.startsWith("en");
  const stillThere = english ? "Are you still there? I can't hear you." : "Bent u er nog? Ik hoor u even niet.";
  const nothing = english
    ? "I can't hear you, so I'll end the call. You can always reach us via our website."
    : "Ik hoor u niet, dus ik hang op. U kunt ons altijd bereiken via de website.";
  const model = env.TELEPHONY_SPEECH_MODEL;
  const gather = (spoken: string) =>
    `<Gather input="speech" language="${xmlEscape(speechLanguage(recog, model))}" speechTimeout="${xmlEscape(env.TELEPHONY_SPEECH_TIMEOUT)}" speechModel="${xmlEscape(model)}" action="${xmlEscape(actionUrl)}" method="POST">` +
    say(spoken, voice) +
    `</Gather>`;
  // Twilio wacht 5 seconden op spraak. Wie even nadenkt krijgt nog één kans, want
  // daarna hangen we op.
  return gather(text) + gather(stillThere) + say(nothing, voice) + `<Hangup/>`;
}

/** Spreek een menutekst uit en wacht op één toets (DTMF). Niets getoetst → terug naar de actie (lege input). */
export function gatherDigits(text: string, actionUrl: string, voice?: string, numDigits = 1): string {
  return (
    `<Gather input="dtmf" numDigits="${numDigits}" timeout="7" action="${xmlEscape(actionUrl)}" method="POST">` +
    say(text, voice) +
    `</Gather>` +
    `<Redirect method="POST">${xmlEscape(actionUrl)}</Redirect>`
  );
}

export function hangupAfter(text: string, voice?: string): string {
  return say(text, voice) + "<Hangup/>";
}

/** Verbind door naar een mens (bv. kantoornummer). */
export function dial(number: string): string {
  return `<Dial callerId="${xmlEscape(env.TWILIO_FROM_NUMBER ?? "")}">${xmlEscape(number)}</Dial>`;
}

export function twiml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}
