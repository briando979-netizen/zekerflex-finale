// ---------------------------------------------------------------------------
// Alle losse online tools op één pagina (/online, 19 nov 2026, eigenaar: "voor
// een website maken of webshop of logo ontwerpen of je domein registreren of
// verhuizen of beheren en nog veel meer: alle losse tools in een nieuwe pagina").
// De tools komen uit het aanbod (lib/marketing/aanbod.ts), zodat naam, knop en
// prijs overal gelijk zijn; een paar ingangen (domein verhuizen/beheren, de
// apps) zijn extra, naar bestaande pagina's. Elke tool heeft een eigen merkteken
// (lib/marketing/online-merken.ts) en, waar we er een hebben, een echt beeld.
// Puur bestand, browser-veilig.
// ---------------------------------------------------------------------------

import { AANBOD, aanbodHref, prijsTekst, type AanbodItem } from "@/lib/marketing/aanbod";

export interface OnlineTool {
  sleutel: string;
  naam: string;
  kort: string;
  href: string;
  knop: string;
  /** korte prijsaanduiding, alleen als die echt vastligt */
  prijs?: string;
  /** "Gratis" of "Eerst zien, dan betalen": het etiket op de kaart */
  etiket?: string;
  /** een echt beeld van het product (schermafbeelding of eigen foto), pad vanaf public/ */
  beeld?: { src: string; alt: string };
  /** opent buiten zekerflex.com (eigen subdomein) */
  extern?: boolean;
}

export interface OnlineGroep {
  sleutel: "maken" | "domein" | "checks" | "groeien" | "apps";
  titel: string;
  kop: string;
  intro: string;
  tools: OnlineTool[];
}

const uitAanbod = (slug: string, extra: Partial<OnlineTool> = {}, opties: { zonderPrijs?: boolean } = {}): OnlineTool[] => {
  const a: AanbodItem | undefined = AANBOD.find((x) => x.slug === slug && x.status === "beschikbaar");
  if (!a) return [];
  const prijs = a.prijs && !opties.zonderPrijs ? prijsTekst(a) : undefined;
  return [{ sleutel: a.slug, naam: a.naam, kort: a.kort, href: aanbodHref(a), knop: a.start.label, ...(prijs ? { prijs } : {}), ...extra }];
};

const GRATIS = "Gratis, zonder account";
const EERST_ZIEN = "Eerst zien, dan betalen";

