// ---------------------------------------------------------------------------
// /werken-als en /werken-als/<functie> (22 nov 2026). Search Console liet veel vertoningen zien op functiezoekwoorden
// zonder eigen pagina ("werken als schoonmaker", "werken bij schoonmaakbedrijf"); wij hadden er nul. Per functie een eigen
// dataset (taken, wat je nodig hebt, tijden, voor wie het past, eigen vragen), dus geen sjabloon met één verwisseld woord:
// tests/seo-functies.test.ts houdt elk paar functiepagina's onder de 40% gelijkenis (zoals de stadspagina's).
// Het richttarief komt uit de catalogus (lib/shifts/catalogus.ts), dezelfde bron als /tarieven-overzicht: typ hier dus
// nooit een bedrag over. Geen tarief bekend, dan noemen we geen bedrag. Eerlijk: vanaf 18 jaar, met of zonder KVK (zonder
// KVK via een aangesloten uitzendbureau), en geen beloftes over aantallen klussen, verdiensten of snelheid.
// Puur: components/marketing/FunctieLanding.tsx tekent het, de sitemap, de rondgang en de tests lezen het.
// ---------------------------------------------------------------------------

import type { Metadata } from "next";
import { CITIES, type City } from "@/lib/seo-cities";
import { SECTORS, werkHubKop, werkKop, type Sector } from "@/lib/seo-sectors";
import { canonical } from "@/lib/seo";
import { seoBeschrijving, seoTitel, TITEL_MAX } from "@/lib/seo-tekst";
import { SHIFT_TEMPLATES } from "@/lib/shifts/catalogus";
import { euro } from "@/lib/kennis/tarieven-overzicht";
import { FOTOS, sectorFoto, type Foto } from "@/lib/marketing/fotos";
import { matenVoor, stadCijfers, waardeVan, type Link, type Maat, type Vraag } from "@/lib/seo-stad";
import { BIJBAAN_PAD, BIJBAAN_STAPPEN, CTA_TEKST, JONGEREN_HINT, JONGEREN_LINK, KNOPPEN } from "@/lib/seo-bijbaan";
import { UITZEND_WERKER } from "@/lib/seo-stad-pagina";

export const WERKEN_ALS_PAD = "/werken-als";
export const TARIEVEN_PAD = "/tarieven-overzicht";

/** De branches van de site (sleutels uit lib/seo-sectors.ts). */
export type FunctieBranche = "horeca" | "logistiek" | "retail" | "schoonmaak" | "evenementen" | "promotie" | "bezorging";

export interface Functie {
  slug: string;
  /** na "Werken …" en in de koppen: "als orderpicker", "in de bediening" */
  als: string;
  /** korte naam met hoofdletter, voor het overzicht en de kop boven de foto */
  naam: string;
  branche: FunctieBranche;
  /** sleutel in lib/shifts/catalogus.ts (het richttarief); null = geen tarief bekend, dan noemen we geen bedrag */
  tarief: string | null;
  /** slug uit lib/marketing/fotos.ts */
  foto: string;
  /** de meta-beschrijving, hooguit 155 tekens */
  beschrijving: string;
  zoekwoorden: readonly string[];
  intro: string;
  /** wat je doet: 3 tot 5 concrete taken */
  taken: readonly string[];
  /** wat je nodig hebt: vaardigheden, kleding, en een certificaat alleen als dat echt gevraagd wordt */
  nodig: readonly string[];
  tijden: string;
  voorWie: { student: string; bijbaan: string; zzp: string };
  /** 3 of 4 eigen vragen */
  faq: readonly Vraag[];
}

