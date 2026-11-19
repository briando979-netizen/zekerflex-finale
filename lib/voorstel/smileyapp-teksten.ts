import type { Taal } from "@/lib/voorstel/smileyapp-taal";

// ---------------------------------------------------------------------------
// De teksten van de drie onderdelen die het SmileyApp-voorstel in meer talen
// toont: het aanvraagformulier, "Probeer het zelf" en de pakketkiezer. Alleen
// platte tekst (met {plek} voor een waarde), zodat een serverpagina ze als prop
// kan meegeven. Hier staat de Nederlandse standaard: laat een pagina de prop
// weg, dan is het onderdeel Nederlands zoals het was. De Engelse en Duitse
// teksten staan in lib/voorstel/smileyapp-talen.ts. Puur bestand.
// ---------------------------------------------------------------------------

/** Vult de plekken {naam} in een tekst in. Een plek zonder waarde blijft staan. */
export const vul = (tekst: string, waarden: Record<string, string | number>) =>
  tekst.replace(/\{(\w+)\}/g, (heel, sleutel: string) => (Object.hasOwn(waarden, sleutel) ? String(waarden[sleutel]) : heel));

export interface FormulierTeksten {
  /** de taal van het formulier: gaat mee met de aanvraag, zodat het team ziet in welke taal iemand geholpen wil worden */
  taal: Taal;
  naam: string;
  bedrijf: string;
  email: string;
  telefoon: string;
  magLeeg: string;
  pakket: string;
  pakketOnbekend: string;
  dag: string;
  tijd: string;
  geenVoorkeur: string;
  /** een tijd in de keuzelijst, met {tijd} */
  tijdOptie: string;
  momentUitleg: string;
  /** de keuzelijst met open tijden uit de agenda (alleen als het team tijden heeft opengezet) */
  afspraak: string;
  /** de eerste keuze in die lijst: geen tijd kiezen, dan volgt het voorkeursmoment */
  afspraakGeen: string;
  afspraakUitleg: string;
  interesses: string;
  berichtDemo: string;
  berichtPartner: string;
  lokveld: string;
  toestemmingDemo: string;
  toestemmingPartner: string;
  bezig: string;
  verstuurDemo: string;
  verstuurPartner: string;
  /** de waarschuwing zolang niemand van SmileyApp kan inloggen; het e-mailadres en een punt volgen */
  nietActief: string;
  foutToestemming: string;
  foutVersturen: string;
  foutVerbinding: string;
  foutTeVaak: string;
  /**
   * De melding per veld dat de server afkeurt. De server antwoordt in het Nederlands; een vertaald formulier toont
   * daarom zijn eigen tekst bij het veld. Leeg (Nederlands): de melding van de server zelf.
   */
  fouten: Readonly<Record<string, string>>;
  bedanktDemo: string;
  bedanktPartner: string;
  /** het gekozen moment, met {dag} en {tijd} */
  moment: string;
  /** met {moment} */
  belMoment: string;
  /** na het kiezen van een tijd uit de agenda, met {moment} */
  bedanktAfspraak: string;
  contactOp: string;
  /** het e-mailadres en een punt volgen */
  kloptNiet: string;
}

