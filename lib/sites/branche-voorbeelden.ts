import type { Block, BlockProps, BlockType, Company, Item, Page, Theme } from "@/lib/sites/types";
import { newBlock } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Voorbeeldwebsites per branche (4 nov 2026, opdracht van de eigenaar): voor elke
// branche een complete site in de stijl van schwarzwald.zekerflex.com, met alles
// wat zo'n site kan: opening met foto's, aanbod als fototegels, waarom wij, zo
// werkt het, foto's, reviews, openingstijden, veelgestelde vragen, contact met
// formulier, en "werken bij" met de diensten op ZekerFlex waar dat past. Geen
// webshop, behalve bij de bakkerij (lib/sites/demo.ts). Elk bedrijf bestaat niet
// (de balk zegt het), geen telefoonnummer of e-mail (die zouden van iemand anders
// kunnen zijn); reviews heten "voorbeeld". Foto's: Pexels (vrije licentie, geen
// vermelding vereist), één keer opgehaald en bij ons bewaard (lib/sites/branche-demo.ts).
// Puur: alleen gegevens en pagina's.
// ---------------------------------------------------------------------------

export interface BrancheFoto {
  /** het nummer van de foto op Pexels */
  pexels: number;
  alt: string;
}

export interface BrancheVoorbeeld {
  /** de branche (= een sjabloon van de websitebouwer, SECTOR_TEMPLATES) */
  id: "horeca" | "bouw" | "schoonmaak" | "logistiek" | "zorg" | "algemeen" | "kapper" | "garage";
  /** wat de bezoeker van /voorbeeldsites ziet */
  label: string;
  omschrijving: string;
  /** de foto op de kaart van /voorbeeldsites, als er geen klus-kaartfoto van de branche is (public/shifts/<id>.jpg) */
  kaart?: string | undefined;
  /** het adres: slugify(bedrijf.naam) */
  slug: string;
  bedrijf: Company;
  theme: Theme;
  fotos: Record<string, BrancheFoto>;
  hero: { kop: string; tekst: string; knop: string; foto: string };
  over: { kop: string; tekst: string; foto: string; lang: string; lang2Kop: string; lang2: string };
  aanbod: { kop: string; intro: string; items: (Item & { foto: string })[] };
  usps: { kop: string; items: Item[] };
  stappen: { kop: string; items: Item[] };
  galerij: { kop: string; fotos: string[] };
  reviews: { naam: string; tekst: string }[];
  uren: { kop: string; regels: { dag: string; tijd: string }[] };
  faq: { vraag: string; antwoord: string }[];
  cta: { kop: string; tekst: string; knop: string };
  contact: { kop: string; tekst: string };
  /** "werken bij": de open diensten van het bedrijf op ZekerFlex */
  werken?: { kop: string; tekst: string } | undefined;
  /** online een tafel reserveren (lib/sites/reserveren.ts): de knoppen gaan dan naar …/reserveren */
  reserveren?: Pick<BlockProps["reserveren"], "kop" | "tekst" | "tijden" | "maxGroep" | "maxGasten"> | undefined;
}