export const FUNCTIES: readonly Functie[] = [
  // ---- horeca -------------------------------------------------------------
  {
    slug: "bediening",
    als: "in de bediening",
    naam: "Bediening",
    branche: "horeca",
    tarief: "horeca",
    foto: "campagne-terras",
    beschrijving: "Werken in de bediening: gasten ontvangen, bestellingen opnemen en uitserveren. Wat je nodig hebt, de werktijden en het richttarief per uur.",
    zoekwoorden: ["werken in de bediening", "bediening bijbaan", "bedieningsmedewerker vacature", "serveerster bijbaan"],
    intro:
      "In de bediening ben je het gezicht van een restaurant, café of hotel: je ontvangt gasten, neemt bestellingen op en zorgt dat eten en drinken op tijd op tafel staan. Via ZekerFlex pak je losse diensten in de bediening, bij zaken die jij kiest.",
    taken: [
      "Gasten ontvangen, naar hun tafel brengen en de kaart uitleggen",
      "Bestellingen opnemen, vaak op een handterminal of tablet",
      "Gerechten en drankjes uitserveren en tafels afruimen",
      "Afrekenen aan tafel of bij de kassa",
      "Na sluitingstijd de zaal en het terras klaarzetten voor de volgende dag",
    ],
    nodig: [
      "Gastvrijheid en een goed geheugen voor bestellingen",
      "Een dienblad kunnen dragen en lang op je benen staan",
      "Nederlands of Engels met gasten; welke taal de zaak vraagt, staat bij de dienst",
      "Meestal een zwarte broek en dichte, zwarte schoenen; een schort krijg je vaak van de zaak",
    ],
    tijden:
      "De meeste diensten in de bediening zijn 's middags en 's avonds, van ongeveer 11.00 tot 15.00 of van 17.00 tot na sluitingstijd. In het weekend en op feestdagen is het het drukst, en terrassen zoeken vooral in de lente en de zomer extra handen.",
    voorWie: {
      student: "Avonddiensten en weekenden passen goed naast colleges, en je leert snel met allerlei mensen omgaan.",
      bijbaan: "Naast een baan overdag werk je een of twee avonden per week in een restaurant of café.",
      zzp: "Als zzp'er kies je per dienst bij welke zaak je werkt; je uren en je factuur lopen via de app.",
    },
    faq: [
      {
        q: "Heb ik ervaring nodig om in de bediening te werken?",
        a: "Niet altijd. Bij elke dienst staat wat de zaak vraagt. Drukke à-la-carterestaurants vragen vaker ervaring; een lunchroom of terras is een goede plek om te beginnen.",
      },
      {
        q: "Krijg ik fooi als ik via ZekerFlex in de bediening werk?",
        a: "Fooi regelt de zaak zelf; vraag bij je eerste dienst hoe dat daar gaat. Wat je via de app verdient, is het uurtarief van de dienst.",
      },
      {
        q: "Wat is het verschil tussen bediening en runner?",
        a: "Een runner brengt vooral gerechten en drankjes van de keuken en de bar naar de tafels. In de bediening heb je zelf tafels: je neemt bestellingen op, geeft advies en rekent af.",
      },
    ],
  },
  {
    slug: "barmedewerker",
    als: "als barmedewerker",
    naam: "Barmedewerker",
    branche: "horeca",
    tarief: "barista",
    foto: "campagne-tap",
    beschrijving: "Werken als barmedewerker: tappen, schenken en afrekenen in cafés, clubs en op festivals. Wat je nodig hebt, de werktijden en het richttarief.",
    zoekwoorden: ["werken als barmedewerker", "barmedewerker bijbaan", "bar werk", "tappen bijbaan"],
    intro:
      "Als barmedewerker sta je achter de tap in een café, restaurant, club of op een festival. Je schenkt bier, wijn en frisdrank, maakt soms een cocktail en houdt de bar schoon terwijl het druk is.",
    taken: [
      "Bier tappen, wijn en frisdrank schenken en eenvoudige cocktails maken",
      "Bestellingen aan de bar aannemen en afrekenen met pin of kassa",
      "Glazen spoelen, koelingen bijvullen en fusten wisselen",
      "De bar schoon en overzichtelijk houden, ook als er een rij staat",
    ],
    nodig: [
      "Snel kunnen schakelen tussen bestellingen en rustig blijven bij drukte",
      "Ervaring met tappen helpt, maar staat lang niet altijd als eis bij de dienst",
      "Kennis van de regels: geen alcohol voor iemand onder de 18 of voor iemand die te veel op heeft",
      "Zwarte kleding of een shirt van de zaak; wat er gevraagd wordt, staat bij de dienst",
    ],
    tijden:
      "Achter de bar werk je vooral 's avonds en 's nachts, van ongeveer 20.00 tot sluitingstijd, en in het weekend. Bij evenementen en festivals zijn het vaak lange dagen buiten, ook overdag.",
    voorWie: {
      student: "Werken achter de bar past bij een studentenleven: laat op de avond en vaak in het weekend.",
      bijbaan: "Wie overdag een vaste baan heeft, pakt vrijdag- of zaterdagavonden achter de bar.",
      zzp: "Als zzp'er werk je voor verschillende cafés en evenementen; per dienst zie je het uurtarief voordat je reageert.",
    },
    faq: [
      {
        q: "Moet ik een cursus hebben om achter de bar te werken?",
        a: "Voor tappen en schenken heb je geen diploma nodig. Een leidinggevende in de horeca moet wel de Verklaring Sociale Hygiëne hebben, maar dat geldt niet voor een barmedewerker.",
      },
      {
        q: "Wat is het verschil tussen een barmedewerker en een barista?",
        a: "Een barista werkt vooral met koffie, vaak overdag. Een barmedewerker staat achter de tap en werkt vooral 's avonds. In het tarievenoverzicht staan ze samen als 'Barista / barmedewerker'.",
      },
      {
        q: "Kan ik ook op festivals achter de bar staan?",
        a: "Ja. Festival- en evenementenbars zoeken vooral in de zomer extra mensen. Die diensten vind je ook bij werken op evenementen.",
      },
    ],
  },
  {
    slug: "barista",
    als: "als barista",
    naam: "Barista",
    branche: "horeca",
    tarief: "barista",
    foto: "campagne-koffiebar",
    beschrijving: "Werken als barista: espresso, cappuccino en melk opschuimen in koffiebars en lunchrooms. Wat je nodig hebt, de werktijden en het richttarief.",
    zoekwoorden: ["werken als barista", "barista bijbaan", "barista vacature", "koffiebar bijbaan"],
    intro:
      "Als barista maak je koffie voor gasten in een koffiebar, lunchroom, hotel of bedrijfsrestaurant: van espresso tot flat white, met goed opgeschuimde melk. Daarnaast help je aan de toonbank en houd je de machine schoon.",
    taken: [
      "Espresso, cappuccino, latte en thee maken op een professionele machine",
      "Melk opschuimen en, als de zaak dat wil, latte art schenken",
      "Bestellingen aannemen aan de toonbank en afrekenen",
      "Gebak en broodjes klaarzetten en de vitrine bijvullen",
      "De molen in de ochtend afstellen en de machine aan het eind van de dag schoonmaken",
    ],
    nodig: [
      "Ervaring met een espressomachine: sommige zaken vragen het, andere niet, en dat staat bij de dienst",
      "Schoon en precies werken, want elke kop moet even goed smaken",
      "Een vriendelijke houding aan de toonbank, ook als er een rij staat",
      "Meestal een schort van de zaak en dichte schoenen",
    ],
    tijden:
      "Koffiebars en lunchrooms beginnen vroeg: diensten lopen vaak van 7.00 of 8.00 tot de middag, of van de middag tot sluitingstijd rond 18.00. Op zaterdag en zondag is het meestal het drukst.",
    voorWie: {
      student: "Ochtend- en weekenddiensten passen rond je rooster, en koffie maken is een vak dat je overal kunt gebruiken.",
      bijbaan: "Een paar uur op zaterdag of zondag in een koffiebar is een overzichtelijke bijbaan.",
      zzp: "Als zzp'er werk je voor koffiebars, hotels en evenementen met een koffiekar.",
    },
    faq: [
      {
        q: "Moet ik latte art kunnen?",
        a: "Nee, niet voor elke dienst. Het staat bij de dienst als een zaak het vraagt. Goed opgeschuimde melk en elke kop even lekker zijn belangrijker.",
      },
      {
        q: "Is een baristacursus nodig?",
        a: "Een cursus is niet verplicht. Heb je er een gedaan, zet dat dan in je profiel: opdrachtgevers zien het als je reageert.",
      },
      {
        q: "Werk ik als barista alleen met koffie?",
        a: "Meestal niet. In de meeste koffiebars help je ook aan de toonbank, maak je een broodje of ruim je tafels af. Wat erbij hoort, staat in de omschrijving van de dienst.",
      },
    ],
  },
  {
    slug: "afwasser",
    als: "als afwasser",
    naam: "Afwasser",
    branche: "horeca",
    tarief: "afwas",
    foto: "campagne-keuken",
    beschrijving: "Werken als afwasser: vaat, pannen en de spoelkeuken op orde in restaurants en hotels. Geen ervaring nodig. Werktijden en richttarief per uur.",
    zoekwoorden: ["werken als afwasser", "afwasser bijbaan", "afwasser vacature", "spoelkeuken"],
    intro:
      "Als afwasser houd je de keuken draaiende: zonder schone borden, pannen en glazen staat alles stil. Je werkt in de spoelkeuken van een restaurant, hotel of cateraar, of bij een evenement.",
    taken: [
      "Borden, bestek, glazen en pannen voorspoelen en door de vaatwasmachine halen",
      "Schone vaat terugzetten waar de koks en de bediening hem nodig hebben",
      "Afval en lege kratten wegbrengen en scheiden",
      "Aan het eind van de dienst de spoelkeuken en de vloer schoonmaken",
    ],
    nodig: [
      "Tempo kunnen houden als de borden blijven komen",
      "Geen ervaring: afwassen is vaak de eerste dienst die iemand in een keuken doet",
      "Antislipschoenen, want de vloer van een spoelkeuken is vaak nat",
      "Tegen warmte en vocht kunnen, want bij de machine is het warm en vochtig",
    ],
    tijden:
      "Afwassers werken vooral 's avonds, van ongeveer 17.00 tot de keuken dicht is en alles schoon staat, vaak rond 23.00. Bij hotels en cateraars zijn er ook diensten na het ontbijt of de lunch.",
    voorWie: {
      student: "Een goede eerste bijbaan: je hebt geen ervaring nodig en je ziet hoe een professionele keuken werkt.",
      bijbaan: "Avonddiensten in een vast ritme, zonder dat je met gasten hoeft te praten.",
      zzp: "Als zzp'er kies je zelf bij welke restaurants en cateraars je afwasdiensten doet.",
    },
    faq: [
      {
        q: "Kan ik als afwasser doorgroeien naar de keuken?",
        a: "Dat gebeurt vaak: wie in de spoelkeuken werkt, helpt ook mee met voorbereiden. Kijk dan ook naar diensten als keukenhulp; daarvoor ligt het richttarief hoger.",
      },
      {
        q: "Is afwassen zwaar werk?",
        a: "Je staat de hele dienst, tilt kratten met vaat en het is warm bij de machine. Wie dat niet erg vindt, heeft er meestal geen moeite mee.",
      },
      {
        q: "Moet ik zelf schoonmaakmiddelen meenemen?",
        a: "Nee. De zaak zorgt voor de vaatwasmachine, de middelen en handschoenen. Neem zelf wel antislipschoenen mee.",
      },
    ],
  },
  {
    slug: "keukenhulp",
    als: "als keukenhulp",
    naam: "Keukenhulp",
    branche: "horeca",
    tarief: "keukenhulp",
    foto: "horeca-keuken-team",
    beschrijving: "Werken als keukenhulp: mise-en-place, snijden en de koks helpen. Wat je nodig hebt, wanneer je werkt en het richttarief, met of zonder KVK.",
    zoekwoorden: ["werken als keukenhulp", "keukenhulp bijbaan", "keukenhulp vacature", "keukenmedewerker"],
    intro:
      "Als keukenhulp help je de koks met alles wat voor en tijdens de service moet gebeuren: groenten snijden, sauzen en garnituur klaarzetten en de werkplek op orde houden. Je werkt in restaurantkeukens, bij cateraars en in bedrijfsrestaurants.",
    taken: [
      "Mise-en-place voorbereiden: groenten wassen en snijden, sauzen en garnituur klaarzetten",
      "Eenvoudige gerechten of onderdelen bereiden volgens de aanwijzingen van de kok",
      "Leveringen controleren en de koelcel en de voorraad netjes houden",
      "De werkbank schoonhouden en meehelpen met de afwas als het nodig is",
    ],
    nodig: [
      "Kunnen werken met een mes en de basis van hygiëne in een keuken kennen",
      "Precies doen wat de kok vraagt, ook op een druk moment",
      "Een koksbuis en antislipschoenen; je haar draag je vast",
      "Een hygiënecursus (HACCP) is voor een keukenhulp niet verplicht; heb je er een, zet hem in je profiel",
    ],
    tijden:
      "Keukenhulpen beginnen vaak eerder dan de bediening, omdat de voorbereiding vóór de service klaar moet zijn: bijvoorbeeld van 14.00 tot 22.00. Bij bedrijfsrestaurants en cateraars zijn het vaker dagdiensten op werkdagen.",
    voorWie: {
      student: "Wil je later kok worden of sta je gewoon graag in de keuken, dan leer je hier de basis.",
      bijbaan: "Ook naast een andere baan te doen, op avonden en in het weekend.",
      zzp: "Als zzp'er werk je in verschillende keukens en zie je hoe elke chef zijn keuken inricht.",
    },
    faq: [
      {
        q: "Wat is het verschil tussen een keukenhulp en een kok?",
        a: "Een kok draait zelfstandig een station en bereidt de gerechten van de kaart. Een keukenhulp bereidt voor en helpt de kok. Daarom ligt het richttarief voor een zelfstandig werkend kok hoger.",
      },
      {
        q: "Moet ik kunnen koken?",
        a: "Je hoeft geen kok te zijn, maar je moet wel netjes kunnen snijden en een recept kunnen volgen. De kok vertelt wat er moet gebeuren.",
      },
      {
        q: "Werk ik als keukenhulp ook met allergenen?",
        a: "Ja, in elke keuken. Je let op welke ingrediënten in welk gerecht gaan en houdt gereedschap en bakken gescheiden als de kok dat vraagt.",
      },
    ],
  },
  {
    slug: "kok",
    als: "als kok",
    naam: "Kok",
    branche: "horeca",
    tarief: "kok",
    foto: "campagne-kok",
    beschrijving: "Werken als kok via ZekerFlex: zelfstandig een station draaien als invalkok in restaurants, hotels en catering. Eisen, werktijden en richttarief.",
    zoekwoorden: ["werken als kok", "invalkok", "kok zzp", "zelfstandig werkend kok vacature"],
    intro:
      "Als zelfstandig werkend kok draai je een station in een restaurant-, hotel- of cateringkeuken en bereid je de gerechten van de kaart zonder dat iemand naast je staat. Flexibel werken als kok betekent vaak invallen: bij ziekte, drukte of een extra evenement.",
    taken: [
      "Een station draaien, zoals warm, koud of de pass, en gerechten bereiden volgens de kaart",
      "De mise-en-place van je eigen station op tijd klaar hebben",
      "De hygiëneregels (HACCP) bewaken: temperaturen, houdbaarheid en schoon werken",
      "Een keukenhulp of afwasser aansturen als die er is",
      "Aan het eind van de avond je station afbreken en schoonmaken",
    ],
    nodig: [
      "Ervaring als kok, zodat je zonder lange uitleg een station overneemt",
      "Kennis van HACCP en allergenen",
      "Koksbuis, koksbroek en antislipschoenen; veel koks nemen hun eigen messen mee",
      "Een koksdiploma is niet wettelijk verplicht; opdrachtgevers kijken vooral naar je ervaring",
    ],
    tijden:
      "Koks werken meestal van de middag tot na de laatste gang, bijvoorbeeld van 15.00 tot 23.00, en vaak in het weekend. Bij cateraars en evenementen zijn het soms lange dagdiensten op locatie.",
    voorWie: {
      student: "Voor koks in opleiding en studenten met keukenervaring: avond- en weekenddiensten naast je studie.",
      bijbaan: "Ben je kok en wil je naast je vaste baan extra diensten, dan kies je zelf welke.",
      zzp: "Veel invalkoks werken als zzp'er: je kiest zelf je keukens en je werkdagen, en je factuur loopt via de app.",
    },
    faq: [
      {
        q: "Wat verwacht een keuken van een invalkok?",
        a: "Dat je zonder lange uitleg een station kunt overnemen. In de omschrijving van de dienst staat meestal wat voor keuken het is, zodat je weet waar je instapt.",
      },
      {
        q: "Heb ik een KVK-nummer nodig als kok?",
        a: "Niet per se. Met een KVK-nummer werk je als zzp'er; zonder KVK werk je als uitzendkracht via een aangesloten uitzendbureau, als er uitzendklussen voor koks zijn.",
      },
      {
        q: "Wat betekent 'zelfstandig werkend kok'?",
        a: "Zo staat de functie in het tarievenoverzicht: iemand die een station kan draaien zonder begeleiding. Ben je nog in opleiding, kijk dan ook naar diensten als keukenhulp.",
      },
    ],
  },
  {
    slug: "runner",
    als: "als runner",
    naam: "Runner",
    branche: "horeca",
    tarief: "runner",
    foto: "campagne-bediening",
    beschrijving: "Werken als runner: gerechten en drankjes naar de tafels brengen en afruimen. Een goede eerste horecabaan. Werktijden en richttarief per uur.",
    zoekwoorden: ["werken als runner", "runner horeca", "runner bijbaan", "runner restaurant vacature"],
    intro:
      "Als runner breng je gerechten en drankjes van de keuken en de bar naar de juiste tafel, zo snel dat niets afkoelt of lauw wordt. Je bent de schakel tussen de pass en de zaal in drukke restaurants, hotels en partycentra.",
    taken: [
      "Borden van de pass naar de juiste tafel brengen, op tafelnummer",
      "Drankjes van de bar uitserveren",
      "Tafels afruimen en opnieuw dekken tussen gasten door",
      "De bediening helpen als het druk is, bijvoorbeeld met water of brood",
    ],
    nodig: [
      "Meerdere borden tegelijk kunnen dragen, of dat willen leren",
      "Overzicht houden: welke tafel wacht nog en wat hoort waar",
      "Graag in beweging zijn, want als runner loop je de hele dienst",
      "Een zwarte broek en zwarte schoenen, of wat de zaak vraagt",
    ],
    tijden:
      "Runners zijn vooral nodig op de drukste momenten: de lunch en het diner, van ongeveer 17.00 tot 22.00, en bij bruiloften en partijen. Weekenden en feestdagen zijn de piek.",
    voorWie: {
      student: "Een makkelijke instap in de horeca: je hoeft nog geen bestellingen op te nemen of af te rekenen.",
      bijbaan: "Korte avonddiensten op de drukste uren passen naast een andere baan.",
      zzp: "Als zzp'er pak je runnerdiensten bij restaurants, partycentra en evenementen.",
    },
    faq: [
      {
        q: "Wat is het verschil tussen een runner en de bediening?",
        a: "Een runner brengt en ruimt af. In de bediening heb je zelf tafels: je neemt bestellingen op, geeft advies en rekent af. Veel mensen beginnen als runner.",
      },
      {
        q: "Heb ik ervaring nodig als runner?",
        a: "Meestal niet. De tafelnummers en de werkwijze van de zaak hoor je bij het begin van de dienst.",
      },
      {
        q: "Sta ik als runner ook achter de bar?",
        a: "Soms, als dat zo is afgesproken. Wat de zaak precies vraagt, staat bij de dienst.",
      },
    ],
  },

  // ---- logistiek ----------------------------------------------------------
  {
    slug: "orderpicker",
    als: "als orderpicker",
    naam: "Orderpicker",
    branche: "logistiek",
    tarief: "orderpicker",
    foto: "campagne-orderpicker",
    beschrijving: "Werken als orderpicker: orders verzamelen met een handscanner in een magazijn of distributiecentrum. Taken, ploegendiensten en het richttarief.",
    zoekwoorden: ["werken als orderpicker", "orderpicker vacature", "orderpicker bijbaan", "orderpicken"],
    intro:
      "Als orderpicker verzamel je in een magazijn of distributiecentrum de producten van een bestelling en zet je ze klaar voor verzending. Een handscanner of een headset vertelt je wat je moet pakken en waar het ligt.",
    taken: [
      "Orders verzamelen uit de stellingen met een handscanner of via spraak (pick-by-voice)",
      "Producten tellen, scannen en controleren op schade",
      "Rolcontainers of pallets vullen en klaarzetten bij het juiste dock",
      "Lege dozen en folie opruimen en je looproute vrijhouden",
    ],
    nodig: [
      "Veiligheidsschoenen (S3): die zijn in de meeste magazijnen verplicht",
      "Nauwkeurig werken, want een verkeerd product komt bij een klant terecht",
      "Een goede conditie: je loopt en tilt de hele dienst",
      "Voor orderpicken met een elektrische pallettruck (EPT) vraagt een magazijn soms een instructie of certificaat; dat staat dan bij de dienst",
    ],
    tijden:
      "Distributiecentra werken vaak in ploegen: een vroege dienst van rond 6.00 tot 14.30, een late tot ongeveer 23.00 en soms een nacht. Voor de feestdagen en bij acties van webwinkels is het drukker.",
    voorWie: {
      student: "Vroege of late ploegen in het weekend combineer je goed met colleges, en je hoeft geen ervaring te hebben.",
      bijbaan: "Een avondploeg naast je dagbaan, of alleen in de drukke weken van het jaar.",
      zzp: "Orderpicken gebeurt meestal onder leiding van het magazijn. Dan past werken als uitzendkracht via een aangesloten uitzendbureau vaak beter dan als zzp'er (Wet DBA).",
    },
    faq: [
      {
        q: "Wat is het verschil tussen een orderpicker en een magazijnmedewerker?",
        a: "Een orderpicker verzamelt vooral orders. Een magazijnmedewerker doet meer: goederen ontvangen, wegzetten, voorraad tellen en ook orderpicken. Het richttarief is voor allebei hetzelfde.",
      },
      {
        q: "Moet ik zwaar tillen als orderpicker?",
        a: "Dat hangt af van het magazijn: kleding of cosmetica is licht, drank of bouwmateriaal zwaar. Wat je tilt, staat meestal in de omschrijving van de dienst.",
      },
      {
        q: "Wat is pick-by-voice?",
        a: "Een headset vertelt je naar welke plek je moet en hoeveel je pakt; jij bevestigt met je stem. Zo heb je je handen vrij. Het magazijn legt bij de start uit hoe hun systeem werkt.",
      },
    ],
  },
  {
    slug: "magazijnmedewerker",
    als: "als magazijnmedewerker",
    naam: "Magazijnmedewerker",
    branche: "logistiek",
    tarief: "magazijn",
    foto: "campagne-steekkar",
    beschrijving: "Werken als magazijnmedewerker: goederen ontvangen, wegzetten en verzenden. Wat je nodig hebt, de werktijden en het richttarief per uur.",
    zoekwoorden: ["werken als magazijnmedewerker", "magazijnmedewerker vacature", "magazijn bijbaan", "magazijnwerk"],
    intro:
      "Als magazijnmedewerker zorg je dat goederen binnenkomen, op de juiste plek liggen en op tijd weer de deur uit gaan. Je werkt bij groothandels, webwinkels, distributiecentra en productiebedrijven.",
    taken: [
      "Vrachtwagens lossen en binnenkomende goederen controleren met de pakbon",
      "Goederen wegzetten op de juiste locatie in de stelling",
      "Orders picken en inpakken voor verzending",
      "Voorraad tellen en verschillen melden",
      "Het magazijn opgeruimd en veilig houden: paden vrij, afval weg",
    ],
    nodig: [
      "Veiligheidsschoenen (S3) zijn verplicht",
      "Ervaring met een handscanner of een voorraadsysteem helpt",
      "Overzicht houden als er veel tegelijk binnenkomt",
      "Voor werk op een heftruck of reachtruck vraagt een opdrachtgever een heftruckcertificaat; zonder werk je met de hand of een handpallettruck",
    ],
    tijden:
      "Op werkdagen beginnen magazijnen vroeg, vaak rond 7.00. Bij webwinkels en distributiecentra wordt ook 's avonds en in het weekend gewerkt, in ploegen. In november en december is het het drukst.",
    voorWie: {
      student: "In de zomer en rond de feestdagen zoeken magazijnen extra mensen, precies als jij vrij bent.",
      bijbaan: "Avond- of zaterdagdiensten naast je vaste werk.",
      zzp: "Magazijnwerk is meestal werk onder leiding van de opdrachtgever; via een aangesloten uitzendbureau werken is dan vaak de passende vorm.",
    },
    faq: [
      {
        q: "Heb ik een heftruckcertificaat nodig?",
        a: "Alleen als je op een heftruck of reachtruck gaat rijden. Bij de dienst staat of dat zo is. Heb je het certificaat, zet het dan in je profiel; voor heftruckwerk ligt het richttarief hoger.",
      },
      {
        q: "Wat voor magazijn is het?",
        a: "Dat verschilt per dienst: van een koel- of vriescel bij een groothandel tot een webwinkel met kleding. Werk je in de kou, dan staat meestal bij de dienst welke kleding je krijgt of meeneemt.",
      },
      {
        q: "Kan ik vaker bij hetzelfde magazijn werken?",
        a: "Ja, als het klikt. Een opdrachtgever kan je als favoriet opslaan en je opnieuw uitnodigen.",
      },
    ],
  },
  {
    slug: "inpakker",
    als: "als inpakker",
    naam: "Inpakker",
    branche: "logistiek",
    tarief: "inpakker",
    foto: "campagne-inpakken",
    beschrijving: "Werken als inpakker: producten inpakken en verzendklaar maken bij webwinkels en fulfilment. Geen ervaring nodig. Werktijden en richttarief.",
    zoekwoorden: ["werken als inpakker", "inpakker vacature", "inpakwerk bijbaan", "inpakken webwinkel"],
    intro:
      "Als inpakker maak je producten klaar voor de klant: in een doos, met vulmateriaal, de pakbon en het juiste verzendlabel. Je werkt bij webwinkels, fulfilmentcentra en bloemen- of voedingsbedrijven.",
    taken: [
      "Producten controleren en netjes in dozen of zakken verpakken",
      "Verzendlabels printen en plakken en pakketten sorteren per vervoerder",
      "Cadeauverpakkingen of displays maken bij acties en feestdagen",
      "Je inpaktafel bijvullen met dozen, tape en vulmateriaal",
    ],
    nodig: [
      "Precies werken: de juiste maat, de juiste kleur, het juiste adres",
      "Lang aan een tafel kunnen staan of zitten en een vast tempo aankunnen",
      "Geen ervaring of diploma",
      "Gewone, nette werkkleding; bij voedingsmiddelen krijg je soms een haarnet en een schort",
    ],
    tijden:
      "Inpakwerk zit vaak in dag- en avonddiensten, bijvoorbeeld van 8.00 tot 16.30 of van 16.00 tot 23.00. Vóór Sinterklaas, Kerst en Black Friday zoeken webwinkels de meeste extra handen.",
    voorWie: {
      student: "Overzichtelijk werk zonder ervaring, goed te combineren met een vrije middag of avond.",
      bijbaan: "Een rustige bijbaan voor wie graag met de handen bezig is.",
      zzp: "Inpakken gebeurt volgens de werkwijze van het bedrijf zelf. Werk je zo, dan past een uitzendklus via een aangesloten uitzendbureau vaak beter dan zzp.",
    },
    faq: [
      {
        q: "Is inpakken hetzelfde als orderpicken?",
        a: "Nee. Een orderpicker haalt de producten uit de stellingen, een inpakker maakt ze klaar voor verzending. In kleine magazijnen doe je soms allebei.",
      },
      {
        q: "Werk ik als inpakker alleen?",
        a: "Vaak sta je aan een eigen tafel, maar in een team met andere inpakkers en orderpickers. Een teamleider vertelt wat er die dag moet gebeuren.",
      },
      {
        q: "Welke producten pak ik in?",
        a: "Dat verschilt per dienst: kleding, cosmetica, elektronica, bloemen of pakketten met eten. Het staat in de omschrijving van de dienst.",
      },
    ],
  },
  {
    slug: "heftruckchauffeur",
    als: "als heftruckchauffeur",
    naam: "Heftruckchauffeur",
    branche: "logistiek",
    tarief: "heftruck",
    foto: "campagne-laaddock",
    beschrijving: "Werken als heftruckchauffeur: laden, lossen en pallets op hoogte zetten, met een heftruckcertificaat. Ploegendiensten en het richttarief per uur.",
    zoekwoorden: ["werken als heftruckchauffeur", "heftruckchauffeur vacature", "heftruck bijbaan", "reachtruck chauffeur"],
    intro:
      "Als heftruckchauffeur laad en los je vrachtwagens en zet je pallets op hoogte in de stelling. Je werkt in distributiecentra, bij groothandels, in de bouwmaterialenhandel en in productiebedrijven.",
    taken: [
      "Vrachtwagens laden en lossen met de heftruck",
      "Pallets wegzetten en ophalen op hoogte met een reachtruck",
      "Goederen naar de productielijn of het expeditiedock brengen",
      "Je truck controleren voordat je begint en schade melden",
    ],
    nodig: [
      "Een geldig heftruckcertificaat: dat vraagt de opdrachtgever voor dit werk",
      "Voor een reachtruck of een orderpicktruck vraagt een opdrachtgever soms een apart certificaat",
      "Veiligheidsschoenen (S3) en een veiligheidshesje",
      "Ervaring met rijden op hoogte en in smalle gangpaden",
    ],
    tijden:
      "Heftruckchauffeurs werken vaak in ploegen, ook 's nachts, omdat vrachtwagens de hele dag aankomen en vertrekken. In de bouwmaterialenhandel begint het vroeg, rond 6.00.",
    voorWie: {
      student: "Heb je al een certificaat, dan is dit weekend- of vakantiewerk met een hoger richttarief dan gewoon magazijnwerk.",
      bijbaan: "Met je certificaat doe je ook naast een andere baan losse diensten.",
      zzp: "Ook voor heftruckwerk geldt: werk je onder leiding van het magazijn, dan is een uitzendklus via een aangesloten uitzendbureau vaak de passende vorm.",
    },
    faq: [
      {
        q: "Hoe kom ik aan een heftruckcertificaat?",
        a: "Via een erkende opleider; de cursus duurt meestal een of twee dagen. ZekerFlex geeft zelf geen cursussen.",
      },
      {
        q: "Waarom is het richttarief hoger dan voor een magazijnmedewerker?",
        a: "Omdat je een certificaat nodig hebt en met zware machines werkt. In het tarievenoverzicht ligt het richttarief voor een heftruckchauffeur daarom boven dat van een magazijnmedewerker.",
      },
      {
        q: "Moet ik mijn certificaat laten zien?",
        a: "Ja. Zet het in je profiel; een opdrachtgever kan erom vragen voordat je op de heftruck stapt.",
      },
    ],
  },

  // ---- retail -------------------------------------------------------------
  {
    slug: "vakkenvuller",
    als: "als vakkenvuller",
    naam: "Vakkenvuller",
    branche: "retail",
    tarief: "vakkenvuller",
    foto: "campagne-schap",
    beschrijving: "Werken als vakkenvuller: schappen vullen in de supermarkt of drogist, vaak 's avonds. Vanaf 18 jaar, met of zonder KVK. Tijden en richttarief.",
    zoekwoorden: ["werken als vakkenvuller", "vakkenvuller bijbaan", "vakkenvuller 18 jaar", "vakkenvullen supermarkt"],
    intro:
      "Als vakkenvuller zorg je dat de schappen in de supermarkt, drogist of bouwmarkt vol en netjes zijn. Je pakt rolcontainers uit, zet producten op de juiste plek en let op de houdbaarheid.",
    taken: [
      "Rolcontainers uitpakken en producten in het juiste schap zetten",
      "Producten naar voren zetten (spiegelen), zodat het schap er vol uitziet",
      "Houdbaarheidsdata controleren en de oudste producten vooraan zetten",
      "Dozen en folie opruimen en de winkelvloer vrijhouden",
      "Klanten de weg wijzen als ze iets zoeken",
    ],
    nodig: [
      "Zelfstandig en in een vast tempo kunnen werken",
      "Tillen en bukken is geen probleem voor je",
      "Geen ervaring",
      "Een shirt of jas van de winkel krijg je meestal; zelf draag je dichte schoenen",
    ],
    tijden:
      "Vakkenvullen gebeurt vaak buiten de drukte: 's avonds na 18.00, vroeg in de ochtend vóór de winkel opengaat, of op zaterdag. Sommige supermarkten vullen ook 's nachts.",
    voorWie: {
      student: "Een klassieke bijbaan voor studenten; via ZekerFlex kan het vanaf 18 jaar.",
      bijbaan: "Een paar avonduren na je werk, op een vaste of wisselende dag.",
      zzp: "Vakkenvullen gebeurt volgens de werkwijze van de winkel; een uitzendklus via een aangesloten uitzendbureau past daar vaak beter bij dan zzp.",
    },
    faq: [
      {
        q: "Vanaf welke leeftijd kan ik vakkenvullen via ZekerFlex?",
        a: "Vanaf 18 jaar. Ben je 16 of 17, laat dan je e-mailadres achter op de pagina 'Nog geen 18'.",
      },
      {
        q: "Wat betekent spiegelen?",
        a: "Producten naar de voorkant van het schap schuiven en recht zetten, zodat het schap vol en netjes oogt. Dat doe je vooral aan het eind van de dienst.",
      },
      {
        q: "Werk ik als vakkenvuller ook achter de kassa?",
        a: "Alleen als dat bij de dienst staat. Kassawerk is een eigen functie, met een iets hoger richttarief.",
      },
    ],
  },
  {
    slug: "kassamedewerker",
    als: "als kassamedewerker",
    naam: "Kassamedewerker",
    branche: "retail",
    tarief: "kassa",
    foto: "retail-kassa",
    beschrijving: "Werken als kassamedewerker: klanten afrekenen in supermarkten en winkels. Wat je nodig hebt, de werktijden en het richttarief per uur.",
    zoekwoorden: ["werken als kassamedewerker", "kassamedewerker bijbaan", "caissière vacature", "kassa werk"],
    intro:
      "Als kassamedewerker reken je klanten af in een supermarkt, warenhuis, tuincentrum of op een evenement. Je bent vaak het laatste contact van een klant met de winkel, dus vriendelijk en nauwkeurig werken telt.",
    taken: [
      "Producten scannen en afrekenen met pin, contant geld of een cadeaukaart",
      "Klanten helpen met vragen over prijzen, acties en retouren",
      "De zelfscankassa's in de gaten houden en klanten daarbij helpen",
      "De kassa openen en aan het eind van de dienst opmaken",
    ],
    nodig: [
      "Rustig en vriendelijk blijven bij een lange rij",
      "Nauwkeurig met geld omgaan: aan het eind moet je kassa kloppen",
      "Letten op de leeftijd bij alcohol en tabak, en dan naar een identiteitsbewijs vragen",
      "Geen diploma; de winkel legt het kassasysteem uit",
    ],
    tijden:
      "Kassadiensten volgen de openingstijden: van 8.00 tot 14.00, van 14.00 tot sluitingstijd, op koopavond en op zondag. Rond de feestdagen en in de vakanties is het het drukst.",
    voorWie: {
      student: "Diensten op koopavond en in het weekend laten je doordeweekse dagen vrij voor je studie.",
      bijbaan: "Een paar uur per week achter de kassa, in een winkel bij jou in de buurt.",
      zzp: "Kassawerk doe je volgens de regels van de winkel; via een aangesloten uitzendbureau werken sluit daar vaak beter op aan dan zzp.",
    },
    faq: [
      {
        q: "Moet ik goed kunnen rekenen als kassamedewerker?",
        a: "Het kassasysteem rekent voor je. Wel tel je contant geld na en controleer je aan het eind of de kassa klopt.",
      },
      {
        q: "Waarom moet ik naar een ID vragen?",
        a: "Alcohol en tabak mogen alleen verkocht worden aan mensen van 18 jaar en ouder. Twijfel je over iemands leeftijd, dan vraag je om een identiteitsbewijs.",
      },
      {
        q: "Wat als mijn kassa niet klopt?",
        a: "Meld het meteen bij de leidinggevende. Een klein verschil komt voor; de winkel bepaalt hoe het wordt nagekeken.",
      },
    ],
  },
  {
    slug: "verkoopmedewerker",
    als: "als verkoopmedewerker",
    naam: "Verkoopmedewerker",
    branche: "retail",
    tarief: "verkoop",
    foto: "campagne-boetiek",
    beschrijving: "Werken als verkoopmedewerker: klanten adviseren en afrekenen in kleding-, woon- en elektronicawinkels. Werktijden, eisen en het richttarief.",
    zoekwoorden: ["werken als verkoopmedewerker", "verkoopmedewerker bijbaan", "winkelmedewerker vacature", "verkoper kledingwinkel"],
    intro:
      "Als verkoopmedewerker help je klanten in de winkel: je geeft advies, zoekt de juiste maat of het juiste product en rekent af. Je werkt in kledingzaken, elektronicawinkels, woonwinkels en op de markt.",
    taken: [
      "Klanten begroeten, vragen wat ze zoeken en advies geven",
      "Nieuwe collectie uitpakken, prijzen en mooi presenteren",
      "Paskamers bijhouden en kleding terughangen",
      "Afrekenen en retouren afhandelen",
    ],
    nodig: [
      "Makkelijk praten met onbekenden en eerlijk zijn in je advies",
      "Interesse in wat de winkel verkoopt, of de wil om je erin te verdiepen",
      "Nette, verzorgde kleding; sommige winkels vragen kleding uit hun eigen collectie",
      "Geen diploma",
    ],
    tijden:
      "Verkoopmedewerkers werken vooral op zaterdag, op koopavonden en op koopzondagen. Doordeweeks zijn er dagdiensten van bijvoorbeeld 9.30 tot 18.00. Tijdens de uitverkoop en in december is het het drukst.",
    voorWie: {
      student: "Werk je graag met mensen, dan is de winkelvloer een goede plek om te leren adviseren en verkopen.",
      bijbaan: "Zaterdagen en koopavonden passen naast een baan doordeweeks.",
      zzp: "Als zzp'er doe je bijvoorbeeld losse dagen bij pop-upwinkels, beurzen of zaken die net opengaan.",
    },
    faq: [
      {
        q: "Moet ik verstand hebben van mode of elektronica?",
        a: "Het helpt, maar het staat niet altijd als eis bij de dienst. Een goede verkoper vraagt eerst wat de klant wil en zoekt dan mee.",
      },
      {
        q: "Krijg ik een bonus als ik veel verkoop?",
        a: "Wat je verdient, is het uurtarief van de dienst of het loon van het uitzendbureau. Een bonus regelt de winkel zelf, als die er is.",
      },
      {
        q: "Wat is het verschil met een kassamedewerker?",
        a: "Een kassamedewerker staat vooral achter de kassa. Een verkoopmedewerker is meer op de winkelvloer bezig met advies, en rekent daarnaast af.",
      },
    ],
  },

  // ---- schoonmaak ---------------------------------------------------------
  {
    slug: "schoonmaker",
    als: "als schoonmaker",
    naam: "Schoonmaker",
    branche: "schoonmaak",
    tarief: "schoonmaak",
    foto: "campagne-gang",
    beschrijving: "Werken als schoonmaker of bij een schoonmaakbedrijf: kantoren, scholen en horeca schoonmaken. Taken, werktijden en het richttarief per uur.",
    zoekwoorden: ["werken als schoonmaker", "werken bij schoonmaakbedrijf", "schoonmaker vacature", "schoonmaakwerk bijbaan"],
    intro:
      "Als schoonmaker maak je kantoren, scholen, sportscholen, winkels en horecazaken schoon, vaak voordat iedereen binnenkomt of nadat ze weg zijn. Je werkt voor een schoonmaakbedrijf of rechtstreeks voor het bedrijf waar je schoonmaakt.",
    taken: [
      "Een vaste schoonmaakronde lopen volgens de checklist van de opdrachtgever",
      "Sanitair, keukens en kantines grondig schoonmaken",
      "Stofzuigen, dweilen en vloeren moppen",
      "Prullenbakken legen en afval scheiden",
      "Zeep, papier en andere voorraad aanvullen",
    ],
    nodig: [
      "Zelfstandig kunnen werken: vaak ben je alleen in het gebouw",
      "Weten welk middel je waarvoor gebruikt; de opdrachtgever zorgt meestal voor middelen en materiaal",
      "Betrouwbaar zijn, want je krijgt soms een sleutel of toegangspas",
      "Makkelijke kleding en schoenen; een schoonmaakbedrijf geeft vaak werkkleding mee",
    ],
    tijden:
      "Kantoren worden vaak vroeg in de ochtend schoongemaakt, tussen 6.00 en 9.00, of 's avonds na 18.00. Horecazaken en sportscholen meestal na sluitingstijd. Een schoonmaakdienst duurt vaak twee tot vier uur.",
    voorWie: {
      student: "Korte diensten vroeg in de ochtend of 's avonds laten je dag vrij voor je studie.",
      bijbaan: "Een paar uur per dag of per week, naast een andere baan of de zorg voor je gezin.",
      zzp: "Als zzp'er werk je voor meerdere opdrachtgevers, bijvoorbeeld een vaste ronde bij kantoren en losse opleveringen.",
    },
    faq: [
      {
        q: "Kan ik via ZekerFlex bij een schoonmaakbedrijf werken?",
        a: "Ja. Een schoonmaakbedrijf kan zijn klussen op ZekerFlex zetten. Dan werk je bij zijn klanten, als zzp'er of als uitzendkracht via een aangesloten uitzendbureau. Bij elke klus staat voor wie je werkt.",
      },
      {
        q: "Heb ik ervaring nodig als schoonmaker?",
        a: "Voor de meeste klussen niet. Bij de klus staat wat er schoongemaakt moet worden en of er een checklist is. Voor glas op hoogte of opleveringen vragen opdrachtgevers vaker ervaring.",
      },
      {
        q: "Neem ik zelf schoonmaakmiddelen mee?",
        a: "Meestal niet: de opdrachtgever of het schoonmaakbedrijf zorgt voor middelen en materiaal. Staat het anders bij de klus, neem dan mee wat er gevraagd wordt.",
      },
      {
        q: "Wat is het verschil met housekeeping?",
        a: "Housekeeping is schoonmaak in een hotel: kamers schoonmaken en bedden opmaken volgens de normen van het hotel. Een schoonmaker werkt vaker in kantoren en andere gebouwen.",
      },
    ],
  },
  {
    slug: "housekeeping",
    als: "in de housekeeping",
    naam: "Housekeeping",
    branche: "schoonmaak",
    tarief: "housekeeping",
    foto: "campagne-hotelkamer",
    beschrijving: "Werken in de housekeeping: hotelkamers schoonmaken en bedden opmaken. Wat je nodig hebt, de dagdiensten in hotels en het richttarief per uur.",
    zoekwoorden: ["werken in de housekeeping", "housekeeping vacature", "housekeeping hotel bijbaan", "kamermeisje"],
    intro:
      "In de housekeeping van een hotel zorg je dat elke kamer er voor de volgende gast perfect uitziet: bed opgemaakt, badkamer glanzend, handdoeken en zeep aangevuld. Je werkt in hotels, B&B's, vakantieparken en appartementen voor kort verblijf.",
    taken: [
      "Hotelkamers schoonmaken volgens de checklist van het hotel",
      "Bedden afhalen en opnieuw opmaken met schoon beddengoed",
      "Badkamers poetsen en handdoeken, zeep en koffie aanvullen",
      "Gevonden voorwerpen en schade melden bij de receptie",
      "Gangen en de linnenkamer netjes houden",
    ],
    nodig: [
      "Snel en precies werken, want een hotel rekent met een vaste tijd per kamer",
      "Tegen lichamelijk werk kunnen: bukken, tillen en de hele dienst lopen",
      "Discreet zijn met de spullen van gasten",
      "Het uniform krijg je meestal van het hotel; zelf draag je dichte, platte schoenen",
    ],
    tijden:
      "De meeste diensten in de housekeeping zijn overdag, tussen het uitchecken en het inchecken: van ongeveer 9.00 tot 15.00. In het weekend, in de vakanties en bij beurzen of congressen in de stad is het het drukst.",
    voorWie: {
      student: "Dagdiensten in het weekend of in je vakantie, als hotels het drukst hebben.",
      bijbaan: "Werken tijdens schooltijden en 's middags weer vrij.",
      zzp: "Als zzp'er maak je bijvoorbeeld vakantiewoningen en appartementen schoon tussen twee gasten in.",
    },
    faq: [
      {
        q: "Hoeveel kamers maak ik per dienst schoon?",
        a: "Dat verschilt per hotel en per soort kamer. Hotels werken vaak met een vaste tijd per kamer; vraag het bij het begin van je dienst.",
      },
      {
        q: "Moet ik Nederlands spreken in de housekeeping?",
        a: "Niet altijd. In veel hotels is de voertaal Engels; welke taal nodig is, staat bij de dienst. De app van ZekerFlex is er in vijf talen.",
      },
      {
        q: "Wat is het verschil tussen een vertrekker en een blijver?",
        a: "Een blijver is een gast die nog een nacht blijft: die kamer maak je lichter schoon, met het bed, de badkamer en de handdoeken. De kamer van een vertrekker krijgt de volledige beurt.",
      },
    ],
  },
  {
    slug: "glazenwasser",
    als: "als glazenwasser",
    naam: "Glazenwasser",
    branche: "schoonmaak",
    tarief: "glazenwasser",
    foto: "campagne-ramen",
    beschrijving: "Werken als glazenwasser: ramen en gevels wassen, ook op hoogte. Welke certificaten soms nodig zijn, de werktijden en het richttarief per uur.",
    zoekwoorden: ["werken als glazenwasser", "glazenwasser vacature", "glazenwasser zzp", "ramen wassen bijbaan"],
    intro:
      "Als glazenwasser maak je ramen, glazen puien en gevels schoon van woningen, winkels en kantoren. Binnen werk je met een inwasser en trekker, buiten vaak met een telescoopsteel, ladder of hoogwerker.",
    taken: [
      "Ramen en glazen wanden wassen met inwasser en trekker",
      "Kozijnen, deuren en gevelplaten meenemen",
      "Hoog glas schoonmaken met een telescoopsteel en gezuiverd water",
      "Werken vanaf een ladder, hoogwerker of gevelinstallatie, als dat bij de klus hoort",
    ],
    nodig: [
      "Geen hoogtevrees en een goed gevoel voor veilig werken",
      "Ervaring met trekker en inwasser, want streeploos werken vraagt oefening",
      "Voor een hoogwerker vraagt een opdrachtgever meestal een bewijs dat je ermee mag werken, zoals een IPAF-certificaat",
      "Op een bouwplaats of bij grote bedrijven soms een VCA-diploma; dat staat dan bij de klus",
      "Werkkleding die nat mag worden en stevige schoenen",
    ],
    tijden:
      "Glazenwassers werken overdag, vaak vroeg: winkels en kantoren worden het liefst gedaan voordat ze opengaan, vanaf 7.00. In de lente en de zomer is er het meeste werk; bij vorst of harde wind gaat buitenwerk soms niet door.",
    voorWie: {
      student: "Heb je ervaring, dan is glazenwassen goed vakantiewerk in de zomer.",
      bijbaan: "Losse ochtenden met ramen bij winkels en kantoren.",
      zzp: "Veel glazenwassers werken als zzp'er met een eigen ronde; via ZekerFlex vul je die aan met losse klussen.",
    },
    faq: [
      {
        q: "Waarom is het richttarief hoger dan voor schoonmaak?",
        a: "Glazenwassen vraagt ervaring en gebeurt vaak op hoogte. In het tarievenoverzicht ligt het richttarief voor een glazenwasser daarom boven dat van een schoonmaakmedewerker.",
      },
      {
        q: "Moet ik mijn eigen materiaal meenemen?",
        a: "Dat verschilt. Bij sommige klussen zorgt de opdrachtgever voor alles, bij andere neem je je eigen trekker, inwasser en emmer mee. Het staat bij de klus.",
      },
      {
        q: "Wat als het regent?",
        a: "Binnen gaat het werk door. Buitenwerk hangt af van de opdrachtgever; bij harde wind of vorst wordt werk op hoogte vaak verzet.",
      },
    ],
  },

  // ---- evenementen --------------------------------------------------------
  {
    slug: "op-en-afbouw",
    als: "als op- en afbouwmedewerker",
    naam: "Op- en afbouw",
    branche: "evenementen",
    tarief: "eventcrew",
    foto: "campagne-opbouw",
    beschrijving: "Werken als op- en afbouwmedewerker bij festivals, beurzen en concerten: sjouwen, bouwen en afbreken. Werktijden en het richttarief per uur.",
    zoekwoorden: ["werken als op- en afbouwmedewerker", "op- en afbouw festival", "eventcrew bijbaan", "festival opbouw vacature"],
    intro:
      "Als op- en afbouwmedewerker bouw je festivals, beurzen, concerten en bedrijfsevenementen op, en na afloop weer af. Je sjouwt hekken, zet tenten en podia neer en zorgt dat alles klaarstaat voordat het publiek komt.",
    taken: [
      "Hekken, vloeren, tenten en podiumdelen opbouwen en weer afbreken",
      "Materiaal uitladen, sjouwen en weer inladen in vrachtwagens",
      "Beursstands en decor in elkaar zetten volgens een plattegrond",
      "Kabels leggen en afdekken onder leiding van de technici",
      "Het terrein opruimen na afloop",
    ],
    nodig: [
      "Een goede conditie en geen moeite met sjouwen, ook in regen en wind",
      "Veiligheidsschoenen en werkhandschoenen",
      "Samenwerken in een crew en goed luisteren naar de crewchef",
      "Voor werk op hoogte of met een heftruck vraagt de opdrachtgever een certificaat; voor gewoon op- en afbouwwerk niet",
    ],
    tijden:
      "Opbouwen gebeurt in de dagen vóór een evenement, afbouwen direct erna, vaak 's nachts of vroeg in de ochtend. Een dienst duurt soms tien uur of langer. Het seizoen loopt vooral van april tot en met september; beurzen zijn er het hele jaar.",
    voorWie: {
      student: "In de zomervakantie, als de festivals er zijn, pak je een paar lange dagen achter elkaar.",
      bijbaan: "Losse weekenden bij een beurs of evenement.",
      zzp: "Als zzp'er werk je voor verschillende verhuurbedrijven, standbouwers en organisatoren.",
    },
    faq: [
      {
        q: "Zie ik het evenement zelf ook?",
        a: "Meestal niet: je werkt vóór en na het evenement. Soms is er tijdens het evenement een dienst als crew of runner; dat staat dan bij de dienst.",
      },
      {
        q: "Wat neem ik mee naar een opbouwdienst?",
        a: "Veiligheidsschoenen, werkhandschoenen, regenkleding en genoeg eten en drinken. Of er crewcatering is, staat bij de dienst.",
      },
      {
        q: "Waarom is het richttarief hoger dan bij andere evenementenfuncties?",
        a: "Op- en afbouw is zwaar lichamelijk werk, met veiligheidsschoenen en vaak buiten. In het tarievenoverzicht ligt het richttarief daarom hoger dan voor een steward of host.",
      },
    ],
  },
  {
    slug: "hostess",
    als: "als hostess of host",
    naam: "Hostess of host",
    branche: "evenementen",
    tarief: "steward",
    foto: "campagne-receptie",
    beschrijving: "Werken als hostess of host op beurzen, congressen en bedrijfsfeesten: gasten ontvangen en begeleiden. Dresscode, werktijden en het richttarief.",
    zoekwoorden: ["werken als hostess", "hostess bijbaan", "host evenementen", "beurshostess vacature"],
    intro:
      "Als hostess of host ben je het eerste aanspreekpunt van gasten op beurzen, congressen, bedrijfsfeesten en premières. Je ontvangt bezoekers, wijst de weg, registreert gasten en zorgt dat iedereen zich welkom voelt.",
    taken: [
      "Gasten ontvangen bij de ingang en hun naam afvinken op de gastenlijst",
      "Badges, programma's of goodiebags uitdelen",
      "De weg wijzen naar zalen, garderobe en catering",
      "Sprekers of VIP-gasten begeleiden",
      "Vragen beantwoorden aan een informatiebalie",
    ],
    nodig: [
      "Een verzorgde uitstraling en een open, vriendelijke houding",
      "Goed Nederlands en vaak ook Engels; op internationale beurzen soms een derde taal",
      "Kleding volgens de dresscode van het evenement, vaak een donkere broek of rok met een blouse; soms krijg je kleding van de organisator",
      "Lang kunnen staan en kalm blijven als het druk is",
    ],
    tijden:
      "Hostessdiensten volgen het programma: beurzen beginnen vaak om 8.00 met de ontvangst, congressen en galadiners lopen tot in de avond. Het drukst is het in het beursseizoen, in de lente en het najaar.",
    voorWie: {
      student: "Studeer je talen, toerisme of hotelmanagement, dan oefen je hier wat je leert.",
      bijbaan: "Losse dagen op een beurs of een avond bij een bedrijfsfeest.",
      zzp: "Als zzp'er werk je voor evenementenbureaus, congrescentra en beursorganisatoren.",
    },
    faq: [
      {
        q: "Wat is het verschil tussen een hostess en een steward?",
        a: "Een hostess of host ontvangt en begeleidt gasten. Een steward let vooral op de stroom bezoekers en de veiligheid, bijvoorbeeld bij de ingang van een festival. In het tarievenoverzicht staan ze samen als 'Steward / host'.",
      },
      {
        q: "Is hostesswerk alleen voor vrouwen?",
        a: "Nee. Host en hostess is hetzelfde werk, voor iedereen.",
      },
      {
        q: "Welke talen zijn handig als hostess of host?",
        a: "Nederlands en Engels het meest. Op internationale beurzen worden ook Duits, Frans of Spaans gevraagd. Zet je talen in je profiel, dan ziet een opdrachtgever ze als je reageert.",
      },
    ],
  },
  {
    slug: "steward",
    als: "als steward",
    naam: "Steward",
    branche: "evenementen",
    tarief: "steward",
    foto: "campagne-festival-crew",
    beschrijving: "Werken als steward bij festivals, concerten en sportwedstrijden: tickets controleren en bezoekers de weg wijzen. Werktijden en richttarief.",
    zoekwoorden: ["werken als steward", "steward festival", "steward bijbaan", "steward evenementen vacature"],
    intro:
      "Als steward zorg je dat bezoekers van een festival, concert, sportwedstrijd of markt veilig en vlot hun weg vinden. Je controleert tickets en polsbandjes, wijst de weg en houdt een oogje in het zeil als het druk wordt.",
    taken: [
      "Tickets scannen en polsbandjes omdoen en controleren bij de ingang",
      "Bezoekers de weg wijzen naar podia, toiletten, uitgangen en parkeerplaatsen",
      "Looproutes en nooduitgangen vrijhouden",
      "Bijzonderheden melden via de portofoon bij de beveiliging of de organisatie",
    ],
    nodig: [
      "Rustig en duidelijk blijven als het druk is",
      "Lang kunnen staan, ook buiten in weer en wind",
      "Een hesje of shirt krijg je van de organisatie; zelf draag je een zwarte broek en stevige schoenen",
      "Bij betaald voetbal vraagt de club een erkende stewardopleiding; bij de meeste andere evenementen is dat niet nodig",
    ],
    tijden:
      "Stewards werken vooral in het weekend en op feestdagen, van het openen van de poort tot het laatste publiek weg is. Een festival vraagt soms meerdere dagen achter elkaar, een sportwedstrijd een paar uur rond de wedstrijd.",
    voorWie: {
      student: "In de zomer is er bij festivals veel te doen, precies als je vrij bent.",
      bijbaan: "Een wedstrijd of evenement in het weekend, naast je doordeweekse baan.",
      zzp: "Als zzp'er werk je voor organisatoren en evenementenbureaus; werk je onder hun leiding, dan past een uitzendklus via een aangesloten uitzendbureau vaak beter.",
    },
    faq: [
      {
        q: "Is een steward hetzelfde als een beveiliger?",
        a: "Nee. Een beveiliger heeft een diploma en een beveiligingspas en mag bijvoorbeeld fouilleren. Een steward ontvangt en begeleidt bezoekers en meldt iets aan de beveiliging als dat nodig is.",
      },
      {
        q: "Kan ik het optreden zien als steward?",
        a: "Soms een stukje, maar je let op het publiek en niet op het podium. Je staat op een vaste plek of loopt een route.",
      },
      {
        q: "Wat doe ik als er iets misgaat?",
        a: "Je meldt het via de portofoon of bij je leidinggevende. Voor een evenement krijg je meestal een briefing met de nooduitgangen en wie je waarvoor roept.",
      },
    ],
  },

  // ---- promotie -----------------------------------------------------------
  {
    slug: "promotiemedewerker",
    als: "als promotiemedewerker",
    naam: "Promotiemedewerker",
    branche: "promotie",
    tarief: "promotie",
    foto: "campagne-promotie",
    beschrijving: "Werken als promotiemedewerker: producten onder de aandacht brengen in winkels, op beurzen en op straat. Taken, werktijden en het richttarief.",
    zoekwoorden: ["werken als promotiemedewerker", "promotiewerk bijbaan", "promotor vacature", "promotie medewerker"],
    intro:
      "Als promotiemedewerker breng je een product, merk of dienst onder de aandacht: in winkels, op beurzen, bij stations of op evenementen. Je spreekt mensen aan, vertelt wat het product doet en laat ze het proberen.",
    taken: [
      "Voorbijgangers aanspreken en kort vertellen wat het product of de actie is",
      "Een promotiestand opbouwen, inrichten en na afloop weer afbreken",
      "Folders, kortingsbonnen of proefmonsters uitdelen",
      "Voor de opdrachtgever bijhouden hoe de actie liep en wat mensen ervan vonden",
    ],
    nodig: [
      "Het leuk vinden om mensen aan te spreken, ook als iemand nee zegt",
      "Je vooraf verdiepen in het product, zodat je vragen kunt beantwoorden",
      "Promotiekleding krijg je meestal van de opdrachtgever",
      "Een rijbewijs helpt bij acties op verschillende plekken; het staat bij de dienst als het nodig is",
    ],
    tijden:
      "Promotiewerk gaat per actie: vaak donderdag tot en met zaterdag in winkels, of tijdens een beurs of evenement. Een dienst duurt meestal een dagdeel of een hele dag.",
    voorWie: {
      student: "Losse actiedagen zonder vaste verplichting, en je leert overtuigend praten.",
      bijbaan: "Een zaterdag per maand in een winkel of op een beurs.",
      zzp: "Als zzp'er werk je per actie voor verschillende promotiebureaus en merken.",
    },
    faq: [
      {
        q: "Moet ik verkopen als promotiemedewerker?",
        a: "Niet altijd. Bij veel acties gaat het om laten zien en laten proberen. Moet je wel verkopen of mensen laten inschrijven, dan staat dat bij de dienst; dat heet vaak werven.",
      },
      {
        q: "Wat is het verschil met een samplingmedewerker?",
        a: "Bij sampling deel je vooral proefmonsters uit. Een promotiemedewerker doet meer: uitleg geven, een stand bemannen en soms klanten werven.",
      },
      {
        q: "Mag ik mijn eigen kleding aan?",
        a: "Meestal niet: je draagt kleding van het merk of de actie. Daaronder vaak een donkere broek en schone schoenen.",
      },
    ],
  },
  {
    slug: "samplingmedewerker",
    als: "als samplingmedewerker",
    naam: "Samplingmedewerker",
    branche: "promotie",
    tarief: "sampling",
    foto: "campagne-sampling",
    beschrijving: "Werken als samplingmedewerker: proefmonsters uitdelen bij stations, supermarkten en festivals. Korte acties, werktijden en het richttarief.",
    zoekwoorden: ["werken als samplingmedewerker", "sampling bijbaan", "proefmonsters uitdelen", "sampling actie vacature"],
    intro:
      "Als samplingmedewerker deel je proefmonsters uit van een nieuw product: een drankje bij het station, een hapje in de supermarkt of een proefverpakking op een festival. Je zorgt dat mensen het product proeven en onthouden.",
    taken: [
      "Proefmonsters klaarmaken en uitdelen aan voorbijgangers of klanten",
      "In een paar zinnen vertellen wat het product is en waar het te koop is",
      "De voorraad monsters bijhouden en je plek netjes houden",
      "Aan het eind doorgeven hoe het ging en wat er over is",
    ],
    nodig: [
      "Open en vrolijk op mensen afstappen",
      "Bij eten en drinken de hygiëneregels van de opdrachtgever volgen, zoals handschoenen dragen",
      "Kleding van het merk krijg je meestal van de opdrachtgever",
      "Is het proefmonster alcohol, dan deel je het alleen uit aan mensen van 18 jaar en ouder",
    ],
    tijden:
      "Samplingacties zijn vaak kort: een ochtendspits bij een station van 7.00 tot 10.00, of een middag in de supermarkt op vrijdag of zaterdag. In de zomer zijn acties vaker buiten, bij festivals en sportevenementen.",
    voorWie: {
      student: "Korte diensten in de ochtend of op zaterdag, rond je colleges.",
      bijbaan: "Een paar uur in de ochtendspits, voordat je eigen werkdag begint.",
      zzp: "Als zzp'er doe je acties voor verschillende merken en bureaus, en kies je acties dicht bij huis.",
    },
    faq: [
      {
        q: "Is sampling hetzelfde als promotie?",
        a: "Sampling is een vorm van promotie waarbij proeven of uitproberen centraal staat. Je hoeft er meestal niets bij te verkopen.",
      },
      {
        q: "Waar sta ik als samplingmedewerker?",
        a: "Bij stations, in winkelstraten, in supermarkten, op festivals of bij sportevenementen. De plek staat bij de dienst, net als de reistijd.",
      },
      {
        q: "Wat als de monsters op zijn?",
        a: "Dan meld je dat bij de opdrachtgever of het promotiebureau. Soms is er extra voorraad in de auto of bij de winkel; anders sluit je de actie af.",
      },
    ],
  },

  // ---- bezorging ----------------------------------------------------------
  {
    slug: "bezorger",
    als: "als bezorger",
    naam: "Bezorger",
    branche: "bezorging",
    tarief: "bezorger",
    foto: "campagne-pakket",
    beschrijving: "Werken als bezorger: pakketten, maaltijden of boodschappen bezorgen met fiets, scooter of bus. Welk rijbewijs je nodig hebt, tijden en tarief.",
    zoekwoorden: ["werken als bezorger", "bezorger bijbaan", "pakketbezorger vacature", "maaltijdbezorger"],
    intro:
      "Als bezorger breng je pakketten, maaltijden of boodschappen naar de deur. Je werkt met een fiets, scooter of bestelbus, voor een restaurant, supermarkt, apotheek of een vervoerder in je regio.",
    taken: [
      "Bestellingen ophalen en controleren of alles compleet is",
      "Een route rijden of fietsen langs de adressen, met navigatie op je telefoon",
      "Pakketten of maaltijden overhandigen en zo nodig een handtekening of foto vastleggen",
      "Retourzendingen meenemen en aan het eind van de rit afleveren",
    ],
    nodig: [
      "Voor een scooter een rijbewijs AM of een autorijbewijs, voor een bestelbus rijbewijs B",
      "Een smartphone met navigatie en mobiel internet",
      "Weerbestendige kleding, want je bent de hele dienst buiten",
      "Of je eigen vervoer nodig hebt of dat van de opdrachtgever gebruikt, staat bij de dienst",
    ],
    tijden:
      "Maaltijdbezorging is vooral 's avonds, tussen 17.00 en 22.00, en in het weekend. Pakketbezorging is overdag, vaak van 8.00 tot 17.00. Vanaf november, met Sinterklaas en Kerst, is het het drukst.",
    voorWie: {
      student: "Avonden met maaltijden of zaterdagen met pakketten passen goed naast school of studie.",
      bijbaan: "Een paar avonden per week bezorgen, met je eigen fiets of het vervoer van de opdrachtgever.",
      zzp: "Als zzp'er met een eigen bus of fiets rijd je ritten voor verschillende opdrachtgevers; je kiest zelf welke.",
    },
    faq: [
      {
        q: "Heb ik een eigen auto of bus nodig?",
        a: "Niet altijd. Bij veel diensten rijd je met een fiets, scooter of bus van de opdrachtgever. Moet je eigen vervoer meenemen, dan staat dat bij de dienst.",
      },
      {
        q: "Wat is het verschil tussen een bezorger en een koerier?",
        a: "Vaak is het hetzelfde werk. Een koerier rijdt meestal ritten van A naar B, zoals documenten of onderdelen; een bezorger rijdt een route met veel adressen. In het tarievenoverzicht staan ze samen als 'Bezorger / koerier'.",
      },
      {
        q: "Worden mijn kilometers vergoed?",
        a: "Dat hangt af van de afspraak bij de dienst. Rijd je als zzp'er met eigen vervoer, houd dan je kilometers bij voor je administratie; dat kan in de app.",
      },
    ],
  },
  {
    slug: "fietskoerier",
    als: "als fietskoerier",
    naam: "Fietskoerier",
    branche: "bezorging",
    tarief: "bezorger",
    foto: "campagne-bakfiets",
    beschrijving: "Werken als fietskoerier: pakketjes, documenten en maaltijden op de (bak)fiets door de stad. Geen rijbewijs nodig. Werktijden en richttarief.",
    zoekwoorden: ["werken als fietskoerier", "fietskoerier bijbaan", "fietskoerier vacature", "bakfiets koerier"],
    intro:
      "Als fietskoerier breng je pakketjes, documenten, boodschappen of maaltijden op de fiets door de stad: in de spits vaak sneller dan een auto, en zonder uitstoot. Je werkt voor koeriersdiensten, restaurants, winkels en apotheken.",
    taken: [
      "Ritten ophalen bij de winkel, het restaurant of het depot",
      "Op de fiets of e-bakfiets de snelste route nemen, met je telefoon als navigatie",
      "Spullen veilig en heel afleveren, ook bij regen",
      "Je fiets of bakfiets aan het begin van de dienst nalopen: banden, remmen en licht",
    ],
    nodig: [
      "Een goede conditie en plezier in fietsen, bij elk weer",
      "Een eigen fiets of e-bike, of de (bak)fiets van de opdrachtgever; dat staat bij de dienst",
      "Een smartphone met mobiel internet",
      "Regenkleding en iets reflecterends voor in het donker",
      "Geen rijbewijs",
    ],
    tijden:
      "Fietskoeriers werken vooral in de binnensteden. Maaltijdritten zijn 's avonds en in het weekend, pakket- en documentritten overdag op werkdagen, vaak van 9.00 tot 17.00.",
    voorWie: {
      student: "Je fietst toch al door de stad: ritten 's avonds of op een vrije middag.",
      bijbaan: "Avond- of weekendritten in je eigen stad.",
      zzp: "Als zzp'er rijd je ritten voor verschillende koeriersdiensten en zaken, met je eigen fiets of bakfiets.",
    },
    faq: [
      {
        q: "Moet ik een eigen bakfiets hebben?",
        a: "Nee. Werk je met een bakfiets of e-bike van de opdrachtgever, dan staat dat bij de dienst. Met je eigen fiets kan ook, als dat zo gevraagd wordt.",
      },
      {
        q: "Wat als ik onderweg pech krijg?",
        a: "Meld het meteen bij de opdrachtgever, via de chat in de app of telefonisch, zodat die de rit kan regelen. Met je eigen fiets regel je de reparatie zelf.",
      },
      {
        q: "Fiets ik ook in de regen?",
        a: "Ja, koerierswerk gaat bij elk weer door. Bij storm of gladheid beslist de opdrachtgever of ritten doorgaan.",
      },
    ],
  },
];

