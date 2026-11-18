// ---------------------------------------------------------------------------
// Het Partnerplatform (18 nov 2026): de openbare uitleg voor bedrijven die hun
// eigen producten in de ZekerFlex-shop willen verkopen (/verkopen). Puur: alle
// getallen komen uit lib/shop/verkoper-core.ts, zodat de uitleg nooit iets
// anders zegt dan wat de verkopersomgeving (Studio → Verkopen) doet.
// Niet te verwarren met /sales-partner: dat is klanten aanbrengen op commissie.
// Alleen wat nu echt kan: uitbetalen gaat per bankoverschrijving, verkopen kan
// met een Nederlands KVK-nummer, en er staat geen citaat van een klant.
// ---------------------------------------------------------------------------
import {
  VERKOOP_COMMISSIE_PCT,
  VERKOPER_CATEGORIEEN,
  VERKOPER_UITBETALEN_VANAF_CENTS,
  VERKOPER_VAST_NA_DAGEN,
  VERKOPER_VERZENDT_BINNEN_WERKDAGEN,
  VERVOERDERS,
} from "@/lib/shop/verkoper-core";

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const VANAF = euro(VERKOPER_UITBETALEN_VANAF_CENTS);
const CATEGORIEEN = VERKOPER_CATEGORIEEN.join(", ");
const VERVOERDERS_TEKST = VERVOERDERS.filter((v) => v !== "Anders").join(", ");

/** De openbare adressen van het Partnerplatform. */
export const VERKOPEN_PAD = "/verkopen";
export const VERKOPEN_START_PAD = "/verkopen/start";
/** De bestaande verkopersomgeving (Studio → Verkopen); zonder sessie vraagt die eerst om in te loggen. */
export const VERKOPERSOMGEVING_PAD = "/studio/webshop/verkopen";
/** Een nieuw bedrijf meldt zich aan via de gewone aanmelding, met de webshop als werkruimte. */
export const VERKOPER_AANMELD_PAD = "/register?type=bedrijf&dashboard=webshop";

export const RUBRIEK_SLUGS = ["beleid", "aanbod", "bestellingen-en-verzenden", "zichtbaarheid", "financien"] as const;
export type RubriekSlug = (typeof RUBRIEK_SLUGS)[number];
export const isRubriekSlug = (s: unknown): s is RubriekSlug => typeof s === "string" && (RUBRIEK_SLUGS as readonly string[]).includes(s);
export const rubriekPad = (slug: RubriekSlug) => `${VERKOPEN_PAD}/${slug}`;

export interface RubriekBlok {
  kop: string;
  tekst?: string;
  punten?: string[];
}

export interface Rubriek {
  slug: RubriekSlug;
  /** de naam in het bovenmenu */
  naam: string;
  titel: string;
  /** één zin voor de kaart op de startpagina en de beschrijving voor zoekmachines */
  kort: string;
  blokken: RubriekBlok[];
  vragen: { q: string; a: string }[];
}