export const FORMULIER_NL: FormulierTeksten = {
  taal: "nl",
  naam: "Naam",
  bedrijf: "Bedrijf of organisatie",
  email: "E-mailadres",
  telefoon: "Telefoonnummer",
  magLeeg: " (mag leeg)",
  pakket: "Welk pakket wil je zien?",
  pakketOnbekend: "Weet ik nog niet",
  dag: "Voorkeursdag",
  tijd: "Voorkeurstijd",
  geenVoorkeur: "Geen voorkeur",
  tijdOptie: "{tijd} uur",
  momentUitleg: "We bellen je op of rond dit moment (werkdagen tussen 09:00 en 17:00 uur). Het is je voorkeur, geen vaste afspraak.",
  afspraak: "Kies een tijd voor je demo",
  afspraakGeen: "Geen van deze tijden past",
  afspraakUitleg: "Deze tijden heeft SmileyApp vrijgemaakt voor een demo van 30 minuten (Nederlandse tijd). Kies je er een, dan staat de afspraak meteen vast en krijg je een bevestiging per mail.",
  interesses: "Ik ben geïnteresseerd in",
  berichtDemo: "Wat wil je graag zien of weten?",
  berichtPartner: "Vertel kort iets over je bedrijf of event",
  lokveld: "Laat dit veld leeg",
  toestemmingDemo: "SmileyApp mag mij bellen of mailen over deze aanvraag.",
  toestemmingPartner: "SmileyApp mag mij bellen of mailen over deze aanmelding.",
  bezig: "Bezig met versturen…",
  verstuurDemo: "Vraag de demo aan",
  verstuurPartner: "Meld je aan als partner",
  nietActief: "Let op: dit is een ontwerpvoorstel. Zolang SmileyApp dit beheer nog niet gebruikt, leest niemand van SmileyApp wat je hier instuurt. Mail voor nu naar",
  foutToestemming: "Vink aan dat SmileyApp contact met je mag opnemen over deze aanvraag.",
  foutVersturen: "Versturen lukte niet. Probeer het opnieuw.",
  foutVerbinding: "Versturen lukte niet. Controleer je internetverbinding en probeer het opnieuw.",
  foutTeVaak: "Je hebt net al een paar aanvragen gestuurd. Probeer het over tien minuten opnieuw.",
  fouten: {},
  bedanktDemo: "Bedankt, je aanvraag is binnen",
  bedanktPartner: "Bedankt, je aanmelding is binnen",
  moment: "{dag} om {tijd} uur",
  belMoment: "We bellen je op of rond {moment}. Dat moment is je voorkeur, nog geen vaste afspraak.",
  bedanktAfspraak: "Je demo staat gepland op {moment} (Nederlandse tijd). Je krijgt een bevestiging per mail, met de afspraak voor je agenda.",
  contactOp: "We nemen contact met je op via je e-mailadres of telefoonnummer.",
  kloptNiet: "Klopt er iets niet of wil je iets toevoegen? Mail naar",
};

export interface ProbeerTeksten {
  voorbeeldvraag: string;
  /** voor schermlezers, met {score} */
  waarde: string;
  sleepUitleg: string;
  kiesCijfer: string;
  geefAntwoord: string;
  pasAan: string;
  opnieuw: string;
  privacy: string;
  dashboardKop: string;
  voorbeeld: string;
  staafjes: string;
  /** met {score} (krijgt een kleur), {gemiddelde} en {totaal} */
  jouwAntwoord: string;
  geefLinks: string;
  lijstNaam: string;
  /** voor schermlezers, met {cijfer} en {n} */
  staafEen: string;
  staafMeer: string;
  staafVanJou: string;
  geleStaaf: string;
  /** het teken voor de decimalen in het gemiddelde */
  decimaal: string;
}

export const PROBEER_NL: ProbeerTeksten = {
  voorbeeldvraag: "Voorbeeldvraag",
  waarde: "{score} van 10",
  sleepUitleg: "Sleep de smiley naar links of rechts, gebruik de pijltjestoetsen of kies een cijfer.",
  kiesCijfer: "Kies een cijfer van 1 tot 10",
  geefAntwoord: "Geef dit antwoord",
  pasAan: "Antwoord aanpassen",
  opnieuw: "Opnieuw",
  privacy: "Een voorbeeld: je antwoord blijft in je eigen browser, er wordt niets bewaard of verstuurd.",
  dashboardKop: "Zo ziet het er in je dashboard uit",
  voorbeeld: "Voorbeeld",
  staafjes: "De staafjes zijn voorbeeldcijfers, geen echte resultaten. Jouw antwoord komt erbij zodra je het geeft.",
  jouwAntwoord: "Jouw antwoord, een {score}, staat erbij. Gemiddelde in dit voorbeeld: {gemiddelde} uit {totaal} antwoorden.",
  geefLinks: "Geef links je antwoord en kijk wat er gebeurt.",
  lijstNaam: "Voorbeeld: aantal antwoorden per cijfer",
  staafEen: "Cijfer {cijfer}: {n} antwoord",
  staafMeer: "Cijfer {cijfer}: {n} antwoorden",
  staafVanJou: ", waaronder dat van jou",
  geleStaaf: "Het gele staafje is jouw antwoord.",
  decimaal: ",",
};