// ---- opzoeken -------------------------------------------------------------

export function functieBySlug(slug: string): Functie | undefined {
  return FUNCTIES.find((f) => f.slug === slug);
}

export const functiePad = (f: Pick<Functie, "slug">): string => `${WERKEN_ALS_PAD}/${f.slug}`;
/** "Werken als orderpicker", "Werken in de bediening" */
export const functieKop = (f: Pick<Functie, "als">): string => `Werken ${f.als}`;
export const functieLink = (f: Functie): Link => ({ href: functiePad(f), label: functieKop(f) });

export function functiesVan(branche: string): Functie[] {
  return FUNCTIES.filter((f) => f.branche === branche);
}

export function sectorVan(f: Functie): Sector | undefined {
  return SECTORS.find((s) => s.key === f.branche);
}

/** De foto van de functie; staat hij er (nog) niet in, dan een foto van de branche. */
export function functieFoto(f: Functie): Foto | undefined {
  return FOTOS.find((x) => x.slug === f.foto) ?? sectorFoto(f.branche, f.slug);
}

/** Het richttarief uit de catalogus (lib/shifts/catalogus.ts), of null als de functie er geen heeft. */
export function tariefVan(f: Pick<Functie, "tarief">): { label: string; cents: number } | null {
  if (!f.tarief) return null;
  const t = SHIFT_TEMPLATES.find((x) => x.key === f.tarief);
  return t ? { label: t.label, cents: t.hourlyRateCents } : null;
}

