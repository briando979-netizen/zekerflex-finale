import type { Locale } from "@/lib/i18n/config";
import type { AnswerAt, BundleId, NumberKind, OptionId, ShowOn } from "@/lib/telephony/plans";
import type { LineStatus } from "@/lib/telephony/lines";

// ---------------------------------------------------------------------------
// Teksten van "Je eigen werknummer" (/dashboard/telefonie) in de vijf talen van de werker-app (12 nov 2026).
// Puur bestand (geen prisma, kv of mail): de server-pagina kiest de taal en geeft het resultaat als `texts` aan
// <Telefonie>; zonder `texts` (werkgever, beheer) blijft alles Nederlands. Plaatshouders {naam} vult `vulIn`.
// De catalogus (nummersoorten, opties, bundels) staat per id, zodat lib/telephony/plans.ts de Nederlandse bron blijft.
// Machine-assisted translations: native-speaker review recommended.
// ---------------------------------------------------------------------------

export interface TelefonieTeksten {
  /** maanden voor "aangevraagd op 3 nov 2026" (vast formaat, geen toLocaleDateString) */
  maanden: string[];
  status: Record<LineStatus, string>;
  kopWerker: string;
  introWerker: string;
  kopBedrijf: string;
  introBedrijf: string;
  gratisAccount: string;
  jeNummers: string;
  nummerFallback: string;
  bundelNaam: string;
  aantalOpties: string;
  aangevraagdOp: string;
  perMaand: string;
  nummerOpAanvraag: string;
  annuleren: string;
  alleenBeheerder: string;
  stap1: string;
  soortNummer: string;
  direct: string;
  opAanvraag: string;
  huidigNummer: string;
  welkeStad: string;
  stap2: string;
  bundel: string;
  perMnd: string;
  zonderBundel: string;
  inBundel: string;
  stap3: string;
  opnemen: string;
  nummerTonen: string;
  binnenkort: string;
  doorschakelNaar: string;
  nogIets: string;
  magLeeg: string;
  notitieVoorbeeld: string;
  samenstelling: string;
  opAanvraagKort: string;
  perMaandKop: string;
  plusNummer: string;
  inclusief: string;
  tip: string;
  tipMetBundel: string;
  tipZonderBundel: string;
  zoDoen: string;
  bezig: string;
  aanvragen: string;
  gratisMetBetaal: string;
  gratisZonderBetaal: string;
  gratisOpAanvraag: string;
  nogNietBetalen: string;
  aanvraagMislukt: string;
  annulerenMislukt: string;
  aangevraagdGratis: string;
  aangevraagdBetaald: string;
  quote: { lijn: string; bundel: string };
  nummer: Record<NumberKind, { label: string; example: string; blurb: string }>;
  optie: Record<OptionId, { label: string; blurb: string }>;
  bundels: Record<BundleId, { label: string; blurb: string }>;
  antwoord: Record<AnswerAt, string>;
  tonen: Record<ShowOn, string>;
  terug: string;
}