export const ONLINE_GROEPEN: OnlineGroep[] = [
  {
    sleutel: "maken",
    titel: "Maken",
    kop: "Je website, webshop, logo en advertentie",
    intro: "Je ziet eerst het voorbeeld, dan beslis je. Alles op je eigen domein, zonder scripts van anderen.",
    tools: [
      ...uitAanbod("website", {
        naam: "Website laten maken",
        href: "/website-maken",
        knop: "Vertel je wensen",
        kort: "Een snelle, moderne website op je eigen domein. Vertel je wensen en krijg binnen een dag een voorbeeld in drie versies.",
        etiket: EERST_ZIEN,
        beeld: { src: "/marketing/voorbeelden/smileyapp.webp", alt: "De website van SmileyApp, gemaakt door ZekerFlex" },
      }),
      ...uitAanbod("webshop", {
        href: "/website-maken",
        knop: "Vertel je wensen",
        etiket: EERST_ZIEN,
        beeld: { src: "/marketing/foto/campagne-webwinkel.jpg", alt: "Een ondernemer pakt een bestelling in voor haar webwinkel" },
      }),
      ...uitAanbod("logo-maker", { knop: "Maak mijn logo", etiket: EERST_ZIEN }),
      ...uitAanbod("advertentie-op-maat", {
        knop: "Maak mijn advertentie",
        etiket: EERST_ZIEN,
        beeld: { src: "/marketing/foto/campagne-promotie.jpg", alt: "Een team deelt flyers uit voor een actie" },
      }),
    ],
  },
  {
    sleutel: "domein",
    titel: "Domein & e-mail",
    kop: "Je eigen naam online",
    intro: "Zoeken, registreren, verhuizen en beheren, en mail op je eigen domein. Bij een website of webshop van ons is het eerste jaar .nl, .com, .eu of .be inbegrepen.",
    tools: [
      // zonder de "vanaf"-prijs uit het aanbod: het blok ernaast toont de echte prijzen per extensie, twee bedragen naast elkaar verwarren
      ...uitAanbod("domeinnaam", { naam: "Domeinnaam registreren", href: "/domeinnaam#zoek", knop: "Zoek je domeinnaam", kort: "Zoek of je naam vrij is: .nl, .com, .eu, .be en meer. Registreren voor een eerlijke prijs per jaar." }, { zonderPrijs: true }),
      {
        sleutel: "domein-verhuizen",
        naam: "Domein verhuizen",
        kort: "Heb je al een domein? Verhuis het met je verhuiscode naar ZekerFlex; je website en mail blijven gewoon werken.",
        href: "/domeinnaam#verhuizen-titel",
        knop: "Zo verhuis je",
      },
      {
        sleutel: "domein-beheren",
        naam: "Domein beheren",
        kort: "DNS, koppeling aan je website en verlenging regel je in je eigen werkruimte, onder Website.",
        href: "/werkgever/website",
        knop: "Naar mijn domeinen",
      },
      ...uitAanbod("zakelijke-mail", { knop: "Begin met je domeinnaam" }),
    ],
  },
  {
    sleutel: "checks",
    titel: "Gratis checks",
    kop: "In een minuut weten hoe je ervoor staat",
    intro: "Zonder account, zonder e-mailadres. De uitslag zie je meteen.",
    tools: [
      ...uitAanbod("website-check", { etiket: GRATIS }),
      ...uitAanbod("review-check", { etiket: GRATIS }),
      ...uitAanbod("bedrijfscheck", { etiket: GRATIS }),
      ...uitAanbod("rekentools", { etiket: GRATIS }),
    ],
  },
  {
    sleutel: "groeien",
    titel: "Gevonden en bereikbaar",
    kop: "Meer klanten, minder gemiste telefoontjes",
    intro: "Meer reviews, een zakelijk nummer met een assistent die opneemt, en een vliegende start als je net begint.",
    tools: [
      ...uitAanbod("google-reviews", {}),
      ...uitAanbod("telefonie", {}),
      ...uitAanbod("starters", { etiket: EERST_ZIEN }),
    ],
  },
  {
    sleutel: "apps",
    titel: "Apps",
    kop: "Een eigen app voor je werk, en onze apps om te proberen",
    intro: "Installeren kan direct vanuit de browser, zonder app-winkel.",
    tools: [
      {
        sleutel: "apps",
        naam: "De apps van ZekerFlex",
        kort: "Een eigen app voor flexwerkers, bedrijven, horeca, rijscholen, webshops en websites. Installeren kan direct, zonder store.",
        href: "/apps",
        knop: "Bekijk de apps",
        beeld: { src: "/marketing/foto/app-telefoon-oranje.jpg", alt: "Een jonge vrouw lacht naar de ZekerFlex-app op haar telefoon" },
      },
      {
        sleutel: "apps-en-spelletjes",
        naam: "Apps & spelletjes",
        kort: "Talkaro, FlikFlak en de webshop: ga er direct naartoe.",
        href: "/apps-en-spelletjes",
        knop: "Ga naar de apps",
        beeld: { src: "/marketing/voorbeelden/flikflak.webp", alt: "FlikFlak, de korte-video-app van ZekerFlex" },
      },
    ],
  },
];

export const ALLE_ONLINE_TOOLS: OnlineTool[] = ONLINE_GROEPEN.flatMap((g) => g.tools);