/**
 * De steden met de meeste vestigingen van deze branche (CBS, de eerste maat op gemeenteniveau uit lib/seo-stad.ts),
 * één per gemeente. Zonder cijfers de eerste steden uit de lijst.
 */
export function grootsteSteden(branche: string, aantal = 6): { steden: City[]; maat: Maat | null } {
  const m = matenVoor(branche).find((x) => x.niveau === "gemeente");
  if (!m) return { steden: CITIES.slice(0, aantal), maat: null };
  const gezien = new Set<string>();
  const lijst = CITIES.flatMap((c) => {
    const k = stadCijfers(c.slug);
    return k ? [{ c, gemeente: k.gemeente, n: waardeVan(m, k).n }] : [];
  })
    .sort((a, b) => b.n - a.n || (a.c.slug < b.c.slug ? -1 : 1))
    .filter((x) => {
      if (gezien.has(x.gemeente)) return false;
      gezien.add(x.gemeente);
      return true;
    });
  return { steden: lijst.slice(0, aantal).map((x) => x.c), maat: m };
}

// ---- de functiepagina: /werken-als/<functie> --------------------------------

export interface FunctieTarief {
  /** "€ 17,00 per uur", of null als er geen tarief bekend is */
  bedrag: string | null;
  tekst: string;
  bron: Link;
}