export const RUBRIEKEN: Rubriek[] = [
  {
    slug: "beleid",
    naam: "Beleid",
    titel: "De regels voor verkopen via ZekerFlex",
    kort: "Wie mag verkopen, wat je mag aanbieden en wat de wet van je vraagt.",
    blokken: [
      {
        kop: "Wie mag verkopen",
        tekst: "Alleen een bedrijf met een gecontroleerd KVK-nummer verkoopt in de ZekerFlex-shop. Zo weet een koper bij wie hij koopt: bij elk product staat \"Verkoop door\" met jouw bedrijfsnaam.",
      },
      {
        kop: "De afspraken",
        punten: [
          "Je verkoopt alleen nieuwe producten die je zelf mag verkopen, met een eerlijke foto, naam en prijs (inclusief btw).",
          "Elk product gaat eerst langs ZekerFlex. We mogen een product weigeren of uit de shop halen als het niet past of klachten krijgt.",
          "De koper heeft 14 dagen bedenktijd. Retouren en garantie regel jij met de koper; ZekerFlex helpt als het misgaat.",
          "Je gaat één keer akkoord met de verkoopvoorwaarden. Veranderen die, dan vragen we opnieuw om je akkoord.",
        ],
      },
      {
        kop: "Productveiligheid (GPSR)",
        tekst: "Sinds 13 december 2024 geldt in de hele EU de verordening algemene productveiligheid. Als verkoper ben jij ervoor verantwoordelijk dat je product veilig is. Zet in de omschrijving wie de fabrikant is en hoe die te bereiken is, het type- of partijnummer en de waarschuwingen die erbij horen, in het Nederlands. Komt het product van buiten de EU, noem dan ook de verantwoordelijke binnen de EU.",
      },
      {
        kop: "Opgave aan de Belastingdienst (DAC7)",
        tekst: "Een platform moet elk jaar aan de Belastingdienst doorgeven wat verkopers via het platform hebben verkocht. Dat geldt voor verkopers met 30 of meer verkopen of meer dan € 2.000 in een kalenderjaar. ZekerFlex gebruikt daarvoor je bedrijfsgegevens en je KVK-nummer.",
      },
    ],
    vragen: [
      { q: "Mag ik tweedehands of zelfgemaakte producten verkopen?", a: "Alleen nieuwe producten die je zelf mag verkopen. Zelfgemaakt mag, als het product nieuw en veilig is en de omschrijving klopt." },
      { q: "Kan ZekerFlex mijn product weigeren?", a: "Ja. Elk product wordt eerst bekeken. Past het niet in de shop of klopt de omschrijving niet, dan hoor je waarom en kun je het aanpassen." },
    ],
  },
  {
    slug: "aanbod",
    naam: "Aanbod",
    titel: "Je producten in de ZekerFlex-shop",
    kort: "Een product toevoegen, de beoordeling en wat je zelf meteen kunt aanpassen.",
    blokken: [
      {
        kop: "Een product toevoegen",
        tekst: `Je voegt een product toe met een foto, een naam, een omschrijving, een prijs inclusief btw en je voorraad. Je kiest een van de categorieën waarin verkopers nu aanbieden: ${CATEGORIEEN}.`,
      },
      {
        kop: "De beoordeling",
        tekst: "We bekijken een nieuw product binnen een werkdag. Daarna staat het in de shop met \"Verkoop door\" en jouw bedrijfsnaam. Tot die tijd zie je in je overzicht \"Wacht op goedkeuring\".",
      },
      {
        kop: "Aanpassen",
        punten: [
          "Prijs en voorraad pas je meteen aan, zonder nieuwe beoordeling.",
          "Verander je de naam, de omschrijving, de categorie of de foto, dan bekijken we het product opnieuw.",
          "Een product dat je even niet kunt leveren, zet je op pauze. Het staat dan niet in de shop.",
        ],
      },
    ],
    vragen: [
      { q: "Hoeveel producten mag ik aanbieden?", a: "Daar is geen vaste grens voor. Elk product wordt wel apart beoordeeld." },
      { q: "In welke categorieën kan ik verkopen?", a: `Op dit moment in ${CATEGORIEEN}. Past je product daar niet in, laat het ons weten via de contactpagina.` },
    ],
  },
  {
    slug: "bestellingen-en-verzenden",
    naam: "Bestellingen & verzenden",
    titel: "Van bestelling tot bezorging",
    kort: "Wat er gebeurt als iemand bestelt, en binnen welke tijd je verstuurt.",
    blokken: [
      {
        kop: "Een bestelling komt binnen",
        tekst: "De koper betaalt aan ZekerFlex. Na de betaling krijg je een mail met het adres, en staat de bestelling in je overzicht onder \"Nu versturen\". Het adres zie je pas als er betaald is.",
      },
      {
        kop: "Versturen",
        tekst: `Je verstuurt binnen ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen na de betaling en vult de track-en-trace in. De koper krijgt die meteen. Je kiest zelf je vervoerder; voor ${VERVOERDERS_TEKST} maken we de volglink voor de koper.`,
      },
      {
        kop: "Verzendkosten",
        tekst: "Bestaat een bestelling alleen uit jouw producten, dan krijg je ook de verzendkosten die de koper betaalde. Bij een bestelling met producten van meer verkopers blijven de verzendkosten bij ZekerFlex en verstuur je jouw deel zonder extra kosten voor de koper.",
      },
      {
        kop: "Retour en garantie",
        tekst: "De koper heeft 14 dagen bedenktijd. Een retour en de garantie regel jij met de koper. Kom je er samen niet uit, dan helpt ZekerFlex.",
      },
    ],
    vragen: [
      { q: "Wat als ik niet op tijd kan versturen?", a: `De afspraak is ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen. Lukt dat een keer niet, laat het de koper en ons weten. Kun je een product langer niet leveren, zet het dan op pauze.` },
      { q: "Verstuurt ZekerFlex ook voor mij?", a: "Nee. Je verstuurt zelf, vanuit je eigen voorraad en met je eigen vervoerder." },
    ],
  },
  {
    slug: "zichtbaarheid",
    naam: "Zichtbaarheid",
    titel: "Zo vinden kopers je product",
    kort: "Waar je product te zien is en wat je zelf doet om vaker gevonden te worden.",
    blokken: [
      {
        kop: "Waar je product staat",
        tekst: "Een goedgekeurd product staat in de ZekerFlex-shop: in zijn categorie, in de zoekresultaten en op een eigen productpagina met \"Verkoop door\" en jouw bedrijfsnaam.",
      },
      {
        kop: "Wat je zelf doet",
        punten: [
          "Een duidelijke naam in het Nederlands, met het woord waarop een koper zoekt.",
          "Een scherpe foto van het product zelf, op een rustige achtergrond.",
          "Een omschrijving met maten, materiaal en wat er in de doos zit.",
          "Een voorraad die klopt. Een product zonder voorraad kan niemand bestellen.",
        ],
      },
      {
        kop: "Geen betaalde plekken",
        tekst: "Je kunt bij ZekerFlex geen plek in de zoekresultaten kopen. Elke verkoper krijgt dezelfde kans; een goede naam, foto en prijs maken het verschil.",
      },
    ],
    vragen: [{ q: "Kan ik adverteren in de shop?", a: "Nee, betaalde plekken zijn er niet. Je product wordt gevonden via de categorie en de zoekbalk." }],
  },
  {
    slug: "financien",
    naam: "Financiën",
    titel: "Commissie en uitbetaling",
    kort: `${VERKOOP_COMMISSIE_PCT}% commissie per verkoop, geen abonnement, uitbetaling op je eigen rekening.`,
    blokken: [
      {
        kop: "Wat het kost",
        tekst: `ZekerFlex houdt ${VERKOOP_COMMISSIE_PCT}% commissie in over het verkoopbedrag (inclusief btw). Er is geen abonnement, geen instapbedrag en er zijn geen andere kosten. Verkoop je niets, dan betaal je niets.`,
      },
      {
        kop: "Wanneer je verkoop vaststaat",
        tekst: `${VERKOPER_VAST_NA_DAGEN} dagen na de bestelling staat een verzonden verkoop vast. In die tijd vallen de bezorging en de bedenktijd van de koper. Tot dan zie je het bedrag in je overzicht onder "Nog niet vast".`,
      },
      {
        kop: "Uitbetaling",
        tekst: `We betalen maandelijks uit, per bankoverschrijving op de rekening die je in je verkopersomgeving invult. Uitbetalen gaat vanaf ${VANAF}; een lager bedrag schuift door naar de volgende maand.`,
      },
      {
        kop: "Btw en administratie",
        tekst: "Je prijzen zijn inclusief btw. De btw over je verkopen draag je zelf af, zoals bij elke andere verkoop van je bedrijf. In je overzicht zie je per verkoop het bedrag, de commissie en wat je krijgt.",
      },
    ],
    vragen: [
      { q: "Een rekenvoorbeeld?", a: `Verkoop je een product van € 50,00, dan is de commissie ${euro(Math.round((5000 * VERKOOP_COMMISSIE_PCT) / 100))} en krijg je ${euro(5000 - Math.round((5000 * VERKOOP_COMMISSIE_PCT) / 100))}. Bestaat de bestelling alleen uit jouw producten, dan komen de verzendkosten van de koper daar nog bij.` },
      { q: "Wanneer staat het geld op mijn rekening?", a: `Een verkoop staat vast ${VERKOPER_VAST_NA_DAGEN} dagen na de bestelling. Wat vaststaat, betalen we bij de eerstvolgende maandelijkse uitbetaling uit, vanaf ${VANAF}.` },
    ],
  },
];