export const TELEFONIE_NL: TelefonieTeksten = {
  maanden: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
  status: { aangevraagd: "Aangevraagd", in_behandeling: "Wordt klaargezet", actief: "Actief", geannuleerd: "Geannuleerd" },
  kopWerker: "Je eigen werknummer",
  introWerker: "Een apart nummer voor je werk, zodat je privénummer privé blijft. Met voicemail, doorschakelen of een AI-assistent die voor je opneemt.",
  kopBedrijf: "Zakelijk nummer & bellen",
  introBedrijf: "Eén nummer voor je bedrijf, met een AI-assistent, voicemail, keuzemenu of teamnummer. Kies een bundel of stel zelf samen.",
  gratisAccount: "Gratis voor jouw account: de lijn, de bundels en alle opties kosten € 0.",
  jeNummers: "Je nummers",
  nummerFallback: "Nummer",
  bundelNaam: "Bundel {naam}",
  aantalOpties: "{aantal} opties",
  aangevraagdOp: "aangevraagd op {datum}",
  perMaand: "{bedrag} per maand",
  nummerOpAanvraag: " + nummer op aanvraag",
  annuleren: "Annuleren",
  alleenBeheerder: "Alleen de hoofdbeheerder van je bedrijf kan een nummer aanvragen.",
  stap1: "1. Kies je nummer",
  soortNummer: "Soort nummer",
  direct: "Direct",
  opAanvraag: "Op aanvraag",
  huidigNummer: "Je huidige nummer",
  welkeStad: "Voor welke stad of welk netnummer?",
  stap2: "2. Kies een bundel of stel zelf samen",
  bundel: "Bundel",
  perMnd: " /mnd",
  zonderBundel: "Zonder bundel: alleen de lijn ({bedrag} /mnd) en losse opties",
  inBundel: "in bundel",
  stap3: "3. Waar neem je op, en waar laten we je nummer zien?",
  opnemen: "Opnemen",
  nummerTonen: "Nummer tonen",
  binnenkort: "binnenkort",
  doorschakelNaar: "Naar welk nummer schakelen we door?",
  nogIets: "Nog iets wat we moeten weten?",
  magLeeg: "(mag leeg)",
  notitieVoorbeeld: "Bijvoorbeeld je openingstijden of wie er in het team zit.",
  samenstelling: "Jouw samenstelling",
  opAanvraagKort: "op aanvraag",
  perMaandKop: "Per maand",
  plusNummer: "Plus het nummer zelf: dat bedrag hoor je binnen 2 werkdagen.",
  inclusief: "Inclusief {minuten} belminuten per maand, daarna {bedrag} per minuut. Maandelijks opzegbaar.",
  tip: "Tip: {wat} betaal je {bedrag} minder per maand.",
  tipMetBundel: "met de bundel {naam}",
  tipZonderBundel: "zonder bundel",
  zoDoen: "Zo doen",
  bezig: "Bezig…",
  aanvragen: "Aanvragen",
  gratisMetBetaal: "Gratis voor jouw account: de lijn en de opties kosten niets.",
  gratisZonderBetaal: "Gratis voor jouw account: we zetten je lijn klaar, er komt geen betaallink.",
  gratisOpAanvraag: "Gratis voor jouw account: de lijn en de opties kosten niets.",
  nogNietBetalen: "Je betaalt nog niets. We zetten je lijn klaar en sturen je dan de betaallink.",
  aanvraagMislukt: "Aanvragen lukte niet. Probeer het opnieuw.",
  annulerenMislukt: "Annuleren lukte niet.",
  aangevraagdGratis: "Aangevraagd. We nemen binnen een werkdag contact met je op.",
  aangevraagdBetaald: "Aangevraagd. We nemen binnen een werkdag contact met je op; je betaalt pas als je lijn klaarstaat.",
  quote: { lijn: "ZekerFlex-lijn", bundel: "Bundel {naam} (lijn + {aantal} opties)" },
  nummer: {
    eigen: { label: "Je eigen nummer houden", example: "06…, 085…, 020…", blurb: "Je houdt je huidige nummer. Zet bij je provider doorschakelen aan naar je ZekerFlex-lijn; dan werken alle opties op je eigen nummer." },
    mobiel097: { label: "Nieuw mobiel nummer", example: "097 010 …", blurb: "Een Nederlands mobiel nummer met bellen en sms. Meestal dezelfde of de volgende werkdag klaar." },
    mobiel06: { label: "Nieuw 06-nummer", example: "06 …", blurb: "Via een Nederlandse partner. Je hoort binnen 2 werkdagen wat het kost en wanneer het klaar is." },
    lokaal: { label: "Lokaal nummer", example: "020, 010, 050 …", blurb: "Met het netnummer van je stad. Daarvoor heb je een adres in die regio nodig." },
    zakelijk085: { label: "Landelijk nummer 085", example: "085 …", blurb: "Eén landelijk nummer, niet aan een stad gebonden." },
    zakelijk088: { label: "Landelijk nummer 088", example: "088 …", blurb: "Voor bedrijven met meerdere vestigingen." },
    gratis0800: { label: "Gratis nummer 0800", example: "0800 …", blurb: "Bellen is gratis voor je klant; de belminuten komen op jouw rekening." },
    overzetten: { label: "Bestaand nummer overzetten", example: "nummerbehoud", blurb: "Je nummer verhuist helemaal naar ZekerFlex. Dat duurt een paar weken; tot die tijd kun je doorschakelen." },
  },
  optie: {
    ai: { label: "AI-assistent", blurb: "Neemt dag en nacht op in het Nederlands of Engels, beantwoordt vragen over je bedrijf en plant terugbelafspraken. Je krijgt van elk gesprek een samenvatting." },
    voicemail: { label: "Voicemail in ZekerFlex", blurb: "Ingesproken berichten komen als tekst en geluid in je ZekerFlex-chat." },
    doorschakelen: { label: "Doorschakelen", blurb: "Gesprekken gaan naar je eigen telefoon, binnen je openingstijden. Daarbuiten voicemail of de AI-assistent." },
    keuzemenu: { label: "Keuzemenu", blurb: "\"Toets 1 voor planning, 2 voor administratie.\" Elke keuze komt bij de juiste persoon." },
    team: { label: "Teamnummer", blurb: "Meerdere telefoons gaan tegelijk over. Wie het eerst opneemt, heeft het gesprek." },
    opnemen: { label: "Gesprekken opnemen", blurb: "Met een melding aan de beller. Terug te luisteren en als tekst te lezen." },
    sms: { label: "Sms", blurb: "Sms'jes ontvangen en versturen vanuit ZekerFlex." },
  },
  bundels: {
    start: { label: "Start", blurb: "Altijd bereikbaar, zonder gedoe." },
    zakelijk: { label: "Zakelijk", blurb: "Voor een team met vaste tijden." },
    compleet: { label: "AI Compleet", blurb: "Nooit meer een gemiste klant." },
  },
  antwoord: { telefoon: "Op mijn eigen telefoon", ai: "De AI-assistent neemt eerst op", app: "In de ZekerFlex-app en op de computer" },
  tonen: { profiel: "Op mijn profiel in ZekerFlex", diensten: "Bij mijn diensten en vacatures", website: "Als belknop op mijn website", facturen: "Op mijn facturen" },
  terug: "← Terug",
};