export interface FunctieRij {
  kop: string;
  uitleg: string | null;
  links: Link[];
}

export interface FunctiePagina {
  pad: string;
  eyebrow: string;
  titel: string;
  intro: string;
  takenKop: string;
  taken: readonly string[];
  nodigKop: string;
  nodig: readonly string[];
  tijdenKop: string;
  tijden: string;
  voorWieKop: string;
  voorWie: [string, string][];
  tariefKop: string;
  tarief: FunctieTarief;
  viaKop: string;
  via: string;
  stappen: [string, string][];
  faqKop: string;
  faq: Vraag[];
  rijen: FunctieRij[];
  ctaTitel: string;
}

const CAO_ZIN = "Werk je via een aangesloten uitzendbureau, dan krijg je loon volgens de cao van dat bureau.";

function tariefBlok(f: Functie): FunctieTarief {
  const t = tariefVan(f);
  const bron: Link = { href: TARIEVEN_PAD, label: "Bron: het tarievenoverzicht van ZekerFlex" };
  if (!t) {
    return { bedrag: null, tekst: `Het uurtarief verschilt per opdrachtgever en per dienst; je ziet het bij elke dienst voordat je reageert. ${CAO_ZIN}`, bron };
  }
  return {
    bedrag: `${euro(t.cents)} per uur`,
    tekst: `Voor de functie '${t.label}' stelt ZekerFlex opdrachtgevers een richttarief voor van ${euro(t.cents)} per uur, exclusief btw. Dat is een voorstel: de opdrachtgever bepaalt zelf het tarief van zijn klus, en bij elke dienst zie je het echte uurtarief voordat je reageert. ${CAO_ZIN}`,
    bron,
  };
}