/** ZekerFlex naast een gewone websitebouwer: alleen wat nu echt zo is. */
export const VERGELIJK: { punt: string; bouwer: string; wij: string }[] = [
  { punt: "Betalen", bouwer: "Een abonnement vooraf, ook voordat je iets ziet", wij: "Eerst het voorbeeld, dan pas betalen" },
  { punt: "Pakket", bouwer: "Een vast pakket met functies die je niet gebruikt", wij: "Alleen de tools die je afneemt" },
  { punt: "Waar het draait", bouwer: "Bij een partij in het buitenland, met hun cookies", wij: "Op onze eigen servers in Nederland, zonder trackers" },
  { punt: "Wie het maakt", bouwer: "Jij, in een sleep-en-zet-neer-bouwer", wij: "Wij, naar jouw wensen; een mens kijkt mee" },
  { punt: "Naast je website", bouwer: "Alleen de website", wij: "Personeel, uren, facturen, telefonie en reviews in dezelfde werkruimte" },
  { punt: "Je domein", bouwer: "Vaak op hun naam of met een opzegtermijn", wij: "Op jouw naam; wil je weg, dan neem je het mee" },
];

/** Waarom hier en niet bij een gewone websitebouwer: alleen wat nu echt zo is. */
export const WAAROM_HIER: { titel: string; tekst: string }[] = [
  { titel: "Eerst zien, dan betalen", tekst: "Je logo, je advertentie en je websitevoorbeeld zie je voordat je iets betaalt. Een pakket dat je in één keer moet afnemen is er niet." },
  { titel: "Op onze eigen servers in Nederland", tekst: "Je website, je mail en je gegevens draaien op onze eigen server, niet bij een partij in Amerika. Geen cookies en geen trackers van anderen op je site." },
  { titel: "Alles in één werkruimte", tekst: "Website, domein, mail, reviews en telefonie zitten naast je personeel en je facturen. Eén login, geen vijf abonnementen." },
  { titel: "Een mens kijkt mee", tekst: "Je voorbeeld wordt door ons gemaakt en nagekeken; je krijgt antwoord van een persoon, niet alleen van een formulier." },
  { titel: "Gratis checks", tekst: "Website-check, review-check, btw- en KVK-check en de rekentools kosten niets en vragen geen account." },
  { titel: "Je eigen naam", tekst: "Alles staat op je eigen domeinnaam. Wil je ooit weg, dan neem je je domein en je mail gewoon mee." },
];

export const ZO_WERKT_HET: { titel: string; tekst: string }[] = [
  { titel: "Kies een tool", tekst: "Begin met wat je nu nodig hebt: een logo, een domeinnaam, een check of een hele website." },
  { titel: "Je ziet meteen resultaat", tekst: "Een voorbeeld van je logo of advertentie, de uitslag van je check, of binnen een dag een websitevoorbeeld in drie versies." },
  { titel: "Jij beslist", tekst: "Bevalt het, dan ga je verder en betaal je alleen voor wat je afneemt. Bevalt het niet, dan kost het je niets." },
];

export const ONLINE_FAQ: { q: string; a: string }[] = [
  { q: "Moet ik een account hebben?", a: "Voor de checks, de rekentools, de logo maker en de advertentie niet. Voor een website, webshop, domein of zakelijke mail maak je een gratis account aan; dat is ook je werkruimte om alles te beheren." },
  { q: "Wat kost een website of webshop?", a: "Dat hangt af van wat je wilt. Je vertelt je wensen, wij sturen binnen een dag een voorbeeld in drie versies met een prijs. Je zit nergens aan vast voordat je ja zegt." },
  { q: "Kan ik mijn bestaande domein meenemen?", a: "Ja. Je verhuist het met de verhuiscode van je huidige provider, of je laat het daar staan en koppelt het aan je website bij ons." },
  { q: "Draait mijn website zonder cookies van anderen?", a: "Ja. De websites die we maken gebruiken geen trackers of scripts van derden; bezoekerscijfers zien we zonder cookies." },
  { q: "Werkt het ook als ik al personeel via ZekerFlex regel?", a: "Juist dan: je website, domein en mail staan in dezelfde werkruimte als je diensten, uren en facturen, met dezelfde login." },
];