const EN: TelefonieTeksten = {
  maanden: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  status: { aangevraagd: "Requested", in_behandeling: "Being set up", actief: "Active", geannuleerd: "Cancelled" },
  kopWerker: "Your own work number",
  introWerker: "A separate number for your work, so your private number stays private. With voicemail, call forwarding or an AI assistant that answers for you.",
  kopBedrijf: "Business number & calling",
  introBedrijf: "One number for your company, with an AI assistant, voicemail, menu or team number. Pick a bundle or build your own.",
  gratisAccount: "Free for your account: the line, the bundles and all options cost € 0.",
  jeNummers: "Your numbers",
  nummerFallback: "Number",
  bundelNaam: "{naam} bundle",
  aantalOpties: "{aantal} options",
  aangevraagdOp: "requested on {datum}",
  perMaand: "{bedrag} per month",
  nummerOpAanvraag: " + number on request",
  annuleren: "Cancel",
  alleenBeheerder: "Only your company's main administrator can request a number.",
  stap1: "1. Choose your number",
  soortNummer: "Type of number",
  direct: "Immediately",
  opAanvraag: "On request",
  huidigNummer: "Your current number",
  welkeStad: "For which city or area code?",
  stap2: "2. Choose a bundle or build your own",
  bundel: "Bundle",
  perMnd: " /mo",
  zonderBundel: "No bundle: just the line ({bedrag} /mo) and separate options",
  inBundel: "in bundle",
  stap3: "3. Where do you answer, and where do we show your number?",
  opnemen: "Answering",
  nummerTonen: "Show number",
  binnenkort: "coming soon",
  doorschakelNaar: "Which number do we forward to?",
  nogIets: "Anything else we should know?",
  magLeeg: "(optional)",
  notitieVoorbeeld: "For example your opening hours or who is in the team.",
  samenstelling: "Your setup",
  opAanvraagKort: "on request",
  perMaandKop: "Per month",
  plusNummer: "Plus the number itself: you will hear that amount within 2 working days.",
  inclusief: "Includes {minuten} call minutes per month, then {bedrag} per minute. Cancel monthly.",
  tip: "Tip: {wat} you pay {bedrag} less per month.",
  tipMetBundel: "with the {naam} bundle",
  tipZonderBundel: "without a bundle",
  zoDoen: "Do this",
  bezig: "Working…",
  aanvragen: "Request",
  gratisMetBetaal: "Free for your account: the line and the options cost nothing.",
  gratisZonderBetaal: "Free for your account: we set up your line, no payment link will follow.",
  gratisOpAanvraag: "Free for your account: the line and the options cost nothing.",
  nogNietBetalen: "You pay nothing yet. We set up your line and then send you the payment link.",
  aanvraagMislukt: "Requesting failed. Please try again.",
  annulerenMislukt: "Cancelling failed.",
  aangevraagdGratis: "Requested. We will contact you within one working day.",
  aangevraagdBetaald: "Requested. We will contact you within one working day; you only pay once your line is ready.",
  quote: { lijn: "ZekerFlex line", bundel: "{naam} bundle (line + {aantal} options)" },
  nummer: {
    eigen: { label: "Keep your own number", example: "06…, 085…, 020…", blurb: "You keep your current number. Set up call forwarding with your provider to your ZekerFlex line; then all options work on your own number." },
    mobiel097: { label: "New mobile number", example: "097 010 …", blurb: "A Dutch mobile number with calls and SMS. Usually ready the same or the next working day." },
    mobiel06: { label: "New 06 number", example: "06 …", blurb: "Through a Dutch partner. Within 2 working days you hear the price and when it is ready." },
    lokaal: { label: "Local number", example: "020, 010, 050 …", blurb: "With the area code of your city. You need an address in that region for this." },
    zakelijk085: { label: "National number 085", example: "085 …", blurb: "One national number, not tied to a city." },
    zakelijk088: { label: "National number 088", example: "088 …", blurb: "For companies with several locations." },
    gratis0800: { label: "Free number 0800", example: "0800 …", blurb: "Calling is free for your customer; the call minutes are billed to you." },
    overzetten: { label: "Transfer an existing number", example: "number porting", blurb: "Your number moves entirely to ZekerFlex. That takes a few weeks; until then you can forward calls." },
  },
  optie: {
    ai: { label: "AI assistant", blurb: "Answers day and night in Dutch or English, answers questions about your business and schedules callbacks. You get a summary of every call." },
    voicemail: { label: "Voicemail in ZekerFlex", blurb: "Recorded messages arrive as text and audio in your ZekerFlex chat." },
    doorschakelen: { label: "Call forwarding", blurb: "Calls go to your own phone during your opening hours. Outside them: voicemail or the AI assistant." },
    keuzemenu: { label: "Menu", blurb: "\"Press 1 for planning, 2 for administration.\" Every choice reaches the right person." },
    team: { label: "Team number", blurb: "Several phones ring at once. Whoever answers first takes the call." },
    opnemen: { label: "Record calls", blurb: "With a notice to the caller. Can be listened to and read as text." },
    sms: { label: "SMS", blurb: "Receive and send text messages from ZekerFlex." },
  },
  bundels: {
    start: { label: "Start", blurb: "Always reachable, no fuss." },
    zakelijk: { label: "Business", blurb: "For a team with fixed hours." },
    compleet: { label: "AI Complete", blurb: "Never miss a customer again." },
  },
  antwoord: { telefoon: "On my own phone", ai: "The AI assistant answers first", app: "In the ZekerFlex app and on the computer" },
  tonen: { profiel: "On my profile in ZekerFlex", diensten: "With my services and vacancies", website: "As a call button on my website", facturen: "On my invoices" },
  terug: "← Back",
};