export function functiePagina(f: Functie): FunctiePagina {
  const s = sectorVan(f);
  const rijen: FunctieRij[] = [];
  if (s) {
    rijen.push({
      kop: `Meer ${werkKop(s).toLowerCase()}`,
      uitleg: null,
      links: [
        { href: `/${s.workerSlug}`, label: werkHubKop(s) },
        ...functiesVan(f.branche)
          .filter((x) => x.slug !== f.slug)
          .map(functieLink),
        { href: BIJBAAN_PAD, label: "Bijbaan zoeken" },
        { href: WERKEN_ALS_PAD, label: "Alle functies" },
      ],
    });
    const { steden, maat } = grootsteSteden(f.branche);
    rijen.push({
      kop: `${werkKop(s)} in de grootste steden`,
      uitleg: maat ? `Van de steden op ZekerFlex de zes met de meeste ${maat.tegel} (CBS).` : null,
      links: steden.map((c) => ({ href: `/${s.workerSlug}/${c.slug}`, label: `${werkKop(s)} in ${c.name}` })),
    });
  }
  return {
    pad: functiePad(f),
    eyebrow: `${f.naam} · ${s?.label ?? "Flexwerk"} · vanaf 18 jaar`,
    titel: functieKop(f),
    intro: f.intro,
    takenKop: `Wat doe je ${f.als}?`,
    taken: f.taken,
    nodigKop: `Wat heb je nodig ${f.als}?`,
    nodig: f.nodig,
    tijdenKop: `Wanneer werk je ${f.als}?`,
    tijden: f.tijden,
    voorWieKop: `Voor wie past werken ${f.als}?`,
    voorWie: [
      ["Studenten", f.voorWie.student],
      ["Als bijbaan", f.voorWie.bijbaan],
      ["Als zzp'er", f.voorWie.zzp],
    ],
    tariefKop: `Wat verdien je ${f.als}?`,
    tarief: tariefBlok(f),
    viaKop: `Zo werk je ${f.als} via ZekerFlex`,
    via: "Werken via ZekerFlex kan vanaf 18 jaar. Met een KVK-nummer werk je als zzp'er; zonder KVK werk je als uitzendkracht via een aangesloten uitzendbureau, dat dan je werkgever is. ZekerFlex is zelf geen uitzendbureau.",
    stappen: BIJBAAN_STAPPEN,
    faqKop: `Vragen over werken ${f.als}`,
    faq: [...f.faq],
    rijen,
    ctaTitel: `Aan de slag ${f.als}?`,
  };
}

