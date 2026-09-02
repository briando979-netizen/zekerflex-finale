import type { DbaGroup } from "@/lib/kennis/dba";

// ---------------------------------------------------------------------------
// Helpcentrum voor opdrachtgevers. Herschreven uit de YoungOnes-klanthelp,
// ontmerkt (platform → ZekerFlex, gig/optreden → dienst/klus, werknemer → kracht),
// bedragen en flows volgen het ZekerFlex-model. Algemene informatie.
// ---------------------------------------------------------------------------

export const WERKGEVER_HELP_GROUPS: DbaGroup[] = [
  {
    category: "Account, profiel en facturatie",
    blurb: "Inloggen, je bedrijfsprofiel, gebruikers en hoe je je facturen ontvangt.",
    items: [
      {
        q: "Hoe log ik in?",
        a: "Heb je nog geen account? Maak er eerst een aan. Na registratie ontvang je een e-mail om je account te bevestigen. Daarna ga je naar de inlogpagina, vul je e-mailadres en wachtwoord in en klik je op 'Inloggen'. Je landt direct op je dashboard.",
      },
      {
        q: "Wat staat er op mijn bedrijfsprofiel?",
        a: "Je profiel is het visitekaartje van je organisatie — het is wat krachten laat reageren op je diensten.",
        points: [
          "Logo: maak je merk herkenbaar.",
          "Omslagfoto: laat de sfeer van je organisatie zien.",
          "Bio: beschrijf kort wat je doet en wat voor diensten je meestal plaatst.",
          "Contactpersoon: stel de primaire contactpersoon in onder Bedrijfsprofiel.",
          "Factuur-e-mailadres: het adres in je factuurgegevens is waar je alle facturen ontvangt; je kunt dit altijd bijwerken.",
        ],
      },
      {
        q: "Wat zijn de voorwaarden om als opdrachtgever te starten?",
        a: "Om het platform veilig en professioneel te houden, controleren we drie dingen voordat je je eerste dienst kunt plaatsen. We streven ernaar je registratie op dezelfde werkdag te beoordelen.",
        points: [
          "KvK: je bedrijf is ingeschreven bij de Kamer van Koophandel.",
          "Bedrijfstype: je bent geen wervings-/uitzendbureau of eenmanszaak (uitzonderingen bespreken we graag — stuur ons een bericht).",
          "Online aanwezigheid: een zakelijk e-mailadres en een volledige website, niet alleen een landingspagina.",
        ],
        link: { href: "mailto:sales@zekerflex.com", label: "Vraag over de voorwaarden? Neem contact op" },
      },
      {
        q: "Hoe stel ik gebruikers en rollen in voor verschillende afdelingen?",
        a: "Heb je meerdere afdelingen of locaties? Voeg per afdeling een subaccount toe met één of meer gebruikers. Je bepaalt zelf per subaccount welke rechten iemand heeft.",
        points: [
          "Beheerder: beheert het hoofdaccount, heeft alle rechten en kan alle subaccounts wijzigen. Je kunt meerdere beheerders instellen.",
          "Gebruiker: krijgt alleen de rechten die je toekent — bijvoorbeeld diensten plaatsen, locatiebeheer, krachten accepteren/wijzigen/opzeggen, uren controleren en beoordelen, of favoriete en geblokkeerde krachten beheren.",
          "Contactpersoon per dienst: je koppelt aan elke dienst een contactpersoon. Die heeft geen login nodig en ontvangt per e-mail alle details, inclusief de aanwezigheidslijst.",
        ],
      },
      {
        q: "Hoe werk ik met PO-nummers en kostenplaatsen?",
        a: "Om je facturatie overzichtelijk te houden kun je werken met PO-nummers / kostenplaatsen. Dan ontvang je een aparte factuur per afdeling, locatie of entiteit in plaats van alles op één factuur.",
        points: [
          "Instellen: kies bij je factuurgegevens de optie 'aparte factuur per kostenplaats' en voer je PO-nummers in.",
          "Per dienst: bij het plaatsen van een dienst kies je welk PO-nummer erbij hoort. Dat bepaalt op welke factuur de dienst terechtkomt.",
          "Subaccounts: je kunt PO-nummers koppelen aan de juiste subaccounts, zodat daar alleen de geldige nummers beschikbaar zijn en er geen fouten worden gemaakt.",
        ],
        link: { href: "/werkgever/facturen#factuurgegevens", label: "Naar je factuurgegevens" },
      },
    ],
  },
  {
    category: "Een dienst plaatsen",
    blurb: "Van je eerste dienst tot een serie over meerdere dagen.",
    items: [
      {
        q: "Hoe werkt ZekerFlex, in het kort?",
        a: "Je plaatst een dienst en krachten reageren. Zo heb je altijd genoeg flexibele handen aan dek.",
        points: [
          "Plaats een dienst: datum, uurtarief en een korte beschrijving. Publiceren en klaar.",
          "Krachten reageren: meestal binnen enkele minuten.",
          "Kies de beste kracht: bekijk motivatie, reviews en ervaring — één klik.",
          "Aan het werk: de kracht komt opdagen; kan die niet, dan regelt die zelf een vervanger.",
          "Keur de uren goed: na de dienst dient de kracht de uren in, jij controleert en beoordeelt elkaar.",
          "Facturatie: wij regelen de betalingen aan de krachten. Je ontvangt twee keer per week één verzamelfactuur.",
        ],
      },
      {
        q: "Hoe plaats ik een dienst (ook voor meerdere dagen)?",
        a: "Ga naar 'Diensten' en klik op 'Nieuwe dienst'. Je kunt een dienst tot minstens een uur van tevoren plannen.",
        points: [
          "Titel: het eerste wat een kracht ziet. Vermeld de rol en de locatie, maak het pakkend.",
          "Beschrijving: wat je zoekt, de taken (met opsommingstekens), vaardigheden en kledingvoorschriften. Kort en concreet, geen jargon. Noem wat de dienst aantrekkelijk maakt.",
          "Extra informatie: gegevens die alleen zichtbaar zijn voor de gekozen kracht, zoals een ontmoetingspunt.",
          "Branche, rol en vaardigheden: kies uit de lijst; mis je iets, zet het in de beschrijving.",
          "Annuleringstermijn: 24, 48 of 72 uur, 1 of 2 weken. Binnen die termijn kun je een gekozen kracht niet zonder gevolgen opzeggen.",
          "Meerdere dagen: selecteer de data in de kalender. Andere tijden op een dag? Klik op de groene plus voor een extra dienst en pas de tijden aan.",
        ],
      },
      {
        q: "Hoe bepaal ik het uurtarief en hoe onderhandel ik?",
        a: "Als opdrachtgever bepaal je zelf het uurtarief per dienst. Een kracht kan via de app een tegenbod doen als die een ander tarief passender vindt; dat zie je terug in je overzicht van reacties.",
        points: [
          "Zie je een goede match maar is het tarief te hoog? Neem contact op en onderhandel. Zodra jullie het eens zijn, accepteer je de kracht.",
          "Een dringende dienst, avond of weekend? Een hoger tarief levert meer reacties op.",
        ],
      },
      {
        q: "Waar is ZekerFlex actief?",
        a: "In heel Nederland. We zorgen dat er in elke regio en sector genoeg geverifieerde krachten beschikbaar zijn, zodat je altijd de juiste persoon voor je dienst vindt.",
      },
    ],
  },
  {
    category: "Een kracht kiezen",
    blurb: "Waar je op let, de overeenkomst en aanvullende documenten.",
    items: [
      {
        q: "Hoe kies ik de beste kracht?",
        a: "Zodra krachten reageren, bekijk je hun profiel. Let op:",
        points: [
          "Persoonlijke gegevens: naam, leeftijd, contactgegevens en foto — een eerste indruk. Twijfel je? Bel even.",
          "Vervangingen en voltooide diensten: het percentage diensten dat de kracht zelf heeft gedaan. Hoog = betrouwbaar.",
          "Reviews: gemiddelde scores en sterke punten van eerdere opdrachtgevers.",
          "Vaardigheden: feedback met duim omhoog/omlaag op specifieke skills.",
          "Werkervaring: door de kracht zelf toegevoegd, als een cv.",
          "Kies op tijd: wacht een kracht te lang op antwoord, dan kan die de reactie intrekken.",
        ],
      },
      {
        q: "Hoe kies ik een andere kracht voor een dienst?",
        a: "Zolang de annuleringstermijn niet is verstreken, kun je de gekozen kracht zonder gevolgen opzeggen en de dienst opnieuw openzetten. Alle passende krachten krijgen dan een melding om te reageren. Is de termijn verstreken, dan kun je niet meer gratis opzeggen.",
      },
      {
        q: "Hoe ziet de overeenkomst tussen opdrachtgever en kracht eruit?",
        a: "Zodra je een kracht accepteert, wordt automatisch een modelovereenkomst gegenereerd en digitaal ondertekend. Daarin staan het uurtarief, de uren, de locatie en de vaardigheden. Beide partijen kunnen die altijd inzien.",
        points: [
          "Waarom is ZekerFlex geen partij? De Belastingdienst staat geen driepartijenovereenkomsten toe, en we zijn een faciliterend platform waar opdrachtgever en kracht elkaar vinden. We blijven wel betrokken via onze gebruiksvoorwaarden.",
        ],
      },
      {
        q: "Kan ik een kracht een VOG of extra verklaring laten ondertekenen?",
        a: "Ja. Je kunt een kracht vragen een VOG (Verklaring Omtrent het Gedrag) of een eigen verklaring te ondertekenen om fraude en ongewenste situaties te voorkomen.",
        points: [
          "Sjabloon: we kunnen een aanpasbaar sjabloon voor je maken — vraag ernaar via de support-chat.",
          "Verantwoordelijkheid: je bent zelf verantwoordelijk voor deze documenten; ZekerFlex is dat niet. We treden wel op als een kracht onze gebruiksvoorwaarden overtreedt.",
          "Toevoegen: zet je document bij de 'extra informatie' van de dienst of deel het rechtstreeks met de kracht.",
        ],
      },
    ],
  },
  {
    category: "Tijdens en na de dienst",
    blurb: "Uren goedkeuren, beoordelen, verlengen of eerder stoppen, en extra kosten.",
    items: [
      {
        q: "Hoe werkt het goedkeuren van uren?",
        a: "Na de dienst dient de kracht de uren in via de app. Je hebt drie opties:",
        points: [
          "Goedkeuren: eens met de uren? Vink af. Geef daarna een sterbeoordeling, beoordeel vaardigheden en laat feedback achter. Werkten meerdere krachten aan één dienst? Je keurt alles tegelijk goed.",
          "Afkeuren: niet eens met de uren? Geef een duidelijke reden en een tegenvoorstel voor het juiste aantal uren. Je beoordeelt de kracht nog steeds.",
          "Niet voltooid: werkte de kracht helemaal niet? Meld dat, met uitleg en of jullie het daarover eens zijn.",
          "Termijn: je hebt zeven dagen om te controleren. Na goedkeuring gaat de dienst naar 'Gearchiveerd', waar je de uren en beoordelingen altijd terugvindt.",
        ],
      },
      {
        q: "Hoe werkt het beoordelingssysteem?",
        a: "Na elke dienst beoordelen opdrachtgever en kracht elkaar met 1 tot 5 sterren. Gemiddelde scores zijn zichtbaar op het platform, zodat alles transparant blijft.",
        points: [
          "Vaardigheden: je kunt de kracht apart beoordelen op specifieke skills. Dat is zichtbaar op het profiel.",
          "Geschreven feedback: alleen zichtbaar voor de kracht en de opdrachtgever die bij de dienst betrokken waren.",
          "Geef altijd een eerlijke beoordeling — andere opdrachtgevers vertrouwen erop.",
        ],
      },
      {
        q: "Kan ik een kracht eerder naar huis sturen of de dienst verlengen?",
        a: "Eerder naar huis sturen kan, maar de kracht heeft dan recht op 50% van de afgesproken uren (op drie uitzonderingen in het annuleringsbeleid na). Verlengen kan alleen als jullie het er samen over eens zijn; de kracht mag de extra uren dan factureren.",
        points: [
          "Andere afspraken over werktijden? Bevestig die altijd schriftelijk — een bericht via de app of WhatsApp is genoeg.",
        ],
      },
      {
        q: "Kan een kracht extra kosten claimen?",
        a: "Nee, standaard niet. De kracht is niet je werknemer, dus je hebt geen verplichtingen zoals vakantiegeld, reis- of parkeerkosten, verzekering of maaltijden. Je betaalt alleen de gewerkte uren; extra kosten horen in het uurtarief.",
        points: [
          "Wil je toch iets vergoeden? Vraag je contactpersoon de optie 'extra kosten' aan te zetten. Let op: die blijft daarna beschikbaar, ook voor diensten zonder extra kosten.",
        ],
      },
      {
        q: "Kan een kracht langer of vaker voor mij werken?",
        a: "Ja. Gebruik de kalenderfunctie om diensten voor een langere periode te plaatsen, of bel de kracht om afspraken te maken.",
        points: [
          "Je krijgt een melding zodra een kracht 600 uur voor jou bereikt, gemeten over een voortschrijdende periode van 12 maanden.",
          "Wissel af met verschillende krachten om het risico op schijnzelfstandigheid te beperken. Zie het Wet DBA-kenniscentrum.",
        ],
      },
    ],
  },
  {
    category: "Als er iets misgaat",
    blurb: "Niet-voltooide diensten, een verkeerde melding, of een kracht waar je ontevreden over bent.",
    items: [
      {
        q: "Wat als een kracht een dienst niet heeft voltooid?",
        a: "Meld het, zodat de kracht geen uren kan indienen en het platform transparant blijft. Ga naar 'Diensten' → 'Uren controleren', open de dienst en de kracht en kies 'Niet voltooid'. Het voltooiingspercentage van de kracht daalt.",
      },
      {
        q: "Hoe werkt een 'klus niet voltooid'-melding?",
        a: "Heeft een kracht een dienst niet afgemaakt en geen (tijdige) vervanging geregeld, dan gelden over een periode van zes maanden deze gevolgen:",
        points: [
          "1e keer: officiële waarschuwing.",
          "2e keer: twee weken niet kunnen reageren op nieuwe diensten.",
          "3e keer: één maand niet kunnen reageren op nieuwe diensten.",
          "4e keer: drie maanden niet kunnen reageren op nieuwe diensten.",
          "Uitzondering: waren jullie het erover eens dat vervanging niet nodig was, dan kan de kracht zich vooraf terugtrekken en beslis jij of je het zonder gevolgen afrondt.",
        ],
      },
      {
        q: "Ik heb per ongeluk 'niet voltooid' gemeld — wat nu?",
        a: "Werkte de kracht wel? Neem contact op via de support-chat of mail support@zekerflex.com, dan zetten we de uren voor je open. Werkte de kracht niet, maar vind je de gevolgen niet terecht? Neem contact op met je contactpersoon. Voorkom dit voortaan door de kracht zelf te laten annuleren.",
      },
      {
        q: "Ik ben ontevreden over een kracht — wat kan ik doen?",
        a: "Neem deze stappen:",
        points: [
          "Laat een eerlijke review achter na het goedkeuren van de uren, met een korte uitleg.",
          "Blokkeer de kracht via het profiel als je niet meer wilt dat die je diensten ziet.",
          "Meld de kracht via het vlagpictogram op het profiel bij ongepast gedrag — we nemen contact op en nemen zo nodig maatregelen.",
          "Zet je regels (bijvoorbeeld over te laat komen) vooraf duidelijk in de omschrijving, zodat je erop kunt terugvallen.",
        ],
      },
      {
        q: "Er is een probleem met het platform — waar meld ik dat?",
        a: "Neem direct contact op met je contactpersoon bij ZekerFlex, mail support@zekerflex.com of open de chat rechtsonder in het scherm. Onze helpdesk pakt verzoeken meestal binnen anderhalf uur op.",
      },
    ],
  },
];

export function werkgeverHelpFlat(): { q: string; a: string }[] {
  return WERKGEVER_HELP_GROUPS.flatMap((g) =>
    g.items.map((it) => ({
      q: it.q,
      a: it.points ? `${it.a} ${it.points.join(" ")}` : it.a,
    })),
  );
}