const PL: TelefonieTeksten = {
  maanden: ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"],
  status: { aangevraagd: "Zgłoszony", in_behandeling: "W trakcie uruchamiania", actief: "Aktywny", geannuleerd: "Anulowany" },
  kopWerker: "Twój własny numer do pracy",
  introWerker: "Osobny numer do pracy, dzięki czemu Twój prywatny numer pozostaje prywatny. Z pocztą głosową, przekierowaniem lub asystentem AI, który odbiera za Ciebie.",
  kopBedrijf: "Numer firmowy i dzwonienie",
  introBedrijf: "Jeden numer dla Twojej firmy, z asystentem AI, pocztą głosową, menu wyboru lub numerem zespołu. Wybierz pakiet lub skomponuj własny.",
  gratisAccount: "Za darmo dla Twojego konta: linia, pakiety i wszystkie opcje kosztują 0 €.",
  jeNummers: "Twoje numery",
  nummerFallback: "Numer",
  bundelNaam: "Pakiet {naam}",
  aantalOpties: "opcje: {aantal}",
  aangevraagdOp: "zgłoszono {datum}",
  perMaand: "{bedrag} miesięcznie",
  nummerOpAanvraag: " + numer na zapytanie",
  annuleren: "Anuluj",
  alleenBeheerder: "Tylko główny administrator Twojej firmy może zamówić numer.",
  stap1: "1. Wybierz swój numer",
  soortNummer: "Rodzaj numeru",
  direct: "Od razu",
  opAanvraag: "Na zapytanie",
  huidigNummer: "Twój obecny numer",
  welkeStad: "Dla jakiego miasta lub numeru kierunkowego?",
  stap2: "2. Wybierz pakiet lub skomponuj własny",
  bundel: "Pakiet",
  perMnd: " /mies.",
  zonderBundel: "Bez pakietu: tylko linia ({bedrag} /mies.) i pojedyncze opcje",
  inBundel: "w pakiecie",
  stap3: "3. Gdzie odbierasz i gdzie pokazujemy Twój numer?",
  opnemen: "Odbieranie",
  nummerTonen: "Pokaż numer",
  binnenkort: "wkrótce",
  doorschakelNaar: "Na jaki numer przekierować?",
  nogIets: "Coś jeszcze, co powinniśmy wiedzieć?",
  magLeeg: "(może być puste)",
  notitieVoorbeeld: "Na przykład godziny otwarcia lub kto jest w zespole.",
  samenstelling: "Twój zestaw",
  opAanvraagKort: "na zapytanie",
  perMaandKop: "Miesięcznie",
  plusNummer: "Plus sam numer: tę kwotę poznasz w ciągu 2 dni roboczych.",
  inclusief: "W cenie {minuten} minut rozmów miesięcznie, potem {bedrag} za minutę. Wypowiedzenie co miesiąc.",
  tip: "Wskazówka: {wat} zapłacisz {bedrag} mniej miesięcznie.",
  tipMetBundel: "z pakietem {naam}",
  tipZonderBundel: "bez pakietu",
  zoDoen: "Zrób tak",
  bezig: "Chwileczkę…",
  aanvragen: "Zamów",
  gratisMetBetaal: "Za darmo dla Twojego konta: linia i opcje nic nie kosztują.",
  gratisZonderBetaal: "Za darmo dla Twojego konta: uruchamiamy Twoją linię, nie dostaniesz linku do płatności.",
  gratisOpAanvraag: "Za darmo dla Twojego konta: linia i opcje nic nie kosztują.",
  nogNietBetalen: "Na razie nic nie płacisz. Uruchamiamy Twoją linię i wysyłamy link do płatności.",
  aanvraagMislukt: "Zamówienie się nie udało. Spróbuj ponownie.",
  annulerenMislukt: "Anulowanie się nie udało.",
  aangevraagdGratis: "Zgłoszone. Skontaktujemy się z Tobą w ciągu jednego dnia roboczego.",
  aangevraagdBetaald: "Zgłoszone. Skontaktujemy się z Tobą w ciągu jednego dnia roboczego; płacisz dopiero, gdy linia będzie gotowa.",
  quote: { lijn: "Linia ZekerFlex", bundel: "Pakiet {naam} (linia + opcje: {aantal})" },
  nummer: {
    eigen: { label: "Zachowaj swój numer", example: "06…, 085…, 020…", blurb: "Zachowujesz obecny numer. Włącz u swojego operatora przekierowanie na linię ZekerFlex; wtedy wszystkie opcje działają na Twoim numerze." },
    mobiel097: { label: "Nowy numer komórkowy", example: "097 010 …", blurb: "Holenderski numer komórkowy z rozmowami i SMS-ami. Zwykle gotowy tego samego lub następnego dnia roboczego." },
    mobiel06: { label: "Nowy numer 06", example: "06 …", blurb: "Przez holenderskiego partnera. W ciągu 2 dni roboczych dowiesz się, ile kosztuje i kiedy będzie gotowy." },
    lokaal: { label: "Numer lokalny", example: "020, 010, 050 …", blurb: "Z numerem kierunkowym Twojego miasta. Potrzebny jest do tego adres w tym regionie." },
    zakelijk085: { label: "Numer krajowy 085", example: "085 …", blurb: "Jeden numer krajowy, niezwiązany z miastem." },
    zakelijk088: { label: "Numer krajowy 088", example: "088 …", blurb: "Dla firm z kilkoma oddziałami." },
    gratis0800: { label: "Numer bezpłatny 0800", example: "0800 …", blurb: "Dzwonienie jest bezpłatne dla Twojego klienta; minuty rozmów obciążają Ciebie." },
    overzetten: { label: "Przenieś istniejący numer", example: "przeniesienie numeru", blurb: "Twój numer przenosi się w całości do ZekerFlex. To trwa kilka tygodni; do tego czasu możesz przekierowywać połączenia." },
  },
  optie: {
    ai: { label: "Asystent AI", blurb: "Odbiera dniem i nocą po niderlandzku lub angielsku, odpowiada na pytania o Twoją firmę i planuje oddzwonienia. Z każdej rozmowy dostajesz podsumowanie." },
    voicemail: { label: "Poczta głosowa w ZekerFlex", blurb: "Nagrane wiadomości trafiają jako tekst i dźwięk do Twojego czatu ZekerFlex." },
    doorschakelen: { label: "Przekierowanie", blurb: "Rozmowy trafiają na Twój telefon w godzinach otwarcia. Poza nimi: poczta głosowa lub asystent AI." },
    keuzemenu: { label: "Menu wyboru", blurb: "\"Wciśnij 1 – planowanie, 2 – administracja.\" Każdy wybór trafia do właściwej osoby." },
    team: { label: "Numer zespołu", blurb: "Dzwoni kilka telefonów naraz. Kto pierwszy odbierze, ten prowadzi rozmowę." },
    opnemen: { label: "Nagrywanie rozmów", blurb: "Z komunikatem dla dzwoniącego. Można ich posłuchać i przeczytać jako tekst." },
    sms: { label: "SMS", blurb: "Odbieraj i wysyłaj SMS-y z ZekerFlex." },
  },
  bundels: {
    start: { label: "Start", blurb: "Zawsze osiągalny, bez kłopotu." },
    zakelijk: { label: "Biznes", blurb: "Dla zespołu ze stałymi godzinami." },
    compleet: { label: "AI Kompletny", blurb: "Żadnego straconego klienta." },
  },
  antwoord: { telefoon: "Na moim telefonie", ai: "Najpierw odbiera asystent AI", app: "W aplikacji ZekerFlex i na komputerze" },
  tonen: { profiel: "Na moim profilu w ZekerFlex", diensten: "Przy moich usługach i ofertach", website: "Jako przycisk połączenia na mojej stronie", facturen: "Na moich fakturach" },
  terug: "← Wstecz",
};

