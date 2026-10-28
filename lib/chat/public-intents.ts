// ---------------------------------------------------------------------------
// The public chat assistant's own brain: small talk and the common questions,
// answered instantly and correctly without a language model. When the model
// is connected it handles the open questions; these stay the fast path.
// Each answer can carry follow-up suggestions, sent to the widget as a final
// line "[[vraag 1|vraag 2|…]]" which it renders as tap-able chips.
// ---------------------------------------------------------------------------

export interface IntentReply {
  reply: string;
  suggestions: string[];
}

const START = ["Hoe snel word ik uitbetaald?", "Wat kost ZekerFlex voor bedrijven?", "Hoe meld ik me aan?", "Wat is ZekerFlex Bank?"];

function hourGreeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).format(now));
  return h < 6 ? "Goedenacht" : h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond";
}

const SMALL_TALK: { re: RegExp; answer: () => IntentReply }[] = [
  {
    re: /^(hoi+|hoii*|hallo+|hey+|hee+|hi+|hello|yo|hai|dag|goede(morgen|middag|avond|nacht)|morgen|moi|heuj|hallo daar|salut)[\s!.,?]*$/i,
    answer: () => ({
      reply: `${hourGreeting()}! 👋 Leuk dat je er bent. Ik ben de ZekerFlex-assistent en help je met alles over werken via ZekerFlex, personeel inhuren, uitbetalen en ZekerFlex Bank. Waar kan ik je mee helpen?`,
      suggestions: START,
    }),
  },
  {
    re: /^(bedankt|dank ?je( wel)?|dank u( wel)?|thanks|thx|top|super|perfect|fijn|helder|duidelijk|ok(é|e|ay)?|oké|prima|mooi)[\s!.,]*$/i,
    answer: () => ({ reply: "Graag gedaan! 😊 Kan ik je nog ergens anders mee helpen?", suggestions: ["Hoe meld ik me aan?", "Contact met een mens", "Wat is ZekerFlex Bank?"] }),
  },
  {
    re: /^(doei|dag dag|tot ziens|later|bye|tot later|fijne dag)[\s!.,]*$/i,
    answer: () => ({ reply: "Tot ziens en een fijne dag! Je kunt me altijd weer openen via de knop rechtsonder. 👋", suggestions: [] }),
  },
  {
    re: /hoe gaat( het)?( met je)?|alles goed|how are you/i,
    answer: () => ({ reply: "Met mij gaat het prima, dank je! Ik sta 24/7 klaar. En met jou? Waar kan ik je mee helpen?", suggestions: START }),
  },
  {
    re: /wie ben (jij|je)|wat ben (jij|je)|ben je (een )?(robot|bot|mens|ai)|met wie (praat|spreek) ik/i,
    answer: () => ({
      reply: "Ik ben de digitale assistent van ZekerFlex. Ik beantwoord vragen direct, dag en nacht. Wil je liever een mens spreken? Mail support@zekerflex.com, dan reageren we zo snel mogelijk.",
      suggestions: ["Contact met een mens", "Wat doet ZekerFlex?"],
    }),
  },
  {
    re: /^(wat (doet|is) zekerflex|wat doen jullie|vertel (eens )?(over|meer)|uitleg)[\s?!.]*$/i,
    answer: () => ({
      reply: "ZekerFlex verbindt bedrijven met gecontroleerde zzp'ers en uitzendkrachten voor losse diensten. Bedrijven plaatsen een klus en betalen alleen per gewerkt uur; werkenden kiezen zelf hun klussen en worden snel uitbetaald — ook direct op hun eigen ZekerFlex Bank-rekening.",
      suggestions: ["Ik zoek werk", "Ik zoek personeel", "Wat is ZekerFlex Bank?"],
    }),
  },
];