export function rubriek(slug: RubriekSlug): Rubriek {
  const r = RUBRIEKEN.find((x) => x.slug === slug);
  if (!r) throw new Error(`onbekende rubriek: ${slug}`);
  return r;
}

/** "Waar is jouw bedrijf gevestigd?": verkopen kan nu met een Nederlands KVK-nummer (de verificatie loopt via de KVK). */
export interface LandKaart {
  sleutel: "nl" | "be" | "anders";
  naam: string;
  kan: boolean;
  tekst: string;
  knop: string;
  href: string;
}

export const LANDEN: LandKaart[] = [
  { sleutel: "nl", naam: "Nederland", kan: true, tekst: "Je bedrijf staat ingeschreven bij de KVK. Je kunt je vandaag aanmelden.", knop: "Start met verkopen", href: VERKOPER_AANMELD_PAD },
  { sleutel: "be", naam: "België", kan: false, tekst: "Nog niet. We controleren een bedrijf nu via de Nederlandse KVK. Laat je gegevens achter, dan hoor je het als België erbij komt.", knop: "Laat je gegevens achter", href: "/contact" },
  { sleutel: "anders", naam: "Een ander land", kan: false, tekst: "Nog niet. Verkopen kan nu alleen met een Nederlands KVK-nummer. Laat je gegevens achter, dan nemen we contact op als dat verandert.", knop: "Laat je gegevens achter", href: "/contact" },
];

