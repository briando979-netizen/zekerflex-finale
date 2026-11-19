// ---------------------------------------------------------------------------
// Alle losse online tools op één pagina (/online, 19 nov 2026, eigenaar: "voor
// een website maken of webshop of logo ontwerpen of je domein registreren of
// verhuizen of beheren en nog veel meer: alle losse tools in een nieuwe pagina").
// De tools komen uit het aanbod (lib/marketing/aanbod.ts), zodat naam, knop en
// prijs overal gelijk zijn; een paar ingangen (domein verhuizen/beheren, de
// apps) zijn extra, naar bestaande pagina's. Puur bestand, browser-veilig.
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
  icoon: string;
  /** opent buiten zekerflex.com (eigen subdomein) */
  extern?: boolean;
}

export interface OnlineGroep {
  sleutel: "maken" | "domein" | "checks" | "groeien" | "apps";
  titel: string;
  intro: string;
  tools: OnlineTool[];
}

const uitAanbod = (slug: string, icoon: string, extra: Partial<OnlineTool> = {}): OnlineTool[] => {
  const a: AanbodItem | undefined = AANBOD.find((x) => x.slug === slug && x.status === "beschikbaar");
  if (!a) return [];
  const prijs = a.prijs ? prijsTekst(a) : undefined;
  return [{ sleutel: a.slug, naam: a.naam, kort: a.kort, href: aanbodHref(a), knop: a.start.label, icoon, ...(prijs ? { prijs } : {}), ...extra }];
};

export const ONLINE_GROEPEN: OnlineGroep[] = [
  {
    sleutel: "maken",
    titel: "Maken",
    intro: "Je website, webshop, logo en advertentie. Je ziet eerst het voorbeeld, dan beslis je.",
    tools: [
      ...uitAanbod("website", "🌐", { href: "/website-maken", knop: "Vertel je wensen", kort: "Een snelle, moderne website op je eigen domein. Vertel je wensen en krijg binnen een dag een voorbeeld in drie versies." }),
      ...uitAanbod("webshop", "🛒", { href: "/website-maken", knop: "Vertel je wensen" }),
      ...uitAanbod("logo-maker", "✏️", { knop: "Maak mijn logo", prijs: "Eerst zien, dan betalen" }),
      ...uitAanbod("advertentie-op-maat", "📣", { knop: "Maak mijn advertentie", prijs: "Eerst zien, dan betalen" }),
    ],
  },
  {
    sleutel: "domein",
    titel: "Domein & e-mail",
    intro: "Je eigen naam online: zoeken, registreren, verhuizen, beheren, en mail op je eigen domein.",
    tools: [
      ...uitAanbod("domeinnaam", "🔎", { naam: "Domeinnaam registreren", href: "/domeinnaam#zoek", knop: "Zoek je domeinnaam" }),
      {
        sleutel: "domein-verhuizen",
        naam: "Domein verhuizen",
        kort: "Heb je al een domein? Verhuis het met je verhuiscode naar ZekerFlex; je website en mail blijven gewoon werken.",
        href: "/domeinnaam#verhuizen-titel",
        knop: "Zo verhuis je",
        icoon: "🚚",
      },
      {
        sleutel: "domein-beheren",
        naam: "Domein beheren",
        kort: "DNS, koppeling aan je website en verlenging regel je in je eigen werkruimte, onder Website.",
        href: "/werkgever/website",
        knop: "Naar mijn domeinen",
        icoon: "🛠️",
      },
      ...uitAanbod("zakelijke-mail", "✉️", { knop: "Begin met je domeinnaam" }),
    ],
  },
  {
    sleutel: "checks",
    titel: "Gratis checks en rekentools",
    intro: "Zonder account, in een minuut klaar.",
    tools: [
      ...uitAanbod("website-check", "⚡"),
      ...uitAanbod("review-check", "⭐"),
      ...uitAanbod("bedrijfscheck", "🧾"),
      ...uitAanbod("rekentools", "🧮"),
    ],
  },
  {
    sleutel: "groeien",
    titel: "Gevonden en bereikbaar",
    intro: "Meer reviews, een zakelijk nummer en een vliegende start als je net begint.",
    tools: [
      ...uitAanbod("google-reviews", "💬"),
      ...uitAanbod("telefonie", "📞"),
      ...uitAanbod("starters", "🌱"),
    ],
  },
  {
    sleutel: "apps",
    titel: "Apps",
    intro: "Een eigen app voor je werk, en onze eigen apps om te proberen.",
    tools: [
      { sleutel: "apps", naam: "De apps van ZekerFlex", kort: "Een eigen app voor flexwerkers, bedrijven, horeca, rijscholen, webshops en websites. Installeren kan direct, zonder store.", href: "/apps", knop: "Bekijk de apps", icoon: "📱" },
      { sleutel: "apps-en-spelletjes", naam: "Apps & spelletjes", kort: "Talkaro, FlikFlak en de webshop: ga er direct naartoe.", href: "/apps-en-spelletjes", knop: "Ga naar de apps", icoon: "🎮" },
    ],
  },
];

export const ALLE_ONLINE_TOOLS: OnlineTool[] = ONLINE_GROEPEN.flatMap((g) => g.tools);

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