const TOPICS: { re: RegExp; answer: IntentReply }[] = [
  {
    re: /ik zoek (werk|een baan|klussen)|werk zoeken|bijverdienen|geld verdienen|bijbaan/i,
    answer: { reply: "Top! Maak gratis een account via 'Aan de slag', vul je vak, beschikbaarheid en woonplaats in en doorloop een korte identiteitscheck. Daarna zie je klussen bij jou in de buurt en reageer je met één tik.", suggestions: ["Hoe snel word ik uitbetaald?", "Heb ik een KVK nodig?", "Kan ik als uitzendkracht werken?"] },
  },
  {
    re: /ik zoek (personeel|mensen|krachten|medewerkers)|personeel (nodig|inhuren)|mensen inhuren|tekort aan personeel/i,
    answer: { reply: "Daar helpen we je graag mee. Registreer je bedrijf en plaats een dienst; passende krachten uit de buurt kunnen reageren als ze beschikbaar zijn. Je betaalt € 3,50 platformkosten per gewerkt uur — geen abonnement of opstartkosten.", suggestions: ["Plan een demo", "Hoe werkt matching?", "Wat kost ZekerFlex voor bedrijven?"] },
  },
  {
    re: /uitbetaal|betaald|payout|wanneer.*(betaal|geld)|hoe snel.*geld/i,
    answer: { reply: "Na goedkeuring van je uren kies je per klus: betaalopdracht direct indienen (4% van de factuur), binnen 3 werkdagen indienen (2%) of gratis wachten tot de opdrachtgever betaalt. Bij externe banken kan de bijschrijving daarna langer duren; een boeking via ZekerFlex Bank is direct zichtbaar.", suggestions: ["Wat is ZekerFlex Bank?", "Kan ik een voorschot krijgen?", "Hoe vul ik mijn uren in?"] },
  },
  {
    re: /voorschot/i,
    answer: { reply: "Ja: je kunt een voorschot opnemen op uren die al goedgekeurd of onderweg zijn, tegen een kleine vergoeding. Ontvang je je verdiensten op ZekerFlex Bank, dan staat het voorschot direct op je rekening en wordt het verrekend met je volgende uitbetaling.", suggestions: ["Wat is ZekerFlex Bank?", "Hoe snel word ik uitbetaald?"] },
  },
  {
    re: /prijs|prijzen|kost|tarief|fee|commissie|abonnement|wat betaal/i,
    answer: { reply: "Bedrijven betalen € 3,50 platformkosten per gewerkt uur, alleen als er echt iemand werkt — geen abonnement of opstartkosten. Voor werkenden is ZekerFlex gratis; ZekerFlex Bank is de eerste 30 dagen gratis en de virtuele betaalpas altijd.", suggestions: ["Plan een demo", "Wat is ZekerFlex Bank?"] },
  },
  {
    re: /zekerflex bank|bankrekening|rekening openen|\bbank\b/i,
    answer: { reply: "ZekerFlex Bank is je eigen rekening in de app: verdiensten komen er direct op, je kunt potjes maken, sparen met vaste rente, geld overmaken en betaalverzoeken sturen, en een gratis virtuele betaalpas aanvragen. De eerste 30 dagen zijn gratis.", suggestions: ["Hoe vraag ik een betaalpas aan?", "Kan ik sparen?", "Wat kost de bank?"] },
  },
  {
    re: /betaalpas|pinpas|debitcard|kaart aanvragen|apple pay|google pay/i,
    answer: { reply: "In ZekerFlex Bank → Passen vraag je zelf een pas aan: de virtuele pas is gratis en direct te gebruiken (ook in Apple Pay en Google Pay), een fysieke pas komt per post. Elke betaling gaat direct van je saldo af en je stelt zelf limieten in.", suggestions: ["Wat is ZekerFlex Bank?", "Wat kost de bank?"] },
  },
  {
    re: /sparen|spaarrente|rente|potje|vastzetten|deposito/i,
    answer: { reply: "Met potjes zet je geld apart (bijvoorbeeld voor belasting of vakantie), automatisch of met afronden. Wil je rente? Zet geld vast voor 1 tot 10 jaar tegen een vaste rente; op de einddatum komt het met rente terug op je rekening.", suggestions: ["Wat is ZekerFlex Bank?", "Belasting reserveren als zzp'er"] },
  },
  {
    re: /uitzend|zonder kvk|geen kvk|loonstrook|payroll/i,
    answer: { reply: "Geen KVK? Dan werk je via ZekerFlex als uitzendkracht: wij regelen loonheffing, vakantiegeld en pensioen. Je krijgt na goedkeuring van je uren binnen een minuut een voorschot en de rest op je wekelijkse loonstrook.", suggestions: ["Hoe meld ik me aan?", "Hoe snel word ik uitbetaald?"] },
  },
  {
    re: /belasting|btw|inkomstenbelasting|aangifte|kvk|kleineondernemers|\bkor\b/i,
    answer: { reply: "Als zzp'er heb je een KVK-inschrijving nodig. ZekerFlex maakt je facturen automatisch, en in ZekerFlex Bank → Belasting zie je per kwartaal de btw die je moet afdragen en wat je opzij zet voor inkomstenbelasting — in één tik naar je potje Belasting. Jaaroverzicht downloadbaar voor je boekhouder.", suggestions: ["Kan ik als uitzendkracht werken?", "Wat is ZekerFlex Bank?"] },
  },
  {
    re: /uren (invullen|indienen|schrijven)|inchecken|uitchecken|urenbrief|timesheet/i,
    answer: { reply: "Op de dag van je klus check je in en uit op locatie met één knop. Daarna vul je je uren in stappen in: gewerkt? → kloppen de uren? → eventuele extra kosten → beoordeling → hoe snel je betaald wilt worden → indienen.", suggestions: ["Hoe snel word ik uitbetaald?", "Wat als ik niet kon werken?"] },
  },
  {
    re: /annuleer|annuleren|afzeggen|niet (kan|kon) (werken|komen)|ziek/i,
    answer: { reply: "Kun je niet? Zeg zo vroeg mogelijk af via Mijn klussen of vraag een vervanger aan. Heeft de opdrachtgever afgezegd of was er geen werk, geef dat dan door bij 'Uren invullen' → 'Nee, niet gewerkt' — ZekerFlex handelt het af, inclusief een eventuele annuleringsvergoeding.", suggestions: ["Hoe vul ik mijn uren in?", "Contact met een mens"] },
  },
  {
    re: /verzeker|aov|aansprakelijk|ongevallen|rechtsbijstand/i,
    answer: { reply: "Via ZekerFlex Bank → Verzekeren kun je verzekeringen afsluiten zoals arbeidsongeschiktheid en aansprakelijkheid, met de premie maandelijks van je saldo. De verzekeraar draagt het risico; zodra er een aanbod beschikbaar is zie je het daar.", suggestions: ["Wat is ZekerFlex Bank?"] },
  },
  {
    re: /verwijs|uitnodig|vriend|bonus|referral/i,
    answer: { reply: "Nodig iemand uit met je persoonlijke link (bij Account of ZekerFlex Bank). Zodra die persoon de eerste klus afrondt krijg jij een bonus en zij een welkomstbonus — direct op ZekerFlex Bank.", suggestions: ["Wat is ZekerFlex Bank?", "Hoe meld ik me aan?"] },
  },
  {
    re: /level|badge|xp|beloning/i,
    answer: { reply: "Met elke afgeronde klus en goede review verdien je XP en stijg je van Starter tot Diamant. Hogere levels geven echte voordelen, zoals korting op bankkosten tot helemaal gratis en een gratis fysieke pas.", suggestions: ["Wat is ZekerFlex Bank?"] },
  },
  {
    re: /\bdba\b|schijnzelfstand|modelovereenkomst|wet dba/i,
    answer: { reply: "ZekerFlex legt afspraken vast en signaleert onder meer urenconcentratie, opeenvolgende weken en omzetafhankelijkheid. Dat geeft geen garantie over de arbeidsrelatie: de feitelijke werkwijze blijft bepalend.", suggestions: ["Kan ik als uitzendkracht werken?", "Wat kost ZekerFlex voor bedrijven?"] },
  },
  {
    re: /aanmeld|registr|account|beginnen|starten|inschrijv|hoe meld/i,
    answer: { reply: "Aanmelden kan gratis via 'Aan de slag'. Als zzp'er heb je een KVK-inschrijving nodig; zonder KVK werk je als uitzendkracht. Je doorloopt een korte identiteitscheck (foto van je ID en een selfie). Bedrijven registreren hun organisatie en plaatsen direct diensten.", suggestions: ["Kan ik als uitzendkracht werken?", "Waarom een identiteitscheck?"] },
  },
  {
    re: /identiteit|\bkyc\b|selfie|paspoort|\bid\b|verificatie/i,
    answer: { reply: "De identiteitscheck (foto van de voor- en achterkant van je ID plus een selfie) zorgt dat iedereen op ZekerFlex is wie hij zegt te zijn — veilig voor werkenden én bedrijven, en verplicht voor uitbetalen. Je gegevens worden versleuteld bewaard.", suggestions: ["Is mijn data veilig?", "Hoe meld ik me aan?"] },
  },
  {
    re: /match|hoe werkt|vind.*klus|shift|klus(sen)?/i,
    answer: { reply: "Je geeft je vak, beschikbaarheid en woonplaats op. Bij een nieuwe dienst rangschikt ZekerFlex kandidaten op reistijd, betrouwbaarheid en vakmatch, en filter je zelf op branche, dag, tijd, tarief en afstand.", suggestions: ["Ik zoek werk", "Hoe snel word ik uitbetaald?"] },
  },
  {
    re: /demo|afspraak|bellen|kennismak|presentatie/i,
    answer: { reply: "Een demo plan je via de pagina 'Demo' — kies een moment dat jou uitkomt en we laten in 20 minuten zien hoe je personeel plaatst, uren goedkeurt en betaalt.", suggestions: ["Wat kost ZekerFlex voor bedrijven?", "Ik zoek personeel"] },
  },
  {
    re: /vacature|werken bij|solliciteer|baan bij zekerflex/i,
    answer: { reply: "Wil je bij ZekerFlex zelf komen werken? Kijk op de pagina 'Werken bij' en stuur een open sollicitatie — we lezen alles.", suggestions: ["Contact met een mens"] },
  },
  {
    re: /webshop|winkel|kleding|veiligheidsschoen|pbm|werkkleding/i,
    answer: { reply: "In de ZekerFlex-webshop vind je werkkleding en persoonlijke beschermingsmiddelen (zoals veiligheidsschoenen en hesjes), en bij elke klus zie je welke spullen je nodig hebt.", suggestions: ["Ik zoek werk"] },
  },
  {
    re: /veilig|privacy|data|gegevens|avg|gdpr/i,
    answer: { reply: "Het platform draait in Nederland, gevoelige gegevens worden versleuteld opgeslagen, analytics werkt zonder cookies en elke handeling wordt vastgelegd in een auditspoor.", suggestions: ["Waarom een identiteitscheck?"] },
  },
  {
    re: /contact|mens spreken|medewerker spreken|bereik|mail|telefoon|hulp nodig|klacht/i,
    answer: { reply: "Je bereikt ons via support@zekerflex.com (algemeen: info@zekerflex.com). Ben je ingelogd? Dan kun je ook in de app chatten met ZekerFlex Support.", suggestions: ["Hoe meld ik me aan?"] },
  },
];

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/** Small talk — always answered here, also mid-conversation. */
export function smallTalk(text: string): IntentReply | null {
  const t = norm(text);
  if (t.length > 60) return null;
  return SMALL_TALK.find((x) => x.re.test(t))?.answer() ?? null;
}

/** A known topic. */
export function topicAnswer(text: string): IntentReply | null {
  return TOPICS.find((x) => x.re.test(norm(text)))?.answer ?? null;
}

export function fallbackAnswer(): IntentReply {
  return {
    reply: "Goede vraag — die kan ik nog niet zeker beantwoorden. Mail support@zekerflex.com, dan helpt een collega je persoonlijk. Of kies hieronder een onderwerp:",
    suggestions: START,
  };
}

/** The widget's wire format: answer text plus a final suggestions line. */
export function withSuggestions(r: IntentReply): string {
  return r.suggestions.length ? `${r.reply}\n[[${r.suggestions.join("|")}]]` : r.reply;
}