export const pexelsUrl = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=2000`;

const PLAATS = "Zonnedorp";
const bedrijf = (naam: string): Company => ({ naam, kvk: "", straat: "", postcode: "", plaats: PLAATS, telefoon: "", email: "" });
const stijl = (kleur: string, accent: string): Theme => ({ kleur, accent, lettertype: "modern", hoeken: "rond", stijl: "beleving" });

export const BRANCHE_VOORBEELDEN: BrancheVoorbeeld[] = [
  {
    id: "horeca",
    label: "Restaurant en café",
    omschrijving: "Brasserie met lunch, diner, borrel en feesten, met openingstijden en een werken-bij-pagina.",
    slug: "brasserie-het-plein",
    bedrijf: bedrijf("Brasserie Het Plein"),
    theme: stijl("#5C2E22", "#F2A541"),
    fotos: {
      zaal: { pexels: 23877500, alt: "Een lichte brasserie met houten tafels en hanglampen" },
      opmaken: { pexels: 2403392, alt: "Een chef maakt een bord op in een donkere keuken" },
      terras: { pexels: 5491012, alt: "Cocktails en hapjes op een terras aan het water" },
      borden: { pexels: 17237180, alt: "Twee borden met vlees en groente worden opgediend" },
      chef: { pexels: 1267320, alt: "Een chef legt een gerecht op houten plankjes" },
      proosten: { pexels: 1269035, alt: "Drie vrienden proosten aan een tafel bij het raam" },
      vrienden: { pexels: 5935229, alt: "Vrienden proosten met een biertje op een dakterras" },
      keuken: { pexels: 15671274, alt: "Koks maken samen een rij borden op" },
      bistro: { pexels: 31517300, alt: "Gasten aan tafel in een warme bistro" },
      tafel: { pexels: 30726876, alt: "Een gedekte tafel met glazen en borden" },
      kok: { pexels: 17086340, alt: "Een kok bereidt een gerecht in de keuken" },
      avond: { pexels: 20074713, alt: "Vrienden 's avonds aan een tafeltje buiten" },
      dakterras: { pexels: 9731993, alt: "Twee mensen drinken iets op een terras in de stad" },
      interieur: { pexels: 37172773, alt: "Een sfeervol restaurant met gedempt licht" },
    },
    hero: { kop: "Lekker eten, goed gezelschap.", tekst: "Lunch, diner en een borrel aan het plein van Zonnedorp. Met verse producten uit de streek, een groot terras en een keuken die tot laat open is.", knop: "Reserveer een tafel", foto: "zaal" },
    over: {
      kop: "Al vijftien jaar het hart van het plein",
      tekst: "Brasserie Het Plein is de plek waar Zonnedorp samenkomt. Voor een snelle lunch, een uitgebreid diner of een borrel na het werk. We koken met wat het seizoen brengt en kennen de boeren bij naam.",
      foto: "opmaken",
      lang: "Brasserie Het Plein begon als een klein café met zes tafels. Nu koken we elke dag voor honderd gasten, maar de sfeer is hetzelfde gebleven: gastvrij, ongedwongen en altijd een plek aan de bar.\n\nOnze chef werkt met producten uit de streek: groente van de tuinderij om de hoek, vlees van een boer uit de buurt en brood van de bakker op het plein.",
      lang2Kop: "Een team dat graag gastheer is",
      lang2: "Ons team bestaat uit vaste krachten en flexwerkers die we via ZekerFlex vinden. Zo staan er op drukke dagen altijd genoeg handen klaar, en blijft de bediening even vriendelijk.",
    },
    aanbod: {
      kop: "Wat mag het zijn?",
      intro: "Van een lunch op het terras tot een feest voor tachtig gasten: we denken graag met je mee.",
      items: [
        { titel: "Lunch", tekst: "Verse broodjes, soepen en salades, van elf tot vier. Op het terras of binnen bij het raam.", foto: "terras" },
        { titel: "Diner", tekst: "Een wisselende kaart met seizoensgerechten, en elke avond een driegangenmenu van de chef.", foto: "borden" },
        { titel: "Menu van de chef", tekst: "Laat je verrassen met vijf gangen, met wijn erbij die er precies bij past.", foto: "chef" },
        { titel: "Borrel", tekst: "Bittergarnituur, plankjes en speciaalbier van de tap. Vanaf vier uur aan de bar of op het terras.", foto: "proosten" },
        { titel: "Groepen en feesten", tekst: "Een verjaardag, jubileum of bedrijfsfeest? De bovenzaal is van jullie, tot tachtig gasten.", foto: "vrienden" },
        { titel: "Catering", tekst: "Onze keuken bij jou: van een lunch op kantoor tot een buffet in de tuin.", foto: "keuken" },
      ],
    },
    usps: {
      kop: "Waarom gasten terugkomen naar Het Plein.",
      items: [
        { titel: "Uit de streek", tekst: "Groente, vlees en brood van makers uit de buurt." },
        { titel: "Tot laat open", tekst: "De keuken is elke dag open tot tien uur." },
        { titel: "Groot terras", tekst: "Zon tot de avond, en verwarmd als het fris is." },
      ],
    },
    stappen: {
      kop: "Zo reserveer je",
      items: [
        { titel: "Kies je moment", tekst: "Lunch, diner of borrel: kies een dag en het aantal gasten." },
        { titel: "Kies een vrije tijd", tekst: "Online zie je meteen wat er nog vrij is. Je krijgt direct een bevestiging per mail." },
        { titel: "Schuif aan", tekst: "Je tafel staat klaar. Allergieën? Zeg het, de keuken houdt er rekening mee." },
      ],
    },
    galerij: { kop: "Sfeer en smaak", fotos: ["bistro", "tafel", "kok", "avond", "dakterras", "interieur"] },
    reviews: [
      { naam: "Voorbeeldklant", tekst: "Heerlijk gegeten op het terras, en de bediening was ontzettend vriendelijk. We komen zeker terug." },
      { naam: "Voorbeeldklant", tekst: "Ons bedrijfsfeest in de bovenzaal was tot in de puntjes geregeld. Iedereen had het er nog weken over." },
      { naam: "Voorbeeldklant", tekst: "Het menu van de chef is een aanrader: verrassend, en elke gang een feestje." },
    ],
    uren: {
      kop: "Openingstijden",
      regels: [
        { dag: "Maandag", tijd: "Gesloten" },
        { dag: "Dinsdag t/m donderdag", tijd: "11:00 – 23:00" },
        { dag: "Vrijdag en zaterdag", tijd: "11:00 – 01:00" },
        { dag: "Zondag", tijd: "12:00 – 22:00" },
      ],
    },
    faq: [
      { vraag: "Kan ik reserveren voor een groep?", antwoord: "Ja, tot tachtig gasten in de bovenzaal. Stuur een aanvraag met de datum en het aantal gasten, dan maken we een voorstel." },
      { vraag: "Houden jullie rekening met allergieën?", antwoord: "Zeker. Vermeld het bij je reservering of zeg het tegen de bediening; de keuken past het gerecht aan." },
      { vraag: "Kan ik ook zonder reservering langskomen?", antwoord: "Voor de lunch en de borrel meestal wel. Voor het diner op vrijdag en zaterdag raden we reserveren aan." },
      { vraag: "Is het terras overdekt?", antwoord: "Een deel is overdekt en verwarmd, zodat je ook in het voorjaar en najaar buiten kunt zitten." },
    ],
    cta: { kop: "Tot snel aan het plein!", tekst: "Reserveer een tafel of vraag een voorstel voor je feest. We reageren dezelfde dag.", knop: "Reserveer een tafel" },
    contact: { kop: "Reserveren of een vraag?", tekst: "Laat weten wanneer je wilt komen en met hoeveel gasten. Voor groepen maken we graag een voorstel op maat." },
    werken: { kop: "Werken bij Het Plein", tekst: "Bediening, keuken of afwas: we zoeken altijd gastvrije mensen. Kijk welke diensten er openstaan en reageer met één klik." },
    reserveren: {
      kop: "Reserveer je tafel",
      tekst: "Kies een dag en met hoeveel je komt: je ziet meteen welke tijden nog vrij zijn, en je krijgt direct een bevestiging. Met meer dan tien gasten? Dan maken we graag een voorstel voor de bovenzaal.",
      tijden: { "0": { van: "12:00", tot: "21:30" }, "1": null, "2": { van: "12:00", tot: "22:00" }, "3": { van: "12:00", tot: "22:00" }, "4": { van: "12:00", tot: "22:00" }, "5": { van: "12:00", tot: "23:00" }, "6": { van: "12:00", tot: "23:00" } },
      maxGroep: 10,
      maxGasten: 60,
    },
  },
  {
    id: "bouw",
    label: "Bouw en verbouw",
    omschrijving: "Aannemer voor nieuwbouw, verbouw, daken en schilderwerk, met projecten en een offerte-aanvraag.",
    slug: "bouwbedrijf-van-der-veen",
    bedrijf: bedrijf("Bouwbedrijf Van der Veen"),
    theme: stijl("#2E3A44", "#F28C38"),
    fotos: {
      villa: { pexels: 7031607, alt: "Een moderne villa met een groot gazon" },
      verbouw: { pexels: 16767783, alt: "Een bouwvakker aan het werk bij een verbouwing" },
      nieuwbouw: { pexels: 7587880, alt: "Een nieuw, modern huis met grote ramen" },
      casco: { pexels: 4642437, alt: "Een houten skelet van een huis in aanbouw" },
      renovatie: { pexels: 5493654, alt: "Twee vakmannen in werkkleding bij een renovatie" },
      dak: { pexels: 11784496, alt: "Dakdekkers leggen nieuwe dakpannen" },
      schilder: { pexels: 6474471, alt: "Een schilder rolt een muur in een lege kamer" },
      stucwerk: { pexels: 5493665, alt: "Een vakman werkt een wand af" },
      timmer: { pexels: 32990521, alt: "Een timmerman aan het werk in een houten opening" },
      plafond: { pexels: 5493653, alt: "Een schilder rolt een wand met een verlengsteel" },
      appartement: { pexels: 5691597, alt: "Een schilder werkt een muur in een nieuw appartement" },
      dakwerk: { pexels: 7788264, alt: "Een dakdekker in een veiligheidshesje op een dak" },
    },
    hero: { kop: "Bouwen met vakmanschap.", tekst: "Nieuwbouw, verbouw en renovatie in Zonnedorp en omgeving. Eén aanspreekpunt van tekening tot oplevering, met een vaste prijs en een heldere planning.", knop: "Vraag een offerte aan", foto: "villa" },
    over: {
      kop: "Een familiebedrijf dat afspraken nakomt",
      tekst: "Bouwbedrijf Van der Veen bouwt al drie generaties huizen in de regio. We werken met een vast team van vakmensen en zeggen wat we doen, en doen wat we zeggen.",
      foto: "verbouw",
      lang: "Wat begon met opa Van der Veen en een kruiwagen, is nu een bouwbedrijf met twintig vakmensen. Timmerlieden, metselaars, stukadoors en schilders: alles in eigen huis, zodat je één aanspreekpunt hebt.\n\nWe bouwen duurzaam en denken mee over isolatie, zonnepanelen en een warmtepomp.",
      lang2Kop: "Altijd genoeg handen",
      lang2: "Bij een strakke planning zetten we extra vakmensen in via ZekerFlex. Zo loopt je project niet uit, ook niet in de drukke maanden.",
    },
    aanbod: {
      kop: "Wat we voor je bouwen",
      intro: "Van een dakkapel tot een compleet nieuw huis: we doen het van begin tot eind.",
      items: [
        { titel: "Nieuwbouw", tekst: "Je eigen huis, gebouwd zoals jij het wilt. Wij regelen de vergunning, de planning en de bouw.", foto: "nieuwbouw" },
        { titel: "Verbouwen", tekst: "Een uitbouw, een nieuwe indeling of een extra verdieping. We denken mee over wat er kan.", foto: "casco" },
        { titel: "Renovatie", tekst: "Een ouder huis weer als nieuw, met betere isolatie en een lagere energierekening.", foto: "renovatie" },
        { titel: "Daken", tekst: "Nieuwe pannen, een plat dak of een dakkapel, netjes en waterdicht afgewerkt.", foto: "dak" },
        { titel: "Schilderwerk", tekst: "Binnen en buiten, met verf die jaren mooi blijft.", foto: "schilder" },
        { titel: "Stucwerk en afwerking", tekst: "Strakke wanden en plafonds, klaar om te schilderen of te behangen.", foto: "stucwerk" },
      ],
    },
    usps: {
      kop: "Waarom kiezen voor Van der Veen.",
      items: [
        { titel: "Vaste prijs", tekst: "Je weet vooraf wat het kost. Geen verrassingen achteraf." },
        { titel: "Eén aanspreekpunt", tekst: "Je eigen projectleider, van offerte tot oplevering." },
        { titel: "Tien jaar garantie", tekst: "Op de constructie, zwart op wit." },
      ],
    },
    stappen: {
      kop: "Zo werkt het",
      items: [
        { titel: "Kennismaken", tekst: "We komen langs, bekijken de situatie en horen je wensen." },
        { titel: "Offerte met vaste prijs", tekst: "Binnen een week heb je een heldere offerte met planning." },
        { titel: "Bouwen en opleveren", tekst: "Wij bouwen, jij houdt overzicht. We leveren pas op als jij tevreden bent." },
      ],
    },
    galerij: { kop: "Ons werk", fotos: ["timmer", "plafond", "appartement", "dakwerk"] },
    reviews: [
      { naam: "Voorbeeldklant", tekst: "Onze uitbouw stond er binnen de afgesproken tijd, en de prijs was precies wat in de offerte stond." },
      { naam: "Voorbeeldklant", tekst: "Fijne vakmensen die netjes werken en elke dag opruimen. Echt een aanrader." },
      { naam: "Voorbeeldklant", tekst: "Van tekening tot oplevering één aanspreekpunt. Dat scheelde ons veel stress." },
    ],
    uren: {
      kop: "Bereikbaar",
      regels: [
        { dag: "Maandag t/m vrijdag", tijd: "07:30 – 17:00" },
        { dag: "Zaterdag", tijd: "Op afspraak" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    faq: [
      { vraag: "Hebben jullie een vergunning nodig voor mijn verbouwing?", antwoord: "Dat hangt af van wat je wilt. We zoeken het voor je uit en vragen de vergunning aan als dat nodig is." },
      { vraag: "Hoe snel kunnen jullie beginnen?", antwoord: "Meestal binnen zes tot acht weken na akkoord op de offerte. Kleine klussen vaak eerder." },
      { vraag: "Werken jullie ook met een vaste prijs?", antwoord: "Ja. Je krijgt een offerte met een vaste prijs, en meerwerk gaat alleen in overleg." },
    ],
    cta: { kop: "Plannen om te (ver)bouwen?", tekst: "Vertel ons wat je wilt, dan komen we langs voor een gratis kennismaking.", knop: "Vraag een offerte aan" },
    contact: { kop: "Vraag een offerte aan", tekst: "Beschrijf kort wat je wilt laten doen. We nemen binnen één werkdag contact op voor een afspraak." },
  },
  {
    id: "schoonmaak",
    label: "Schoonmaak",
    omschrijving: "Schoonmaakbedrijf voor kantoren, woningen en glas, met vaste schoonmakers en een werken-bij-pagina.",
    slug: "schoonmaakbedrijf-helder",
    bedrijf: bedrijf("Schoonmaakbedrijf Helder"),
    theme: stijl("#1D4E89", "#3FC1A5"),
    fotos: {
      kantoor: { pexels: 6197111, alt: "Een schoonmaker aan het werk in een licht kantoor" },
      ramen: { pexels: 18885426, alt: "Een glazenwasser maakt een groot raam schoon" },
      vloer: { pexels: 6196582, alt: "Een schoonmaakster dweilt de vloer van een woonkamer" },
      hoogte: { pexels: 17041922, alt: "Een glazenwasser aan touwen aan een gebouw" },
      woning: { pexels: 7641484, alt: "Een vrouw dweilt de vloer van een woning" },
      sanitair: { pexels: 4239101, alt: "Een hand in een handschoen maakt een douchewand schoon" },
      dweilen: { pexels: 4440541, alt: "Een schoonmaakster dweilt een gang" },
      gebouw: { pexels: 11661020, alt: "Een glazenwasser aan de gevel van een flat" },
      spons: { pexels: 28576636, alt: "Gele handschoenen met een spons en een sproeiflacon" },
      flacon: { pexels: 4440533, alt: "Roze handschoenen met een sproeiflacon" },
      tegels: { pexels: 4239007, alt: "Tegels worden schoongemaakt met een spons" },
      handen: { pexels: 28576639, alt: "Handen in handschoenen met een blauwe spons" },
    },
    hero: { kop: "Schoon, zonder zorgen.", tekst: "Kantoren, praktijken en woningen in Zonnedorp en omgeving. Met een vaste schoonmaker die je kent, en een kwaliteitscheck elke maand.", knop: "Vraag een offerte aan", foto: "kantoor" },
    over: {
      kop: "Een vaste schoonmaker die je kent",
      tekst: "Bij Schoonmaakbedrijf Helder krijg je geen wisselende gezichten, maar een vaste schoonmaker die je ruimte kent. Valt die uit, dan staat er dezelfde dag een vervanger klaar.",
      foto: "ramen",
      lang: "Helder begon met één schoonmaker en een fiets. Nu werken we voor meer dan honderd kantoren, praktijken en gezinnen in de regio.\n\nWe gebruiken middelen die goed zijn voor het milieu, en onze schoonmakers zijn getraind en gescreend.",
      lang2Kop: "Altijd een vervanger",
      lang2: "Ziek of op vakantie? Via ZekerFlex vinden we snel een ervaren vervanger, zodat jouw ruimte altijd schoon blijft.",
    },
    aanbod: {
      kop: "Wat we schoonmaken",
      intro: "Eenmalig of vast, overdag of na sluitingstijd: we passen ons aan jouw rooster aan.",
      items: [
        { titel: "Kantoren", tekst: "Werkplekken, keukens en sanitair, elke dag of een paar keer per week.", foto: "vloer" },
        { titel: "Glasbewassing", tekst: "Ramen binnen en buiten, ook op hoogte, streeploos schoon.", foto: "hoogte" },
        { titel: "Woningen", tekst: "Een vaste hulp voor je huis, elke week of om de week.", foto: "woning" },
        { titel: "Sanitair", tekst: "Toiletten, douches en keukens hygiënisch schoon en fris.", foto: "sanitair" },
        { titel: "Vloeren", tekst: "Dweilen, boenen en in de was zetten, voor elke soort vloer.", foto: "dweilen" },
        { titel: "Na de bouw", tekst: "Bouwschoonmaak na een verbouwing, zodat je meteen kunt beginnen.", foto: "gebouw" },
      ],
    },
    usps: {
      kop: "Waarom kiezen voor Helder.",
      items: [
        { titel: "Vaste schoonmaker", tekst: "Iemand die je ruimte kent en die je vertrouwt." },
        { titel: "Dezelfde dag vervanging", tekst: "Bij ziekte of vakantie staat er altijd iemand klaar." },
        { titel: "Elke maand een check", tekst: "We controleren de kwaliteit samen met jou." },
      ],
    },
    stappen: {
      kop: "Zo werkt het",
      items: [
        { titel: "Rondgang", tekst: "We komen langs en bekijken wat er schoongemaakt moet worden." },
        { titel: "Plan op maat", tekst: "Je krijgt een schoonmaakplan met een vaste prijs per maand." },
        { titel: "Schoon, elke keer", tekst: "Je vaste schoonmaker begint, en wij controleren de kwaliteit." },
      ],
    },
    galerij: { kop: "Een indruk", fotos: ["spons", "flacon", "tegels", "handen"] },
    reviews: [
      { naam: "Voorbeeldklant", tekst: "Ons kantoor is nog nooit zo schoon geweest. En altijd dezelfde vriendelijke schoonmaker." },
      { naam: "Voorbeeldklant", tekst: "Toen onze vaste kracht ziek was, stond er dezelfde dag een vervanger. Top geregeld." },
      { naam: "Voorbeeldklant", tekst: "De ramen zijn streeploos, ook op de derde verdieping. Heel tevreden." },
    ],
    uren: {
      kop: "Bereikbaar",
      regels: [
        { dag: "Maandag t/m vrijdag", tijd: "08:00 – 18:00" },
        { dag: "Zaterdag", tijd: "09:00 – 13:00" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    faq: [
      { vraag: "Moet ik zelf schoonmaakmiddelen regelen?", antwoord: "Nee, wij nemen alles mee. We werken met milieuvriendelijke middelen." },
      { vraag: "Kunnen jullie ook 's avonds schoonmaken?", antwoord: "Ja, bij kantoren meestal na sluitingstijd, zodat je er geen last van hebt." },
      { vraag: "Wat als ik niet tevreden ben?", antwoord: "Laat het ons weten, dan komen we kosteloos terug. Elke maand doen we ook een kwaliteitscheck." },
    ],
    cta: { kop: "Klaar voor een frisse start?", tekst: "Vraag een rondgang aan, dan krijg je binnen twee dagen een voorstel met een vaste prijs.", knop: "Vraag een offerte aan" },
    contact: { kop: "Vraag een offerte aan", tekst: "Vertel ons wat er schoongemaakt moet worden en hoe vaak. We plannen een rondgang op een moment dat jou uitkomt." },
    werken: { kop: "Werken bij Helder", tekst: "Schoonmaken met een vast rooster, of flexibel als het jou uitkomt. Bekijk de open diensten en reageer met één klik." },
  },
  {
    id: "logistiek",
    label: "Transport en logistiek",
    omschrijving: "Transportbedrijf voor pakketten, koeriersritten, opslag en distributie, met een werken-bij-pagina.",
    slug: "transportbedrijf-de-vaart",
    bedrijf: bedrijf("Transportbedrijf De Vaart"),
    theme: stijl("#3B2D5C", "#FFB547"),
    fotos: {
      weg: { pexels: 28264496, alt: "Een vrachtwagen op een lange weg onder een blauwe lucht" },
      bezorger: { pexels: 7363098, alt: "Een bezorger met een pakket voor een bestelbus" },
      steekwagen: { pexels: 6169660, alt: "Een bezorger met een steekwagen vol dozen" },
      bus: { pexels: 6169177, alt: "Een bezorger laadt dozen uit een bestelbus" },
      heftruck: { pexels: 14688882, alt: "Een heftruck in een magazijn met stellingen" },
      laadruim: { pexels: 21838827, alt: "Een bestelbus vol dozen bij een magazijn" },
      snelweg: { pexels: 14005602, alt: "Een vrachtwagen op de snelweg" },
      avond: { pexels: 5410923, alt: "Een vrachtwagen bij zonsondergang" },
      dozen: { pexels: 6407553, alt: "Dozen in de laadruimte van een bestelbus" },
      loods: { pexels: 11666903, alt: "Een loods met een heftruck" },
      verkeer: { pexels: 16325212, alt: "Vrachtwagens op een drukke snelweg" },
    },
    hero: { kop: "Op tijd, elke rit.", tekst: "Pakketten, koeriersritten, opslag en distributie vanuit Zonnedorp. Met eigen chauffeurs, live volgen en levering op het afgesproken uur.", knop: "Vraag een prijs aan", foto: "weg" },
    over: {
      kop: "Een transporteur die meedenkt",
      tekst: "Transportbedrijf De Vaart rijdt al dertig jaar voor bedrijven in de regio. We kennen de wegen, de klanten en de laadtijden, en lossen het op als er iets tussenkomt.",
      foto: "bezorger",
      lang: "De Vaart begon met één vrachtwagen en een vaste klant. Nu rijden we met veertig wagens en bussen, en hebben we een eigen magazijn met plek voor duizend pallets.\n\nWe rijden steeds vaker elektrisch, zeker in de binnensteden.",
      lang2Kop: "Altijd een chauffeur beschikbaar",
      lang2: "In de drukke weken voor de feestdagen zetten we extra chauffeurs en magazijnmedewerkers in via ZekerFlex. Zo komt elke rit op tijd.",
    },
    aanbod: {
      kop: "Wat we voor je rijden",
      intro: "Van één pakket tot een volle vrachtwagen: we zoeken de snelste en zuinigste route.",
      items: [
        { titel: "Pakketbezorging", tekst: "Elke dag een vaste ronde langs je klanten, met een foto bij aflevering.", foto: "steekwagen" },
        { titel: "Koeriersdienst", tekst: "Spoed? Binnen twee uur opgehaald en direct gebracht.", foto: "bus" },
        { titel: "Opslag", tekst: "Pallets en voorraad veilig opgeslagen in ons magazijn, met een overzicht per dag.", foto: "heftruck" },
        { titel: "Distributie", tekst: "Wij verzamelen, verpakken en verzenden je bestellingen.", foto: "laadruim" },
        { titel: "Groot transport", tekst: "Volle vrachten door heel Nederland en naar België en Duitsland.", foto: "snelweg" },
        { titel: "Avond- en nachtritten", tekst: "Levering voordat je winkel opengaat, zonder file.", foto: "avond" },
      ],
    },
    usps: {
      kop: "Waarom kiezen voor De Vaart.",
      items: [
        { titel: "Live volgen", tekst: "Je ziet waar je zending is, van ophalen tot aflevering." },
        { titel: "Eigen chauffeurs", tekst: "Vakmensen die je klanten kennen." },
        { titel: "Steeds vaker elektrisch", tekst: "Schoon de binnenstad in." },
      ],
    },
    stappen: {
      kop: "Zo werkt het",
      items: [
        { titel: "Vraag een prijs aan", tekst: "Vertel wat er van waar naar waar moet, en wanneer." },
        { titel: "Wij plannen de rit", tekst: "Je krijgt een vaste prijs en een tijdvak voor de levering." },
        { titel: "Volgen en ontvangen", tekst: "Je volgt de rit live en krijgt een bevestiging bij aflevering." },
      ],
    },
    galerij: { kop: "Onderweg", fotos: ["dozen", "loods", "verkeer", "avond"] },
    reviews: [
      { naam: "Voorbeeldklant", tekst: "Onze bestellingen gaan elke dag op tijd de deur uit. De chauffeurs zijn altijd vriendelijk." },
      { naam: "Voorbeeldklant", tekst: "Een spoedrit op vrijdagmiddag, binnen twee uur geleverd. Dat noem ik service." },
      { naam: "Voorbeeldklant", tekst: "Fijn dat we live kunnen zien waar onze zending is. Dat scheelt veel telefoontjes." },
    ],
    uren: {
      kop: "Bereikbaar",
      regels: [
        { dag: "Maandag t/m vrijdag", tijd: "06:00 – 22:00" },
        { dag: "Zaterdag", tijd: "07:00 – 14:00" },
        { dag: "Zondag", tijd: "Alleen spoedritten" },
      ],
    },
    faq: [
      { vraag: "Hoe snel kunnen jullie een spoedrit doen?", antwoord: "Binnen de regio meestal binnen twee uur na je aanvraag." },
      { vraag: "Kan ik mijn zending volgen?", antwoord: "Ja, je krijgt een link waarmee je de rit live volgt, met een foto bij aflevering." },
      { vraag: "Rijden jullie ook naar het buitenland?", antwoord: "Ja, naar België en Duitsland rijden we elke dag." },
    ],
    cta: { kop: "Iets te vervoeren?", tekst: "Vraag een prijs aan, dan heb je binnen een uur een voorstel.", knop: "Vraag een prijs aan" },
    contact: { kop: "Vraag een prijs aan", tekst: "Vertel wat er vervoerd moet worden, van waar naar waar en wanneer. Je hoort binnen een uur van ons." },
    werken: { kop: "Werken bij De Vaart", tekst: "Chauffeur, bijrijder of magazijnmedewerker: bekijk de open diensten en reageer met één klik." },
  },
  {
    id: "zorg",
    label: "Zorg en praktijk",
    omschrijving: "Fysiotherapiepraktijk met behandelingen, openingstijden en een afspraak-aanvraag.",
    slug: "fysiotherapie-in-beweging",
    bedrijf: bedrijf("Fysiotherapie In Beweging"),
    theme: stijl("#2F6F73", "#F7C873"),
    fotos: {
      buiten: { pexels: 5037407, alt: "Een fysiotherapeut helpt een vrouw met een rekoefening op een mat" },
      massage: { pexels: 19641835, alt: "Een therapeut masseert de rug van een vrouw" },
      handen: { pexels: 5473186, alt: "De handen van een therapeut tijdens een behandeling" },
      rug: { pexels: 3230236, alt: "Een rugmassage van dichtbij" },
      oefenen: { pexels: 6697192, alt: "Een vrouw doet een oefening op een yogamat" },
      sport: { pexels: 5543089, alt: "Een vrouw rekt haar benen op een mat aan het water" },
      rekken: { pexels: 8172929, alt: "Een vrouw rekt haar been op een mat in het gras" },
      ontspan: { pexels: 3822227, alt: "Een vrouw rekt zich uit op een mat" },
      houding: { pexels: 6246385, alt: "Een vrouw doet een rustige rekoefening" },
    },
    hero: { kop: "Weer soepel in beweging.", tekst: "Fysiotherapie, massage en oefentherapie in Zonnedorp. Zonder lange wachttijd, met een behandelplan dat bij jou past.", knop: "Maak een afspraak", foto: "buiten" },
    over: {
      kop: "Een praktijk met aandacht",
      tekst: "Bij Fysiotherapie In Beweging nemen we de tijd. Elke behandeling begint met een gesprek, zodat we weten wat je wilt bereiken en hoe we daar samen komen.",
      foto: "massage",
      lang: "Onze praktijk is twintig jaar geleden begonnen in een kleine ruimte boven de apotheek. Nu werken we met zes therapeuten in een eigen pand met een oefenzaal.\n\nWe behandelen klachten aan rug, nek, schouders en knieën, sportblessures en klachten door werk of stress.",
      lang2Kop: "Je kunt snel terecht",
      lang2: "Bij ons is er geen lange wachtlijst. Meestal kun je binnen een paar dagen terecht, ook zonder verwijzing van de huisarts.",
    },
    aanbod: {
      kop: "Waar we je mee helpen",
      intro: "Van een acute blessure tot een klacht die al jaren speelt: we kijken naar het geheel.",
      items: [
        { titel: "Fysiotherapie", tekst: "Onderzoek en behandeling van klachten aan spieren en gewrichten.", foto: "handen" },
        { titel: "Massage", tekst: "Losmaken van gespannen spieren, voor herstel en ontspanning.", foto: "rug" },
        { titel: "Oefentherapie", tekst: "Gerichte oefeningen om sterker en soepeler te worden.", foto: "oefenen" },
        { titel: "Sportblessures", tekst: "Snel en veilig terug naar je sport, met een plan op maat.", foto: "sport" },
        { titel: "Rug- en nekklachten", tekst: "Minder pijn en een betere houding, thuis en op het werk.", foto: "rekken" },
        { titel: "Ontspanning", tekst: "Ademhaling en ontspanningsoefeningen bij stress en spanning.", foto: "ontspan" },
      ],
    },
    usps: {
      kop: "Waarom kiezen voor In Beweging.",
      items: [
        { titel: "Geen wachtlijst", tekst: "Meestal binnen een paar dagen terecht." },
        { titel: "Zonder verwijzing", tekst: "Je kunt direct een afspraak maken." },
        { titel: "Vergoed", tekst: "We werken met alle zorgverzekeraars." },
      ],
    },
    stappen: {
      kop: "Zo werkt het",
      items: [
        { titel: "Vraag een afspraak aan", tekst: "Via het formulier of de chat. We bellen je terug voor een tijd." },
        { titel: "Intake en onderzoek", tekst: "We bespreken je klacht en maken samen een behandelplan." },
        { titel: "Behandelen en oefenen", tekst: "In de praktijk en met oefeningen voor thuis." },
      ],
    },
    galerij: { kop: "In de praktijk", fotos: ["houding", "sport", "oefenen", "rug"] },
    reviews: [
      { naam: "Voorbeeldklant", tekst: "Na een paar behandelingen kon ik weer pijnvrij werken. Heel fijne therapeut." },
      { naam: "Voorbeeldklant", tekst: "Binnen drie dagen terecht, en duidelijke oefeningen voor thuis. Echt een aanrader." },
      { naam: "Voorbeeldklant", tekst: "Na mijn knieblessure stond ik sneller dan verwacht weer op het veld." },
    ],
    uren: {
      kop: "Openingstijden",
      regels: [
        { dag: "Maandag t/m donderdag", tijd: "08:00 – 20:00" },
        { dag: "Vrijdag", tijd: "08:00 – 17:00" },
        { dag: "Zaterdag", tijd: "09:00 – 12:00" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    faq: [
      { vraag: "Heb ik een verwijzing nodig?", antwoord: "Nee, je kunt direct een afspraak maken. We doen dan eerst een korte screening." },
      { vraag: "Wordt fysiotherapie vergoed?", antwoord: "Dat hangt af van je aanvullende verzekering. We werken met alle zorgverzekeraars en declareren direct." },
      { vraag: "Wat neem ik mee naar de eerste afspraak?", antwoord: "Je verzekeringspas, een legitimatiebewijs en makkelijk zittende kleding." },
    ],
    cta: { kop: "Last van een klacht?", tekst: "Vraag een afspraak aan. Meestal kun je binnen een paar dagen terecht.", knop: "Maak een afspraak" },
    contact: { kop: "Maak een afspraak", tekst: "Vertel kort waar je last van hebt en wanneer je kunt. We bellen je terug om een tijd te plannen." },
  },
  {
    id: "algemeen",
    label: "Zakelijke dienstverlening",
    omschrijving: "Adviesbureau voor ondernemers: advies, administratie, strategie en coaching, met een kennismaking op afspraak.",
    slug: "adviesbureau-kompas",
    bedrijf: bedrijf("Adviesbureau Kompas"),
    theme: stijl("#325A46", "#FF5F1F"),
    fotos: {
      team: { pexels: 7876755, alt: "Een team kijkt samen naar een laptop" },
      kantoor: { pexels: 6326003, alt: "Een vrouw werkt geconcentreerd in een licht kantoor met planten" },
      advies: { pexels: 36733315, alt: "Een adviesgesprek aan een tafel met laptops" },
      administratie: { pexels: 7888650, alt: "Een vrouw schrijft aantekeningen naast haar laptop" },
      strategie: { pexels: 7793988, alt: "Een overleg aan een lange tafel" },
      coaching: { pexels: 8134104, alt: "Collega's bespreken iets rond een laptop" },
      project: { pexels: 36733327, alt: "Een team in overleg aan een kantoortafel" },
      online: { pexels: 22046238, alt: "Een vrouw werkt aan een laptop in een kantoor met een bakstenen muur" },
      werkplek: { pexels: 2422286, alt: "Een vrouw met een laptop in een kantoor met uitzicht" },
      bureau: { pexels: 3783716, alt: "Een vrouw met een bril aan haar bureau" },
      typen: { pexels: 12911961, alt: "Iemand werkt aan een computer op kantoor" },
      lezen: { pexels: 4240579, alt: "Een vrouw met een bril leest aan haar bureau" },
    },
    hero: { kop: "Ondernemen met overzicht.", tekst: "Advies, administratie en strategie voor ondernemers in Zonnedorp en omgeving. Zodat jij weet waar je staat, en je tijd overhoudt voor je klanten.", knop: "Plan een kennismaking", foto: "team" },
    over: {
      kop: "Een partner die met je meedenkt",
      tekst: "Adviesbureau Kompas helpt ondernemers met de cijfers en de keuzes die erbij horen. Persoonlijk, in gewone taal, en met een vaste adviseur die je bedrijf kent.",
      foto: "kantoor",
      lang: "Kompas is opgericht door twee ondernemers die zelf merkten hoe lastig het is om overzicht te houden. Nu helpen we meer dan tweehonderd zzp'ers en mkb-bedrijven.\n\nWe werken met slimme software, zodat je altijd ziet hoe je ervoor staat, en we zijn gewoon bereikbaar als je een vraag hebt.",
      lang2Kop: "Altijd een vast aanspreekpunt",
      lang2: "Je hebt één adviseur die je bedrijf kent. Is die er even niet, dan neemt een collega het over die je dossier al heeft gelezen.",
    },
    aanbod: {
      kop: "Waar we je mee helpen",
      intro: "Van je eerste jaar als zzp'er tot de groei van je bedrijf: we schuiven aan waar je ons nodig hebt.",
      items: [
        { titel: "Advies", tekst: "Een sparringpartner voor de grote en kleine keuzes in je bedrijf.", foto: "advies" },
        { titel: "Administratie", tekst: "Je boekhouding, btw-aangifte en jaarrekening, netjes en op tijd.", foto: "administratie" },
        { titel: "Strategie", tekst: "Samen een plan voor de komende jaren, met doelen die je kunt meten.", foto: "strategie" },
        { titel: "Coaching", tekst: "Voor ondernemers en leidinggevenden die willen groeien.", foto: "coaching" },
        { titel: "Projecten", tekst: "Een tijdelijke extra hand bij een overname, verhuizing of nieuwe vestiging.", foto: "project" },
        { titel: "Online overzicht", tekst: "Altijd je cijfers bij de hand in een helder dashboard.", foto: "online" },
      ],
    },
    usps: {
      kop: "Waarom ondernemers kiezen voor Kompas.",
      items: [
        { titel: "Vaste adviseur", tekst: "Iemand die je bedrijf kent en je echt helpt." },
        { titel: "Heldere prijzen", tekst: "Een vast bedrag per maand, zonder verrassingen." },
        { titel: "In gewone taal", tekst: "Geen vakjargon, wel duidelijke antwoorden." },
      ],
    },
    stappen: {
      kop: "Zo werkt het",
      items: [
        { titel: "Kennismaking", tekst: "Een gratis gesprek van een uur over je bedrijf en je plannen." },
        { titel: "Voorstel op maat", tekst: "Je krijgt een voorstel met een vaste prijs per maand." },
        { titel: "Samen aan de slag", tekst: "Je vaste adviseur gaat aan de slag en houdt je op de hoogte." },
      ],
    },
    galerij: { kop: "Op kantoor", fotos: ["werkplek", "bureau", "typen", "lezen"] },
    reviews: [
      { naam: "Voorbeeldklant", tekst: "Eindelijk overzicht in mijn cijfers. En een adviseur die echt meedenkt." },
      { naam: "Voorbeeldklant", tekst: "Mijn btw-aangifte is altijd op tijd, en ik hoef er niet meer wakker van te liggen." },
      { naam: "Voorbeeldklant", tekst: "Dankzij het strategiegesprek weet ik waar ik over drie jaar wil staan." },
    ],
    uren: {
      kop: "Bereikbaar",
      regels: [
        { dag: "Maandag t/m vrijdag", tijd: "08:30 – 17:30" },
        { dag: "Zaterdag en zondag", tijd: "Gesloten" },
      ],
    },
    faq: [
      { vraag: "Is de kennismaking echt gratis?", antwoord: "Ja, het eerste gesprek van een uur is gratis en zonder verplichtingen." },
      { vraag: "Werken jullie ook voor zzp'ers?", antwoord: "Zeker, ongeveer de helft van onze klanten is zzp'er." },
      { vraag: "Kan ik zelf in mijn administratie kijken?", antwoord: "Ja, je hebt altijd toegang tot je eigen dashboard met je cijfers." },
    ],
    cta: { kop: "Benieuwd wat we voor je kunnen doen?", tekst: "Plan een gratis kennismaking, op kantoor of online.", knop: "Plan een kennismaking" },
    contact: { kop: "Plan een kennismaking", tekst: "Vertel kort iets over je bedrijf en wanneer het je uitkomt. We plannen een gesprek op kantoor of online." },
  },
  {
    id: "kapper",
    label: "Kapper en beauty",
    omschrijving: "Kapsalon met knippen, kleuren, baard en nagels, met openingstijden en een afspraakformulier.",
    kaart: "/voorbeeldsites/kapper.jpg",
    slug: "kapsalon-de-spiegel",
    bedrijf: bedrijf("Kapsalon De Spiegel"),
    theme: stijl("#4A2C40", "#E8A598"),
    fotos: {
      salon: { pexels: 7755222, alt: "Een kapster knipt lang haar met kam en schaar" },
      barbier: { pexels: 3998421, alt: "Een barbier werkt een baard bij met kam en schaar" },
      dames: { pexels: 3356170, alt: "Een kapster knipt nat haar op lengte" },
      heren: { pexels: 15659486, alt: "Een kapper knipt kort haar bij in de nek" },
      kleur: { pexels: 2799605, alt: "Een kapper brengt kleur aan in lang haar" },
      baard: { pexels: 3998417, alt: "Een barbier knipt een volle baard bij met een schaar" },
      fohn: { pexels: 696285, alt: "Een kapper föhnt het haar van een vrouw in de salon" },
      nagels: { pexels: 29877720, alt: "Een nagelstyliste verzorgt de nagels van een klant" },
      knippen: { pexels: 4969866, alt: "Een kapper knipt krullend haar bij met schaar en kam" },
      spiegels: { pexels: 3993133, alt: "Een salon met verlichte spiegels en kappersstoelen" },
      folie: { pexels: 8468036, alt: "Een vrouw krijgt highlights met folie" },
      scheren: { pexels: 6007395, alt: "Een barbier scheert een klant met een mes" },
      verf: { pexels: 3993292, alt: "Haarverf wordt in een kom gemengd" },
      lok: { pexels: 7755251, alt: "Handen met kam en schaar bij een lok haar" },
    },
    hero: { kop: "Tijd voor jezelf.", tekst: "Knippen, kleuren en verzorgen in het hart van Zonnedorp. Voor dames, heren en kinderen, met eerlijk advies en een kop koffie erbij.", knop: "Maak een afspraak", foto: "salon" },
    over: {
      kop: "Een salon waar je even tot rust komt",
      tekst: "Kapsalon De Spiegel is een salon met vijf stoelen en een vast team. We nemen de tijd, luisteren naar wat je wilt en zeggen eerlijk wat bij je haar past.",
      foto: "barbier",
      lang: "Kapsalon De Spiegel begon met één stoel en een grote spiegel, vandaar de naam. Nu werken we met vijf stylisten, een barbier en een nagelstyliste, maar je wordt nog altijd begroet met je voornaam.\n\nWe werken met verzorgende producten en vertellen je graag hoe je je haar thuis mooi houdt.",
      lang2Kop: "Altijd iemand voor je klaar",
      lang2: "Op drukke dagen, zoals voor de feestdagen, staan er extra stylisten via ZekerFlex. Zo hoef je nooit lang te wachten op een afspraak.",
    },
    aanbod: {
      kop: "Onze behandelingen",
      intro: "Van een snelle knipbeurt tot een hele middag in de salon: kies wat bij je past.",
      items: [
        { titel: "Knippen dames", tekst: "Wassen, knippen en föhnen, met advies over een model dat bij je past.", foto: "dames" },
        { titel: "Knippen heren", tekst: "Kort, lang of een fade: strak geknipt en netjes afgewerkt.", foto: "heren" },
        { titel: "Kleuren en highlights", tekst: "Een nieuwe kleur, grijs wegwerken of highlights en balayage.", foto: "kleur" },
        { titel: "Baard en scheren", tekst: "Baard bijwerken of een klassieke scheerbeurt met een warme doek.", foto: "baard" },
        { titel: "Föhnen en opsteken", tekst: "Voor een feest, bruiloft of gewoon omdat het kan.", foto: "fohn" },
        { titel: "Nagels", tekst: "Manicure, gellak en verzorging van je handen.", foto: "nagels" },
      ],
    },
    usps: {
      kop: "Waarom klanten blijven komen.",
      items: [
        { titel: "Eerlijk advies", tekst: "We zeggen wat bij je past, ook als dat minder is." },
        { titel: "Op tijd", tekst: "We plannen ruim, dus je afspraak begint op tijd." },
        { titel: "Thuis ook mooi", tekst: "Tips en producten om je haar thuis goed te verzorgen." },
      ],
    },
    stappen: {
      kop: "Zo maak je een afspraak",
      items: [
        { titel: "Kies je behandeling", tekst: "Knippen, kleuren, baard of nagels: kies wat je wilt." },
        { titel: "Kies een moment", tekst: "Stuur je aanvraag via het formulier of de chat. We bevestigen dezelfde dag." },
        { titel: "Even tijd voor jezelf", tekst: "Koffie of thee staat klaar. Leun achterover, wij doen de rest." },
      ],
    },
    galerij: { kop: "In de salon", fotos: ["knippen", "spiegels", "folie", "scheren", "verf", "lok"] },
    reviews: [
      { naam: "Voorbeeldklant", tekst: "Eindelijk een kapper die luistert. Mijn haar zit al weken precies zoals ik wilde." },
      { naam: "Voorbeeldklant", tekst: "De scheerbeurt met de warme doek is een aanrader. Ik ga nergens anders meer heen." },
      { naam: "Voorbeeldklant", tekst: "Voor mijn bruiloft opgestoken, en het bleef de hele avond zitten. Dank jullie wel!" },
    ],
    uren: {
      kop: "Openingstijden",
      regels: [
        { dag: "Maandag", tijd: "Gesloten" },
        { dag: "Dinsdag en woensdag", tijd: "09:00 – 18:00" },
        { dag: "Donderdag", tijd: "09:00 – 21:00" },
        { dag: "Vrijdag", tijd: "09:00 – 18:00" },
        { dag: "Zaterdag", tijd: "08:30 – 16:00" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    faq: [
      { vraag: "Moet ik een afspraak maken?", antwoord: "Dat is het fijnst, dan staat er iemand voor je klaar. Op zaterdagochtend kun je ook zonder afspraak binnenlopen." },
      { vraag: "Knippen jullie ook kinderen?", antwoord: "Ja, kinderen tot twaalf jaar zijn van harte welkom. Ze krijgen er iets lekkers bij." },
      { vraag: "Kan ik mijn afspraak verzetten?", antwoord: "Ja, laat het uiterlijk een dag van tevoren weten via het formulier of de chat." },
      { vraag: "Welke producten gebruiken jullie?", antwoord: "Verzorgende producten zonder onnodige toevoegingen. We vertellen je graag welke bij jouw haar passen." },
    ],
    cta: { kop: "Tijd voor een nieuwe look?", tekst: "Maak een afspraak, dan staat je stoel klaar. We bevestigen dezelfde dag.", knop: "Maak een afspraak" },
    contact: { kop: "Maak een afspraak", tekst: "Laat weten welke behandeling je wilt en wanneer het je uitkomt. We stellen een moment voor en bevestigen het dezelfde dag." },
  },
  {
    id: "garage",
    label: "Garage en autobedrijf",
    omschrijving: "Garage met APK, onderhoud, banden en occasions, met een afspraakformulier en een werken-bij-pagina.",
    kaart: "/voorbeeldsites/garage.jpg",
    slug: "garage-de-rotonde",
    bedrijf: bedrijf("Garage De Rotonde"),
    theme: stijl("#1F2A37", "#F5B700"),
    fotos: {
      werkplaats: { pexels: 4489702, alt: "Een monteur aan het werk bij een auto, in een werkplaats vol vonken" },
      advies: { pexels: 6870324, alt: "Een monteur met een klembord naast een oranje auto" },
      apk: { pexels: 3807120, alt: "Een monteur controleert de onderkant van een auto op de brug" },
      onderhoud: { pexels: 4315570, alt: "Een monteur werkt aan de motor van een auto" },
      banden: { pexels: 3806249, alt: "Een monteur wisselt een band in de werkplaats" },
      remmen: { pexels: 6870299, alt: "Een monteur controleert een remklauw en remschijf" },
      diagnose: { pexels: 4116193, alt: "Een monteur leest een auto uit met een diagnosecomputer" },
      occasions: { pexels: 7144176, alt: "Een verkoper laat twee klanten een auto zien in de showroom" },
      schaar: { pexels: 3807799, alt: "Een monteur bij een auto op een schaarbrug" },
      onder: { pexels: 4489749, alt: "Een monteur werkt met een lamp onder een auto" },
      motorkap: { pexels: 8478228, alt: "Een monteur controleert de motorruimte van een auto" },
      pompen: { pexels: 3807386, alt: "Een monteur pompt een band op" },
      olie: { pexels: 4895412, alt: "Een monteur controleert het oliepeil" },
      wassen: { pexels: 6872601, alt: "Een auto wordt gewassen met een hogedrukspuit" },
    },
    hero: { kop: "Je auto in goede handen.", tekst: "Onderhoud, APK en reparatie voor elk merk, aan de rand van Zonnedorp. Je weet vooraf wat het kost, en we doen niets zonder jouw akkoord.", knop: "Plan een afspraak", foto: "werkplaats" },
    over: {
      kop: "Een garage die eerlijk zegt wat er moet",
      tekst: "Garage De Rotonde is een zelfstandige garage voor alle merken. We leggen uit wat er aan je auto moet gebeuren, wat kan wachten, en wat het kost.",
      foto: "advies",
      lang: "Garage De Rotonde begon dertig jaar geleden als een werkplaats met één brug. Nu werken we met zes monteurs aan auto's van elk merk, van een kleine stadsauto tot een bestelbus.\n\nOnze monteurs zijn opgeleid voor benzine, diesel, hybride en elektrisch. En we werken volgens de voorschriften van de fabrikant, zodat je garantie blijft gelden.",
      lang2Kop: "Ook in de bandenweken snel geholpen",
      lang2: "In het voor- en najaar wisselen we honderden banden. Dan zetten we extra handen in via ZekerFlex, zodat je niet weken hoeft te wachten.",
    },
    aanbod: {
      kop: "Wat we voor je auto doen",
      intro: "Van de APK tot een nieuwe set banden: alles onder één dak, voor elk merk.",
      items: [
        { titel: "APK-keuring", tekst: "Je weet vooraf wat het kost. Reparaties doen we alleen na jouw akkoord.", foto: "apk" },
        { titel: "Onderhoud", tekst: "Kleine en grote beurten volgens het boekje, met behoud van garantie.", foto: "onderhoud" },
        { titel: "Banden", tekst: "Zomer-, winter- en vierseizoenenbanden, wisselen en opslaan in ons bandenhotel.", foto: "banden" },
        { titel: "Remmen en uitlaat", tekst: "Remblokken, remschijven en uitlaat, gecontroleerd en zo nodig vervangen.", foto: "remmen" },
        { titel: "Storingen", tekst: "Een lampje op het dashboard? We lezen je auto uit en zeggen wat er aan de hand is.", foto: "diagnose" },
        { titel: "Occasions", tekst: "Gecontroleerde auto's met een nieuwe APK en garantie.", foto: "occasions" },
      ],
    },
    usps: {
      kop: "Waarom rijders voor De Rotonde kiezen.",
      items: [
        { titel: "Vooraf een prijs", tekst: "Geen verrassingen achteraf: je weet wat het kost." },
        { titel: "Niets zonder overleg", tekst: "We bellen eerst als we iets extra's vinden." },
        { titel: "Vervangend vervoer", tekst: "Een leenauto of leenfiets terwijl wij aan je auto werken." },
      ],
    },
    stappen: {
      kop: "Zo plan je een afspraak",
      items: [
        { titel: "Plan je afspraak", tekst: "Vertel om welke auto het gaat en wat er moet gebeuren, via het formulier of de chat." },
        { titel: "Breng je auto", tekst: "Lever hem 's ochtends in. Wachten kan ook, of neem de leenfiets." },
        { titel: "Weer veilig op weg", tekst: "We laten je weten wanneer hij klaar is en leggen uit wat we hebben gedaan." },
      ],
    },
    galerij: { kop: "In de werkplaats", fotos: ["schaar", "onder", "motorkap", "pompen", "olie", "wassen"] },
    reviews: [
      { naam: "Voorbeeldklant", tekst: "Eerlijk advies: ze zeiden dat mijn remmen nog prima waren. Dat hoor je niet vaak bij een garage." },
      { naam: "Voorbeeldklant", tekst: "APK en onderhoud in één ochtend, en ik kon met de leenfiets naar mijn werk. Top geregeld." },
      { naam: "Voorbeeldklant", tekst: "Mijn occasion rijdt na een jaar nog als een zonnetje. Fijne mensen en duidelijke afspraken." },
    ],
    uren: {
      kop: "Openingstijden",
      regels: [
        { dag: "Maandag t/m vrijdag", tijd: "08:00 – 17:30" },
        { dag: "Zaterdag", tijd: "09:00 – 13:00" },
        { dag: "Zondag", tijd: "Gesloten" },
      ],
    },
    faq: [
      { vraag: "Kan ik wachten tijdens de APK?", antwoord: "Ja, voor de APK en kleine klussen kun je bij ons wachten. Er staat koffie klaar." },
      { vraag: "Blijft mijn fabrieksgarantie gelden?", antwoord: "Ja, we werken volgens de voorschriften van de fabrikant en gebruiken onderdelen van dezelfde kwaliteit." },
      { vraag: "Doen jullie ook hybride en elektrische auto's?", antwoord: "Ja, onze monteurs zijn opgeleid voor hybride en elektrische auto's." },
      { vraag: "Kunnen jullie mijn banden bewaren?", antwoord: "Ja, in ons bandenhotel. Bij het wisselen controleren we meteen het profiel en de spanning." },
    ],
    cta: { kop: "Tijd voor onderhoud of APK?", tekst: "Plan een afspraak, dan staat er een plek in de werkplaats voor je klaar.", knop: "Plan een afspraak" },
    contact: { kop: "Plan een afspraak", tekst: "Vertel om welke auto het gaat en wat er moet gebeuren. We stellen een moment voor en bevestigen het dezelfde dag." },
    werken: { kop: "Werken bij De Rotonde", tekst: "Monteur, bandenwisselaar of autopoetser: in de drukke weken zoeken we extra handen. Kijk welke diensten er openstaan en reageer met één klik." },
  },
];

export const brancheVoorbeeldVoorSlug = (slug: string) => BRANCHE_VOORBEELDEN.find((v) => v.slug === slug) ?? null;

/** De pagina's van een voorbeeldsite; `foto` geeft het media-id van een foto, of null als hij niet op te halen was. */
export function brancheVoorbeeldPaginas(v: BrancheVoorbeeld, foto: (key: string) => string | null): Page[] {
  let n = 0;
  const block = <T extends BlockType>(type: T, props: BlockProps[T]) => ({ id: `bv${v.id.slice(0, 4)}${String(++n).padStart(3, "0")}`, type, props }) as Block;
  const items = v.aanbod.items.map((it) => ({ titel: it.titel, tekst: it.tekst, foto: foto(it.foto) }));
  const galerij = v.galerij.fotos.map(foto).filter((f): f is string => Boolean(f));
  const reviews = () => block("reviews", { kop: "Wat klanten zeggen (voorbeeld)", items: v.reviews.map((r) => ({ ...r, sterren: 5 })) });
  const uren = () => block("openingstijden", { kop: v.uren.kop, regels: v.uren.regels });
  // een restaurant: de knoppen gaan naar de vrije tijden, het blok staat op de home en bij contact
  const knopLink = v.reserveren ? "reserveren" : "contact";
  const cta = () => block("cta", { kop: v.cta.kop, tekst: v.cta.tekst, knop: v.cta.knop, knopLink });
  const reserveren = () => (v.reserveren ? [block("reserveren", { ...(newBlock("reserveren", "x").props as BlockProps["reserveren"]), ...v.reserveren })] : []);
  const naam = v.bedrijf.naam;
  const paginas: Page[] = [
    {
      id: `pv-${v.id}-home`,
      slug: "",
      titel: "Home",
      seoTitel: `${naam} | ${v.label} in ${PLAATS}`.slice(0, 70),
      seoOmschrijving: v.hero.tekst.slice(0, 160),
      blocks: [
        block("hero", { kop: v.hero.kop, tekst: v.hero.tekst, knop: v.hero.knop, knopLink, foto: foto(v.hero.foto) }),
        block("tekstFoto", { kop: v.over.kop, tekst: v.over.tekst, foto: foto(v.over.foto), fotoLinks: false }),
        block("diensten", { kop: v.aanbod.kop, items }),
        block("usps", v.usps),
        ...reserveren(),
        block("stappen", v.stappen),
        ...(galerij.length >= 2 ? [block("galerij", { kop: v.galerij.kop, fotos: galerij })] : []),
        reviews(),
        uren(),
        cta(),
      ],
    },
    {
      id: `pv-${v.id}-aanbod`,
      slug: "aanbod",
      titel: "Aanbod",
      seoTitel: `Aanbod | ${naam}`.slice(0, 70),
      seoOmschrijving: v.aanbod.intro.slice(0, 160),
      blocks: [block("diensten", { kop: v.aanbod.kop, items }), block("faq", { kop: "Veelgestelde vragen", items: v.faq }), cta()],
    },
    {
      id: `pv-${v.id}-over`,
      slug: "over-ons",
      titel: "Over ons",
      seoTitel: `Over ons | ${naam}`.slice(0, 70),
      seoOmschrijving: v.over.tekst.slice(0, 160),
      blocks: [
        block("tekstFoto", { kop: `Over ${naam}`, tekst: v.over.lang, foto: foto(v.over.foto), fotoLinks: true }),
        block("usps", v.usps),
        block("tekst", { kop: v.over.lang2Kop, tekst: v.over.lang2 }),
        reviews(),
      ],
    },
  ];
  if (v.werken) {
    paginas.push({
      id: `pv-${v.id}-werken`,
      slug: "werken-bij",
      titel: "Werken bij",
      seoTitel: `Werken bij ${naam}`.slice(0, 70),
      seoOmschrijving: v.werken.tekst.slice(0, 160),
      blocks: [block("vacatures", { kop: v.werken.kop, tekst: v.werken.tekst, aantal: 6 }), cta()],
    });
  }
  paginas.push({
    id: `pv-${v.id}-contact`,
    slug: "contact",
    titel: "Contact",
    seoTitel: `Contact | ${naam}`.slice(0, 70),
    seoOmschrijving: v.contact.tekst.slice(0, 160),
    blocks: [...reserveren(), block("contact", { kop: v.contact.kop, tekst: v.contact.tekst, formulier: true }), uren(), block("faq", { kop: "Veelgestelde vragen", items: v.faq })],
  });
  return paginas;
}