/** De echte stappen van aanmelden tot verkopen (app/studio/webshop/verkopen). De tijd is wat het jou kost, of wat wij beloven. */
export const STAPPEN: { titel: string; tekst: string; tijd: string }[] = [
  { titel: "Maak een account voor je bedrijf", tekst: "Met je naam, e-mailadres en je bedrijfsnaam. Heb je al een account bij ZekerFlex, dan log je gewoon in.", tijd: "ongeveer 2 minuten" },
  { titel: "Verifieer je bedrijf", tekst: "Je vult je KVK-nummer in. Dat wordt meteen gecontroleerd. Daarna kijken we of je bij dit bedrijf hoort.", tijd: "zo snel mogelijk" },
  { titel: "Ga akkoord met de verkoopvoorwaarden", tekst: "De afspraken staan in gewone taal op één scherm. Je geeft namens je bedrijf akkoord.", tijd: "1 minuut" },
  { titel: "Vul je rekening in", tekst: "Het IBAN en de naam waarop we je verkopen uitbetalen.", tijd: "1 minuut" },
  { titel: "Voeg je eerste producten toe", tekst: "Met foto, prijs en voorraad. ZekerFlex bekijkt elk product voordat het in de shop staat.", tijd: "beoordeling binnen een werkdag" },
  { titel: "Verkopen", tekst: `Bestelt iemand, dan krijg je een mail. Je verstuurt binnen ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen en vult de track-en-trace in.`, tijd: "vanaf je eerste goedgekeurde product" },
];

export const START_FAQ: { q: string; a: string }[] = [
  { q: "Wat kost verkopen via ZekerFlex?", a: `${VERKOOP_COMMISSIE_PCT}% commissie over het verkoopbedrag (inclusief btw). Geen abonnement en geen andere kosten. Verkoop je niets, dan betaal je niets.` },
  { q: "Wanneer en hoe krijg ik mijn geld?", a: `${VERKOPER_VAST_NA_DAGEN} dagen na de bestelling staat een verzonden verkoop vast. We betalen maandelijks uit per bankoverschrijving op je eigen rekening, vanaf ${VANAF}.` },
  { q: "Heb ik een btw-nummer nodig?", a: "Bij het aanmelden vragen we je KVK-nummer, geen btw-nummer. Je prijzen zijn inclusief btw en de btw over je verkopen draag je zelf af." },
  { q: "Kan ik als starter verkopen?", a: "Ja. Je hebt een inschrijving bij de KVK nodig, verder niets: geen minimale omzet en geen minimaal aantal producten." },
  { q: "Kan ik verkopen als mijn bedrijf buiten Nederland zit?", a: "Nog niet. We controleren een bedrijf nu via de Nederlandse KVK. Laat je gegevens achter via de contactpagina, dan hoor je het als jouw land erbij komt." },
  { q: "Heb ik een eigen webshop nodig?", a: "Nee. Je producten staan in de ZekerFlex-shop, onder je eigen bedrijfsnaam. Een eigen webshop bij ZekerFlex kan ernaast, maar hoeft niet." },
  { q: "Wie verstuurt de bestelling?", a: `Jij, binnen ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen na de betaling, met je eigen vervoerder. De koper krijgt je track-en-trace.` },
  { q: "Is dit hetzelfde als sales-partner worden?", a: "Nee. Als verkoper zet je je eigen producten in de shop. Een sales-partner brengt bedrijven aan die flexkrachten inhuren en krijgt daar commissie over." },
];