export interface KiezerTeksten {
  /** de schrijfwijze van het bedrag */
  taal: Taal;
  kop: string;
  intro: string;
  pastBijJou: string;
  maandelijks: string;
  opAanvraag: string;
  /** met {n} */
  looptijd: string;
  periode: string;
  /** een pakket aan het begin van een zin, met {naam} */
  pakketNaam: string;
  /** met {namen}: één pakket dat niet uit de vragen volgt, of meer */
  andersEen: string;
  andersMeer: string;
  demoKnop: string;
  alleKnop: string;
  leeg: string;
  nogEen: string;
  /** met {n} */
  nogMeer: string;
  // ---- de vragen, keuzes en uitleg (lib/voorstel/smileyapp-kiezer.ts) ----
  vragen: { vragenlijsten: string; beoordelingen: string; gebruikers: string };
  /** de keuze voor precies één */
  enkel: { vragenlijsten: string; beoordelingen: string; gebruikers: string };
  /** met {van} en {tot} */
  tot: string;
  /** met {n} */
  meerDan: string;
  meerdereGebruikers: string;
  /** het teken tussen duizendtallen */
  duizendtal: string;
  /** tussen de laatste twee delen van een opsomming, met spaties */
  en: string;
  /** de drie dingen als woord in een zin */
  wat: { vragenlijsten: string; beoordelingen: string; gebruikers: string };
  /** een pakket midden in een zin, met {naam} */
  hetPakket: string;
  /** de onderdelen midden in een zin: alles in kleine letters, of alleen de eerste letter (Duits: zelfstandige naamwoorden houden hun hoofdletter) */
  kleineLetters: "alles" | "eerste";
  /** met {pakket} en {inhoud} */
  redenPast: string;
  /** met {maatwerk} */
  redenOnbekend: string;
  /** met {wat}, {namen} en {maatwerk} */
  redenTeVeel: string;
  /** met {namen} en {maatwerk} */
  redenCombinatie: string;
  /** de standaard-onderdelen in deze taal; een onderdeel dat hier niet in staat, blijft zoals het is */
  onderdelen: Readonly<Record<string, string>>;
}

export const KIEZER_NL: KiezerTeksten = {
  taal: "nl",
  kop: "Welk pakket past bij mij?",
  intro: "Drie vragen. De uitkomst volgt uit wat er in de pakketten zit.",
  pastBijJou: "Past bij jou",
  maandelijks: "maandelijks",
  opAanvraag: "Op aanvraag",
  looptijd: "Minimaal {n} maanden",
  periode: "Over welke periode het aantal beoordelingen geldt, staat niet bij het pakket. Vraag het na in de demo.",
  pakketNaam: "Het {naam}",
  andersEen: "{namen} werkt anders en volgt niet uit deze drie vragen: bekijk het bij alle pakketten.",
  andersMeer: "{namen} werken anders en volgen niet uit deze drie vragen: bekijk ze bij alle pakketten.",
  demoKnop: "Demo van dit pakket",
  alleKnop: "Bekijk alle pakketten",
  leeg: "Beantwoord de drie vragen, dan zie je hier welk pakket past.",
  nogEen: "Nog 1 vraag te gaan.",
  nogMeer: "Nog {n} vragen te gaan.",
  vragen: { vragenlijsten: "Hoeveel vragenlijsten wil je gebruiken?", beoordelingen: "Hoeveel beoordelingen verwacht je?", gebruikers: "Hoeveel mensen werken ermee?" },
  enkel: { vragenlijsten: "1 vragenlijst", beoordelingen: "1 beoordeling", gebruikers: "1 gebruiker" },
  tot: "{van} tot {tot}",
  meerDan: "Meer dan {n}",
  meerdereGebruikers: "Meerdere gebruikers",
  duizendtal: ".",
  en: " en ",
  wat: { vragenlijsten: "vragenlijsten", beoordelingen: "beoordelingen", gebruikers: "gebruikers" },
  hetPakket: "het {naam}",
  kleineLetters: "alles",
  redenPast: "In het {pakket} zitten {inhoud}. Dat is genoeg voor wat je invulde.",
  redenOnbekend: "Uit de pakketten is niet af te leiden wat bij deze aantallen past. Het {maatwerk} stel je zelf samen; neem contact op, dan kijken we mee.",
  redenTeVeel: "Je hebt meer {wat} nodig dan er in {namen} zitten. Het {maatwerk} stel je zelf samen, zodat je krijgt wat je nodig hebt.",
  redenCombinatie: "Deze combinatie past niet in één van de pakketten met vaste aantallen ({namen}). Het {maatwerk} stel je zelf samen, zodat je krijgt wat je nodig hebt.",
  onderdelen: {},
};