/** De zichtbare tekst van een functiepagina, in de volgorde van de pagina (zoals bijbaanStadTekst in lib/seo-bijbaan.ts). */
export function functieTekst(p: FunctiePagina): string {
  const delen: string[] = [p.eyebrow, p.titel, p.intro, ...KNOPPEN.map((k) => k.label), JONGEREN_HINT, JONGEREN_LINK.label];
  delen.push(p.takenKop, ...p.taken, p.nodigKop, ...p.nodig, p.tijdenKop, p.tijden, p.tariefKop);
  if (p.tarief.bedrag) delen.push(p.tarief.bedrag);
  delen.push(p.tarief.tekst, p.tarief.bron.label, p.voorWieKop);
  for (const [t, b] of p.voorWie) delen.push(t, b);
  delen.push(p.viaKop, p.via);
  for (const [t, b] of p.stappen) delen.push(t, b);
  delen.push("Veelgestelde vragen", p.faqKop);
  for (const v of p.faq) delen.push(v.q, v.a);
  for (const r of p.rijen) delen.push(r.kop, ...(r.uitleg ? [r.uitleg] : []), ...r.links.map((l) => l.label));
  delen.push(p.ctaTitel, CTA_TEKST, ...KNOPPEN.map((k) => k.label));
  return delen.join("\n");
}