/** "De laatste updates": alleen wat echt zo is. Een bericht zonder datum is een regel die nu geldt. */
export const UPDATES: { datum?: string; titel: string; tekst: string; href: string; label: string }[] = [
  { datum: "18 november 2026", titel: "Groter categoriemenu en vergelijken in de shop", tekst: "Kopers bladeren nu per categorie door de shop en zetten producten naast elkaar. Een duidelijke naam en de juiste categorie tellen daardoor zwaarder.", href: rubriekPad("zichtbaarheid"), label: "Lees over zichtbaarheid" },
  { titel: "Productveiligheid: noem de fabrikant bij je product", tekst: "De Europese regels voor productveiligheid (GPSR) vragen dat een koper ziet wie de fabrikant is en welke waarschuwingen gelden.", href: rubriekPad("beleid"), label: "Lees het beleid" },
  { titel: "Uitbetaling gaat per bankoverschrijving", tekst: `We maken je verkopen maandelijks over op je eigen rekening, vanaf ${VANAF}. Vul je IBAN in je verkopersomgeving in.`, href: rubriekPad("financien"), label: "Lees over financiën" },
];

/** "Voor in je agenda": vaste data, met wat het voor een verkoper betekent. */
export const AGENDA: { datum: string; iso: string; titel: string; tekst: string }[] = [
  { datum: "27 november 2026", iso: "2026-11-27", titel: "Black Friday", tekst: "Reken op meer bestellingen. Zorg dat je voorraad klopt." },
  { datum: "5 december 2026", iso: "2026-12-05", titel: "Pakjesavond", tekst: `Je verstuurt binnen ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen. Houd rond deze dagen je voorraad en je vervoerder in de gaten.` },
  { datum: "25 en 26 december 2026", iso: "2026-12-25", titel: "Kerst", tekst: "Feestdagen zijn geen werkdagen. Kun je even niet versturen, zet je producten dan op pauze." },
  { datum: "31 januari 2027", iso: "2027-01-31", titel: "Opgave DAC7 over 2026", tekst: "Uiterlijk deze dag geeft een platform de verkopen van het afgelopen jaar door aan de Belastingdienst." },
];

export const TIPS: { titel: string; tekst: string }[] = [
  { titel: "Begin met je beste product", tekst: "Eén product met een scherpe foto en een heldere naam verkoopt beter dan tien halve. Voeg daarna de rest toe." },
  { titel: "Houd je voorraad bij", tekst: "Prijs en voorraad pas je meteen aan. Een bestelling die je niet kunt leveren kost je een klant." },
  { titel: "Verstuur snel, met track-en-trace", tekst: `De afspraak is ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen. Wie dezelfde dag verstuurt, krijgt minder vragen en minder retouren.` },
  { titel: "Schrijf voor de koper", tekst: "Maten, materiaal, wat er in de doos zit. Hoe minder er te raden valt, hoe minder er terugkomt." },
];

export const HANDIGE_LINKS: { label: string; href: string }[] = [
  { label: "Start met verkopen", href: VERKOPEN_START_PAD },
  { label: "Inloggen op je verkopersomgeving", href: VERKOPERSOMGEVING_PAD },
  { label: "Bekijk de ZekerFlex-shop", href: "/shop" },
  { label: "Algemene voorwaarden", href: "/voorwaarden" },
  { label: "Privacy", href: "/privacy" },
  { label: "Contact", href: "/contact" },
];