const RO: TelefonieTeksten = {
  maanden: ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"],
  status: { aangevraagd: "Solicitat", in_behandeling: "Se configurează", actief: "Activ", geannuleerd: "Anulat" },
  kopWerker: "Numărul tău de lucru",
  introWerker: "Un număr separat pentru munca ta, ca numărul tău privat să rămână privat. Cu mesagerie vocală, redirecționare sau un asistent AI care răspunde în locul tău.",
  kopBedrijf: "Număr de firmă și apeluri",
  introBedrijf: "Un singur număr pentru firma ta, cu asistent AI, mesagerie vocală, meniu sau număr de echipă. Alege un pachet sau compune-ți unul.",
  gratisAccount: "Gratuit pentru contul tău: linia, pachetele și toate opțiunile costă 0 €.",
  jeNummers: "Numerele tale",
  nummerFallback: "Număr",
  bundelNaam: "Pachetul {naam}",
  aantalOpties: "{aantal} opțiuni",
  aangevraagdOp: "solicitat la {datum}",
  perMaand: "{bedrag} pe lună",
  nummerOpAanvraag: " + număr la cerere",
  annuleren: "Anulează",
  alleenBeheerder: "Doar administratorul principal al firmei tale poate solicita un număr.",
  stap1: "1. Alege-ți numărul",
  soortNummer: "Tip de număr",
  direct: "Imediat",
  opAanvraag: "La cerere",
  huidigNummer: "Numărul tău actual",
  welkeStad: "Pentru ce oraș sau prefix?",
  stap2: "2. Alege un pachet sau compune-ți unul",
  bundel: "Pachet",
  perMnd: " /lună",
  zonderBundel: "Fără pachet: doar linia ({bedrag} /lună) și opțiuni separate",
  inBundel: "în pachet",
  stap3: "3. Unde răspunzi și unde arătăm numărul tău?",
  opnemen: "Răspuns",
  nummerTonen: "Arată numărul",
  binnenkort: "în curând",
  doorschakelNaar: "Către ce număr redirecționăm?",
  nogIets: "Mai este ceva ce ar trebui să știm?",
  magLeeg: "(poate rămâne gol)",
  notitieVoorbeeld: "De exemplu programul tău sau cine face parte din echipă.",
  samenstelling: "Alegerea ta",
  opAanvraagKort: "la cerere",
  perMaandKop: "Pe lună",
  plusNummer: "Plus numărul în sine: suma o afli în 2 zile lucrătoare.",
  inclusief: "Include {minuten} minute de apeluri pe lună, apoi {bedrag} pe minut. Se poate anula lunar.",
  tip: "Sfat: {wat} plătești cu {bedrag} mai puțin pe lună.",
  tipMetBundel: "cu pachetul {naam}",
  tipZonderBundel: "fără pachet",
  zoDoen: "Fă asta",
  bezig: "Se lucrează…",
  aanvragen: "Solicită",
  gratisMetBetaal: "Gratuit pentru contul tău: linia și opțiunile nu costă nimic.",
  gratisZonderBetaal: "Gratuit pentru contul tău: îți configurăm linia, nu primești link de plată.",
  gratisOpAanvraag: "Gratuit pentru contul tău: linia și opțiunile nu costă nimic.",
  nogNietBetalen: "Încă nu plătești nimic. Îți configurăm linia și apoi îți trimitem linkul de plată.",
  aanvraagMislukt: "Solicitarea nu a reușit. Încearcă din nou.",
  annulerenMislukt: "Anularea nu a reușit.",
  aangevraagdGratis: "Solicitat. Te contactăm într-o zi lucrătoare.",
  aangevraagdBetaald: "Solicitat. Te contactăm într-o zi lucrătoare; plătești abia când linia este gata.",
  quote: { lijn: "Linia ZekerFlex", bundel: "Pachetul {naam} (linie + {aantal} opțiuni)" },
  nummer: {
    eigen: { label: "Păstrează-ți numărul", example: "06…, 085…, 020…", blurb: "Îți păstrezi numărul actual. Activează la operator redirecționarea către linia ta ZekerFlex; atunci toate opțiunile funcționează pe numărul tău." },
    mobiel097: { label: "Număr mobil nou", example: "097 010 …", blurb: "Un număr mobil olandez cu apeluri și SMS. De obicei gata în aceeași zi lucrătoare sau în următoarea." },
    mobiel06: { label: "Număr 06 nou", example: "06 …", blurb: "Printr-un partener olandez. În 2 zile lucrătoare afli cât costă și când e gata." },
    lokaal: { label: "Număr local", example: "020, 010, 050 …", blurb: "Cu prefixul orașului tău. Pentru asta ai nevoie de o adresă în acea regiune." },
    zakelijk085: { label: "Număr național 085", example: "085 …", blurb: "Un singur număr național, nelegat de un oraș." },
    zakelijk088: { label: "Număr național 088", example: "088 …", blurb: "Pentru firme cu mai multe sedii." },
    gratis0800: { label: "Număr gratuit 0800", example: "0800 …", blurb: "Apelul este gratuit pentru clientul tău; minutele de apel se facturează ție." },
    overzetten: { label: "Transferă un număr existent", example: "portare număr", blurb: "Numărul tău se mută complet la ZekerFlex. Durează câteva săptămâni; până atunci poți redirecționa apelurile." },
  },
  optie: {
    ai: { label: "Asistent AI", blurb: "Răspunde zi și noapte în olandeză sau engleză, răspunde la întrebări despre firma ta și programează apeluri înapoi. Primești un rezumat al fiecărei convorbiri." },
    voicemail: { label: "Mesagerie vocală în ZekerFlex", blurb: "Mesajele vocale ajung ca text și sunet în chatul tău ZekerFlex." },
    doorschakelen: { label: "Redirecționare", blurb: "Apelurile merg la telefonul tău, în programul tău. În afara lui: mesagerie vocală sau asistentul AI." },
    keuzemenu: { label: "Meniu de opțiuni", blurb: "\"Apasă 1 pentru planificare, 2 pentru administrație.\" Fiecare alegere ajunge la persoana potrivită." },
    team: { label: "Număr de echipă", blurb: "Mai multe telefoane sună simultan. Cine răspunde primul preia apelul." },
    opnemen: { label: "Înregistrarea apelurilor", blurb: "Cu o notificare către apelant. Se pot asculta și citi ca text." },
    sms: { label: "SMS", blurb: "Primește și trimite SMS-uri din ZekerFlex." },
  },
  bundels: {
    start: { label: "Start", blurb: "Mereu disponibil, fără bătăi de cap." },
    zakelijk: { label: "Business", blurb: "Pentru o echipă cu program fix." },
    compleet: { label: "AI Complet", blurb: "Niciun client pierdut." },
  },
  antwoord: { telefoon: "Pe telefonul meu", ai: "Asistentul AI răspunde primul", app: "În aplicația ZekerFlex și pe calculator" },
  tonen: { profiel: "Pe profilul meu din ZekerFlex", diensten: "La serviciile și anunțurile mele", website: "Ca buton de apel pe site-ul meu", facturen: "Pe facturile mele" },
  terug: "← Înapoi",
};