// ---- het overzicht: /werken-als ---------------------------------------------

export interface FunctieKaart {
  href: string;
  titel: string;
  sub: string;
  /** "Richttarief € 17,00 per uur", of null */
  tarief: string | null;
}

export interface WerkenAlsHubPagina {
  eyebrow: string;
  titel: string;
  intro: string;
  groepen: { kop: string; href: string; link: string; kaarten: FunctieKaart[] }[];
  tariefUitleg: string;
  bron: Link;
  faq: Vraag[];
}

export function werkenAlsHub(): WerkenAlsHubPagina {
  return {
    eyebrow: "Per functie · vanaf 18 jaar",
    titel: "Werken als …: alle functies op een rij",
    intro:
      "Wat doe je als orderpicker, barista of schoonmaker, en wat heb je ervoor nodig? Per functie lees je de taken, de werktijden, voor wie het past en het richttarief uit ons tarievenoverzicht. Daarna kies je zelf op welke diensten je reageert, met of zonder KVK.",
    groepen: SECTORS.flatMap((s): WerkenAlsHubPagina["groepen"] => {
      const lijst = functiesVan(s.key);
      if (lijst.length === 0) return [];
      return [
        {
          kop: s.label,
          href: `/${s.workerSlug}`,
          link: werkHubKop(s),
          kaarten: lijst.map((f) => {
            const t = tariefVan(f);
            return { href: functiePad(f), titel: functieKop(f), sub: f.taken[0] ?? f.intro, tarief: t ? `Richttarief ${euro(t.cents)} per uur` : null };
          }),
        },
      ];
    }),
    tariefUitleg:
      "Het richttarief is het uurtarief dat ZekerFlex opdrachtgevers voorstelt als ze een klus plaatsen, exclusief btw. De opdrachtgever bepaalt zelf het tarief van zijn klus; het echte bedrag staat bij elke dienst.",
    bron: { href: TARIEVEN_PAD, label: "Bekijk het hele tarievenoverzicht" },
    faq: [
      {
        q: "Welke functies kan ik via ZekerFlex doen?",
        a: "Op deze pagina staan de functies die het vaakst voorkomen in de horeca, logistiek, retail, schoonmaak, evenementen, promotie en bezorging. Welke klussen er open staan, wisselt per dag; die zie je in de app.",
      },
      {
        q: "Wat is een richttarief?",
        a: "Het uurtarief dat ZekerFlex opdrachtgevers voorstelt voor een functie als ze een klus plaatsen, exclusief btw. De opdrachtgever bepaalt zelf het tarief; bij elke dienst zie je het echte bedrag voordat je reageert.",
      },
      {
        q: "Vanaf welke leeftijd kan ik via ZekerFlex werken?",
        a: "Vanaf 18 jaar. Ben je 16 of 17, laat dan je e-mailadres achter op de pagina 'Nog geen 18': we sturen je een bericht zodra je via ZekerFlex aan de slag kunt.",
      },
      {
        q: "Heb ik een KVK-nummer nodig?",
        a: "Nee. Zonder KVK werk je als uitzendkracht via een aangesloten uitzendbureau; dat bureau is dan je werkgever. Met een KVK-nummer werk je als zzp'er.",
      },
      UITZEND_WERKER,
    ],
  };
}

// ---- metadata ---------------------------------------------------------------

/** De eerste titel die past (TITEL_MAX), anders de korte met het merk. */
function eersteDiePast(kandidaten: string[], terugval: string): string {
  return kandidaten.find((t) => t.length <= TITEL_MAX) ?? seoTitel(terugval);
}

export function functieMetadata(f: Functie): Metadata {
  const kop = functieKop(f);
  const lang = `${kop}: ${tariefVan(f) ? "taken, tijden en tarief" : "taken, tijden en eisen"}`;
  const title = eersteDiePast([`${lang} | ZekerFlex`, lang, `${kop} | ZekerFlex`], kop);
  const description = seoBeschrijving(f.beschrijving);
  return {
    title: { absolute: title },
    description,
    keywords: [...f.zoekwoorden],
    ...canonical(functiePad(f), { title: lang, description }),
  };
}

export function werkenAlsHubMetadata(): Metadata {
  const kop = "Werken als …: functies, taken en tarief";
  const description = seoBeschrijving(
    "Wat doe je als orderpicker, barista of schoonmaker? Per functie: taken, werktijden, wat je nodig hebt en een richttarief. Met of zonder KVK, vanaf 18 jaar.",
  );
  return {
    title: { absolute: eersteDiePast([`${kop} | ZekerFlex`, kop], "Werken als") },
    description,
    keywords: ["werken als", "functies flexwerk", "bijbaan functies", "uurtarief per functie", "wat verdien je als"],
    ...canonical(WERKEN_ALS_PAD, { title: "Werken als …: alle functies op een rij", description }),
  };
}
