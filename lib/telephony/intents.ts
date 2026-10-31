// ---------------------------------------------------------------------------
// Wat zei de beller? Herkenning zonder taalmodel voor de momenten die altijd
// hetzelfde moeten gaan: begroeting, afscheid en voicemail of een bandje. De
// voicemail-patronen komen uit transcripties van onze eigen gesprekken.
// ---------------------------------------------------------------------------

const GOODBYE_WORDS =
  "doei|daag|tot ziens|bedankt|dank (?:je|u)|fijne dag|hang|ophangen|nee bedankt|bye|goodbye|thanks|thank you|no thanks";
const GOODBYE = new RegExp(`\\b(${GOODBYE_WORDS})\\b`, "i");
const GOODBYE_OR_DAG = new RegExp(`\\b(dag|${GOODBYE_WORDS})\\b`, "i");

/**
 * "Dag" is in het Nederlands ook hallo: "Dag, met Jan" als eerste reactie is geen
 * afscheid. Lange zinnen tellen niet mee, daar zit meestal nog een vraag in.
 */
export function isGoodbye(speech: string, firstReply: boolean): boolean {
  return speech.length < 40 && (firstReply ? GOODBYE : GOODBYE_OR_DAG).test(speech);
}

const GREETING_WORD =
  "hal+o+|hoi+|hey+|hai+|yo+|goe[a-z]*\\s?(?:dag|morgen|middag|avond)|hello+|hi+|hey\\s*there|good\\s*(?:morning|afternoon|evening|day)";
const GREETING_ONLY = new RegExp(`^(?:(?:${GREETING_WORD})[\\s,!.?-]*)+$`, "i");
const DAG_ONLY = /^dag[\s,!.?-]*$/i;

/** Alleen een begroeting, eventueel herhaald ("hallo hallo"). Niet: "hallo, ik zoek personeel". */
export function isGreetingOnly(speech: string, firstReply: boolean): boolean {
  return GREETING_ONLY.test(speech) || (firstReply && DAG_ONLY.test(speech));
}

const VOICEMAIL = new RegExp(
  "\\b(?:" +
    [
      "voice ?mail",
      "voicebox",
      "mailbox",
      "antwoordapparaat",
      "bericht (?:achter|in|inspreken)\\b",
      "bericht achterlaten",
      "na de (?:toon|piep|pieptoon)\\b",
      "telefonisch (?:bereikbaar|te bereiken)",
      "niet te woord staan",
      "opening(?:stijden|suren)",
      "kantoortijden",
      "(?:kantoor|verkoop|klantenservice|receptie|winkel)\\b[^.]{0,40}\\bgesloten\\b",
      "leave (?:a|your) message",
      "after the (?:tone|beep)",
    ].join("|") +
    ")",
  "i",
);

/** Klinkt dit als een voicemail of een bandje met openingstijden in plaats van een mens? */
export function looksLikeVoicemail(speech: string): boolean {
  return VOICEMAIL.test(speech);
}