const UK: TelefonieTeksten = {
  maanden: ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"],
  status: { aangevraagd: "Подано запит", in_behandeling: "Налаштовується", actief: "Активний", geannuleerd: "Скасовано" },
  kopWerker: "Твій власний робочий номер",
  introWerker: "Окремий номер для роботи, щоб твій приватний номер залишався приватним. З голосовою поштою, переадресацією або ШІ-асистентом, який відповідає за тебе.",
  kopBedrijf: "Бізнес-номер і дзвінки",
  introBedrijf: "Один номер для твоєї компанії, з ШІ-асистентом, голосовою поштою, меню вибору або командним номером. Обери пакет або склади власний.",
  gratisAccount: "Безкоштовно для твого облікового запису: лінія, пакети та всі опції коштують 0 €.",
  jeNummers: "Твої номери",
  nummerFallback: "Номер",
  bundelNaam: "Пакет {naam}",
  aantalOpties: "опцій: {aantal}",
  aangevraagdOp: "запит подано {datum}",
  perMaand: "{bedrag} на місяць",
  nummerOpAanvraag: " + номер за запитом",
  annuleren: "Скасувати",
  alleenBeheerder: "Лише головний адміністратор твоєї компанії може замовити номер.",
  stap1: "1. Обери свій номер",
  soortNummer: "Тип номера",
  direct: "Одразу",
  opAanvraag: "За запитом",
  huidigNummer: "Твій поточний номер",
  welkeStad: "Для якого міста чи коду зони?",
  stap2: "2. Обери пакет або склади власний",
  bundel: "Пакет",
  perMnd: " /міс.",
  zonderBundel: "Без пакета: лише лінія ({bedrag} /міс.) та окремі опції",
  inBundel: "у пакеті",
  stap3: "3. Де ти відповідаєш і де ми показуємо твій номер?",
  opnemen: "Відповідь",
  nummerTonen: "Показувати номер",
  binnenkort: "незабаром",
  doorschakelNaar: "На який номер переадресовувати?",
  nogIets: "Ще щось, що нам варто знати?",
  magLeeg: "(можна залишити порожнім)",
  notitieVoorbeeld: "Наприклад, твої години роботи або хто в команді.",
  samenstelling: "Твій набір",
  opAanvraagKort: "за запитом",
  perMaandKop: "На місяць",
  plusNummer: "Плюс сам номер: цю суму ти дізнаєшся протягом 2 робочих днів.",
  inclusief: "У вартість входить {minuten} хвилин дзвінків на місяць, далі {bedrag} за хвилину. Можна скасувати щомісяця.",
  tip: "Порада: {wat} ти платиш на {bedrag} менше на місяць.",
  tipMetBundel: "з пакетом {naam}",
  tipZonderBundel: "без пакета",
  zoDoen: "Зробити так",
  bezig: "Зачекай…",
  aanvragen: "Замовити",
  gratisMetBetaal: "Безкоштовно для твого облікового запису: лінія та опції нічого не коштують.",
  gratisZonderBetaal: "Безкоштовно для твого облікового запису: ми налаштуємо лінію, посилання на оплату не буде.",
  gratisOpAanvraag: "Безкоштовно для твого облікового запису: лінія та опції нічого не коштують.",
  nogNietBetalen: "Поки що ти нічого не платиш. Ми налаштуємо лінію і надішлемо посилання на оплату.",
  aanvraagMislukt: "Замовити не вдалося. Спробуй ще раз.",
  annulerenMislukt: "Скасувати не вдалося.",
  aangevraagdGratis: "Запит подано. Ми зв'яжемося з тобою протягом одного робочого дня.",
  aangevraagdBetaald: "Запит подано. Ми зв'яжемося з тобою протягом одного робочого дня; платиш лише тоді, коли лінія буде готова.",
  quote: { lijn: "Лінія ZekerFlex", bundel: "Пакет {naam} (лінія + опцій: {aantal})" },
  nummer: {
    eigen: { label: "Залишити свій номер", example: "06…, 085…, 020…", blurb: "Ти залишаєш свій поточний номер. Увімкни в оператора переадресацію на лінію ZekerFlex; тоді всі опції працюють на твоєму номері." },
    mobiel097: { label: "Новий мобільний номер", example: "097 010 …", blurb: "Нідерландський мобільний номер із дзвінками та SMS. Зазвичай готовий того ж або наступного робочого дня." },
    mobiel06: { label: "Новий номер 06", example: "06 …", blurb: "Через нідерландського партнера. Протягом 2 робочих днів ти дізнаєшся вартість і коли він буде готовий." },
    lokaal: { label: "Місцевий номер", example: "020, 010, 050 …", blurb: "З кодом зони твого міста. Для цього потрібна адреса в тому регіоні." },
    zakelijk085: { label: "Загальнонаціональний номер 085", example: "085 …", blurb: "Один загальнонаціональний номер, не прив'язаний до міста." },
    zakelijk088: { label: "Загальнонаціональний номер 088", example: "088 …", blurb: "Для компаній з кількома філіями." },
    gratis0800: { label: "Безкоштовний номер 0800", example: "0800 …", blurb: "Дзвінки безкоштовні для твого клієнта; хвилини дзвінків оплачуєш ти." },
    overzetten: { label: "Перенести наявний номер", example: "перенесення номера", blurb: "Твій номер повністю переходить до ZekerFlex. Це триває кілька тижнів; до того часу можна переадресовувати." },
  },
  optie: {
    ai: { label: "ШІ-асистент", blurb: "Відповідає вдень і вночі нідерландською або англійською, відповідає на запитання про твою компанію й планує передзвони. Про кожну розмову ти отримуєш підсумок." },
    voicemail: { label: "Голосова пошта в ZekerFlex", blurb: "Записані повідомлення приходять текстом і звуком у твій чат ZekerFlex." },
    doorschakelen: { label: "Переадресація", blurb: "Дзвінки йдуть на твій телефон у години роботи. Поза ними: голосова пошта або ШІ-асистент." },
    keuzemenu: { label: "Меню вибору", blurb: "\"Натисни 1 для планування, 2 для адміністрації.\" Кожен вибір потрапляє до потрібної особи." },
    team: { label: "Командний номер", blurb: "Дзвонить одразу кілька телефонів. Хто першим відповість, той веде розмову." },
    opnemen: { label: "Запис розмов", blurb: "З повідомленням для того, хто дзвонить. Можна прослухати й прочитати як текст." },
    sms: { label: "SMS", blurb: "Отримуй і надсилай SMS із ZekerFlex." },
  },
  bundels: {
    start: { label: "Старт", blurb: "Завжди на зв'язку, без клопоту." },
    zakelijk: { label: "Бізнес", blurb: "Для команди з постійним графіком." },
    compleet: { label: "ШІ Повний", blurb: "Жодного втраченого клієнта." },
  },
  antwoord: { telefoon: "На моєму телефоні", ai: "Спершу відповідає ШІ-асистент", app: "У застосунку ZekerFlex і на комп'ютері" },
  tonen: { profiel: "У моєму профілі в ZekerFlex", diensten: "Біля моїх послуг і вакансій", website: "Як кнопка дзвінка на моєму сайті", facturen: "На моїх рахунках" },
  terug: "← Назад",
};

export const TELEFONIE_TEKSTEN: Record<Locale, TelefonieTeksten> = { nl: TELEFONIE_NL, en: EN, pl: PL, ro: RO, uk: UK };
