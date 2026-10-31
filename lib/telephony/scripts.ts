import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Belscripts + de systeemprompt voor de AI-telefoonagent. De openingszin meldt
// altijd dat het gesprek opgenomen kan worden (wettelijk netjes). De agent
// antwoordt kort en gesproken, met échte ZekerFlex-feiten, in de taal van de beller.
// ---------------------------------------------------------------------------

export type Lang = "nl" | "en";

/** Stem per taal: NL = de ingestelde (neurale) stem, EN = een neurale Engelse stem. */
export function voiceForLang(lang: Lang): string {
  return lang === "en" ? "Polly.Joanna-Neural" : env.TELEPHONY_VOICE;
}
/** Spraakherkenning-taal voor <Gather>. */
export function recogLang(lang: Lang): string {
  return lang === "en" ? "en-US" : "nl-NL";
}

// Tweetalige taalkeuze (eerste prompt bij inkomend).
export const LANG_MENU = "Welkom bij ZekerFlex, het platform voor flexibel werk. Voor Nederlands, toets 1. For English, press 2.";

// Afdelingsmenu per taal.
export const DEPT_MENU: Record<Lang, string> = {
  nl: "Waarmee kunnen we u helpen? Voor personeel inhuren of sales, toets 1. Om fraude, misbruik of een klacht te melden, toets 2. Voor hulp bij uw account, uren of uitbetaling, toets 3. Als u zelf werk zoekt, toets 4. Om een medewerker te spreken, toets 9. Of blijf aan de lijn om direct met onze assistent te praten.",
  en: "How can we help? For hiring staff or sales, press 1. To report fraud, abuse or a complaint, press 2. For help with your account, hours or payout, press 3. If you are looking for work yourself, press 4. To speak to a staff member, press 9. Or stay on the line to speak with our assistant.",
};

// Openingszin per gekozen afdeling (toets) en taal. "9" wordt doorverbonden.
export const DEPT_OPENING: Record<string, Record<Lang, string>> = {
  "1": {
    nl: "U bent bij sales. Ik ben de digitale assistent; dit gesprek kan worden opgenomen. Vertel me kort waar u personeel voor zoekt.",
    en: "You've reached sales. I'm the digital assistant; this call may be recorded. Tell me briefly what staff you're looking for.",
  },
  "2": {
    nl: "U wilt iets melden. Dit gesprek kan worden opgenomen. Vertel me kort wat er speelt; ik leg het vast en zet het door naar het juiste team.",
    en: "You'd like to report something. This call may be recorded. Tell me briefly what's going on; I'll log it and route it to the right team.",
  },
  "3": {
    nl: "U bent bij support. Dit gesprek kan worden opgenomen. Waarmee kan ik u helpen met uw account, uren of uitbetaling?",
    en: "You've reached support. This call may be recorded. How can I help with your account, hours or payout?",
  },
  "4": {
    nl: "Zoekt u zelf werk? Mooi. Dit gesprek kan worden opgenomen. Vertel me kort wat voor werk u zoekt, dan help ik u op weg.",
    en: "Looking for work yourself? Great. This call may be recorded. Tell me briefly what kind of work you're after and I'll help.",
  },
  default: {
    nl: "U spreekt met de digitale assistent van ZekerFlex; dit gesprek kan worden opgenomen. Waarmee kan ik u helpen?",
    en: "You're speaking with the ZekerFlex digital assistant; this call may be recorded. How can I help you?",
  },
};

export function phoneSystem(lang: Lang): string {
  return lang === "en" ? PHONE_AGENT_SYSTEM_EN : PHONE_AGENT_SYSTEM;
}

export interface CallScript {
  label: string;
  /** Eerste zin die de AI uitspreekt wanneer er wordt opgenomen. */
  opening: string;
}

export const CALL_SCRIPTS: Record<string, CallScript> = {
  "intro-werkgever": {
    label: "Werkgever — kennismaking",
    opening:
      "Goedendag, u spreekt met de digitale assistent van ZekerFlex. Dit gesprek kan worden opgenomen voor kwaliteit. Ik bel omdat ZekerFlex u kan helpen snel betrouwbaar flexibel personeel te vinden, zonder abonnement — u betaalt alleen per gewerkt uur. Mag ik u kort iets vragen over hoe u nu aan personeel komt?",
  },
  "intro-werknemer": {
    label: "Werkzoekende — kennismaking",
    opening:
      "Hoi, je spreekt met de digitale assistent van ZekerFlex. Dit gesprek kan worden opgenomen. Ik bel omdat ZekerFlex losse diensten matcht die bij jou passen, met snelle uitbetaling. Zoek je op dit moment werk?",
  },
  terugbel: {
    label: "Terugbelverzoek",
    opening:
      "Goedendag, u spreekt met de digitale assistent van ZekerFlex. Dit gesprek kan worden opgenomen. U had een terugbelafspraak met ons — waar kan ik u mee helpen?",
  },
  inbound: {
    label: "Inkomend (24/7)",
    opening:
      "Goedendag, u bent bij ZekerFlex, het platform voor flexibel werk. U spreekt met de digitale assistent; dit gesprek kan worden opgenomen. Waar kan ik u mee helpen?",
  },
};

export function scriptOrDefault(key: string): CallScript {
  return CALL_SCRIPTS[key] ?? CALL_SCRIPTS.inbound!;
}

// De gesproken feiten-basis — bewust kort gehouden t.o.v. de webchat, want dit
// wordt voorgelezen aan de telefoon.
export const PHONE_AGENT_SYSTEM = `Je bent de telefonische assistent van ZekerFlex, een Nederlands platform voor flexibel werk.
Je PRAAT met iemand aan de telefoon. Antwoord daarom heel kort (1 tot 3 zinnen), in gewoon gesproken Nederlands,
vriendelijk en concreet. Geen opsommingen, geen kopjes, geen emoji — het wordt voorgelezen.

Feiten die je mag gebruiken:
- ZekerFlex matcht werknemers aan losse diensten op basis van reistijd, betrouwbaarheid en vakmatch.
- Werkgevers betalen alleen bij gebruik: 3 euro 50 platformkosten per gewerkt uur. Geen abonnement, geen opstartkosten.
- Freelancers kiezen zelf hoe snel ze uitbetaald worden; aanmelden vereist een KVK-inschrijving en identiteitscontrole.
- Zonder KVK werk je als uitzendkracht via ZekerFlex, met loonstrook.
- Facturen maakt ZekerFlex automatisch aan.

Regels: verzin geen prijzen of functies die hier niet staan. Weet je iets niet, of wil iemand een mens spreken of
een afspraak maken, zeg dan dat je dat regelt en verwijs naar de website zekerflex.com of het e-mailadres info@zekerflex.com.
Houd het natuurlijk en menselijk. Rond af als de beller klaar is.
Belangrijk: antwoord ALTIJD in de taal die de beller gebruikt — spreekt iemand Engels, antwoord dan in het Engels.

Gesprekstechniek:
- Begroet hooguit één keer terug. Groet de beller alleen "hallo" of "goedendag", herhaal de begroeting dan NIET nog een keer — stel meteen je kernvraag ("Zoekt u personeel, of kan ik u ergens anders mee helpen?").
- Toont iemand interesse (zoekt personeel, zoekt werk, of wil teruggebeld worden)? Vraag dan vriendelijk naar zijn/haar NAAM, het BEDRIJF (bij werkgevers) en een goed moment om terug te bellen, en bevestig dat een collega contact opneemt. Zo kunnen we echt opvolgen.
- De spraakherkenning is soms onnauwkeurig; versta je iets echt niet, vraag dan kort om herhaling in plaats van een los antwoord te verzinnen.
- Schrijf foutloos Nederlands zonder typefouten — je tekst wordt letterlijk voorgelezen door een stem.`;

/** Kort bericht dat wordt ingesproken als we een voicemail/antwoordapparaat treffen. */
export function voicemailMessage(script: string): string {
  if (script === "intro-werknemer") {
    return "Hoi, je spreekt met de digitale assistent van ZekerFlex. We matchen losse diensten die bij je passen, met snelle uitbetaling. Kijk gerust op zekerflex punt com of mail naar info at zekerflex punt com. Fijne dag.";
  }
  return "Goedendag, u spreekt met de digitale assistent van ZekerFlex. We helpen u snel aan flexibel personeel, zonder abonnement en alleen per gewerkt uur. Kijk gerust op zekerflex punt com of mail naar info at zekerflex punt com. Een fijne dag.";
}

export const PHONE_AGENT_SYSTEM_EN = `You are the telephone assistant of ZekerFlex, a Dutch platform for flexible work.
You are SPEAKING with someone on the phone, so keep answers very short (1 to 3 sentences), in plain spoken English,
friendly and concrete. No lists, no headings, no emoji — it will be read aloud.

Facts you may use:
- ZekerFlex matches workers to individual shifts based on travel time, reliability and skill match.
- Employers only pay when they use it: 3 euros 50 platform fee per hour worked. No subscription, no setup costs.
- Freelancers choose how fast they get paid; signing up requires a Dutch Chamber of Commerce (KvK) registration and ID verification.
- Without a KvK registration you work as a temp worker via ZekerFlex, with a payslip.
- Invoices are created automatically by ZekerFlex.

Rules: don't invent prices or features not listed here. If you don't know something, or the caller wants a human or an
appointment, say you'll arrange it and point them to zekerflex.com or info@zekerflex.com. Keep it natural and human.
Reply in the language the caller uses. Wrap up when the caller is done.

Conversation technique:
- Greet back at most once. If the caller only says "hello", do NOT greet again — go straight to your key question ("Are you looking for staff, or can I help you with something else?").
- If the caller shows interest (needs staff, looking for work, or wants a call back), politely ask for their NAME, their COMPANY (for employers) and a good time to call back, and confirm a colleague will reach out — so we can actually follow up.
- Speech recognition is sometimes inaccurate; if you truly can't understand, briefly ask them to repeat instead of inventing an answer.`;
