import { newBlock, type Block, type BlockProps, type BlockType, type Company, type Page } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Webshop openen: de startpunten voor een nieuwe webshop (de tweede variant van
// ZekerFlex Sites, naast "Website bouwen"). Een webshop begint met de winkel zelf
// op de voorgrond: een kop met één belofte, de producten, redenen om hier te kopen
// en de teksten die elke Nederlandse webwinkel moet hebben (verzenden en retourneren,
// voorwaarden). Puur en client-veilig, zonder opslag.
// ---------------------------------------------------------------------------

export interface WebshopTemplate {
  id: string;
  naam: string;
  omschrijving: string;
  theme: { kleur: string; accent: string };
  heroKop: string;
  heroTekst: string;
  knop: string;
  over: string;
  /** drie redenen om hier te kopen */
  usps: { titel: string; tekst: string }[];
  /** een voorbeeldcategorie voor de eerste producten, zodat de winkel meteen klopt */
  categorie: string;
}

const USPS_STANDAARD = [
  { titel: "Snel in huis", tekst: "Voor 15.00 uur besteld, volgende werkdag verzonden." },
  { titel: "14 dagen bedenktijd", tekst: "Past het niet? Stuur het terug, binnen 14 dagen." },
  { titel: "Gewoon een mens", tekst: "Vragen over je bestelling? Je krijgt echt antwoord." },
];

export const WEBSHOP_TEMPLATES: WebshopTemplate[] = [
  {
    id: "algemeen",
    naam: "Allround webwinkel",
    omschrijving: "Rustig en helder, voor elk soort product.",
    theme: { kleur: "#26313A", accent: "#3FC1A5" },
    heroKop: "{bedrijf}: mooie producten, snel bij je thuis",
    heroTekst: "Bekijk de collectie en bestel in een paar klikken.",
    knop: "Naar de winkel",
    over: "{bedrijf} is een webwinkel uit {plaats}. We kiezen onze producten met zorg, verzenden snel en helpen persoonlijk als er iets is.",
    usps: USPS_STANDAARD,
    categorie: "Nieuw",
  },
  {
    id: "mode",
    naam: "Mode en accessoires",
    omschrijving: "Veel ruimte voor foto's, voor kleding, tassen en sieraden.",
    theme: { kleur: "#1F1F1F", accent: "#C8A24B" },
    heroKop: "De nieuwe collectie van {bedrijf}",
    heroTekst: "Stijlvol, goed gemaakt en snel geleverd.",
    knop: "Bekijk de collectie",
    over: "Bij {bedrijf} draait het om kleding en accessoires die lang meegaan. Ontworpen en geselecteerd in {plaats}.",
    usps: [
      { titel: "Pasvorm uitgelegd", tekst: "Bij elk product staat een maattabel, dus minder retour." },
      { titel: "14 dagen bedenktijd", tekst: "Past het niet? Binnen 14 dagen terug." },
      { titel: "Snel verzonden", tekst: "Voor 15.00 uur besteld, volgende werkdag onderweg." },
    ],
    categorie: "Collectie",
  },
  {
    id: "eten",
    naam: "Eten en drinken",
    omschrijving: "Warm en smakelijk, voor delicatessen, koffie, thee of een bakkerij.",
    theme: { kleur: "#7A3E1D", accent: "#E9B44C" },
    heroKop: "Lekkers van {bedrijf}, verpakt met zorg",
    heroTekst: "Vers gemaakt in {plaats} en veilig bij je thuis bezorgd.",
    knop: "Bestel nu",
    over: "{bedrijf} maakt en selecteert eten en drinken met liefde voor het ambacht. Alles wordt vers en netjes verpakt verstuurd.",
    usps: [
      { titel: "Vers verpakt", tekst: "Gemaakt op bestelling en veilig verpakt." },
      { titel: "Afhalen of bezorgen", tekst: "Haal het zelf op in {plaats}, of laat het bezorgen." },
      { titel: "Allergieën duidelijk", tekst: "Per product staat wat erin zit." },
    ],
    categorie: "Proefpakketten",
  },
  {
    id: "wonen",
    naam: "Wonen en cadeaus",
    omschrijving: "Zacht en uitnodigend, voor woonaccessoires, planten en cadeaus.",
    theme: { kleur: "#2F5D50", accent: "#E8A87C" },
    heroKop: "Maak het gezellig met {bedrijf}",
    heroTekst: "Woonaccessoires en cadeaus die je graag geeft en houdt.",
    knop: "Ontdek de winkel",
    over: "{bedrijf} verkoopt zorgvuldig gekozen spullen voor in huis en om cadeau te doen. Op wens mooi ingepakt, met kaartje.",
    usps: [
      { titel: "Cadeau-verpakking", tekst: "Voeg bij het bestellen een kaartje en inpakpapier toe." },
      { titel: "Direct naar de ontvanger", tekst: "Stuur het rechtstreeks naar het adres van de ander." },
      { titel: "14 dagen bedenktijd", tekst: "Past het niet? Stuur het terug." },
    ],
    categorie: "Cadeaus",
  },
  {
    id: "beauty",
    naam: "Verzorging en gezondheid",
    omschrijving: "Fris en schoon, voor beauty-, verzorgings- en welzijnsproducten.",
    theme: { kleur: "#365E7A", accent: "#F2A7A0" },
    heroKop: "Verzorging met aandacht, van {bedrijf}",
    heroTekst: "Producten waar je huid en haar blij van worden.",
    knop: "Bekijk de producten",
    over: "{bedrijf} biedt verzorgingsproducten met duidelijke ingrediënten en eerlijk advies. Onze winkel zit in {plaats}.",
    usps: [
      { titel: "Duidelijke ingrediënten", tekst: "Alles wat erin zit, staat bij het product." },
      { titel: "Persoonlijk advies", tekst: "Twijfel je? Stuur ons een bericht." },
      { titel: "Veilig verpakt", tekst: "Netjes en breukvrij op weg naar jou." },
    ],
    categorie: "Verzorging",
  },
  {
    id: "vakwinkel",
    naam: "Vakwinkel (zakelijk en techniek)",
    omschrijving: "Zakelijk en duidelijk, voor gereedschap, onderdelen en werkkleding.",
    theme: { kleur: "#1D4E89", accent: "#F28C38" },
    heroKop: "{bedrijf}: alles voor de vakman",
    heroTekst: "Op voorraad en snel geleverd, ook op rekening voor bedrijven.",
    knop: "Naar het assortiment",
    over: "{bedrijf} levert aan vakmensen en bedrijven in heel Nederland. Voor vragen over een product bel je gewoon met onze specialisten.",
    usps: [
      { titel: "Op voorraad", tekst: "Wat je ziet, hebben we in huis." },
      { titel: "Zakelijk bestellen", tekst: "Met btw-nummer en een eigen referentie op de factuur." },
      { titel: "Advies van vakmensen", tekst: "Bel of mail, we denken graag mee." },
    ],
    categorie: "Assortiment",
  },
];

export const webshopTemplate = (id: string): WebshopTemplate => WEBSHOP_TEMPLATES.find((t) => t.id === id) ?? WEBSHOP_TEMPLATES[0]!;

const vul = (s: string, c: Pick<Company, "naam" | "plaats">) =>
  s
    .replaceAll("{bedrijf}", c.naam || "Onze webwinkel")
    .replaceAll("{plaats} en omgeving", c.plaats ? `${c.plaats} en omgeving` : "de regio")
    .replaceAll("{plaats}", c.plaats || "Nederland");

/** Standaardtekst "Verzenden en retourneren": een nette start die de ondernemer nog moet nalopen. */
export function verzendTekst(c: Pick<Company, "naam" | "plaats">): string {
  return vul(
    "Bestellingen die we voor 15.00 uur op een werkdag ontvangen, verzenden we meestal dezelfde of de volgende werkdag. Je krijgt een bericht zodra je pakket onderweg is. Afhalen in {plaats} kan ook, als dat bij de bestelling staat.\n\nJe mag je bestelling binnen 14 dagen na ontvangst zonder opgave van reden terugsturen. Meld dit vooraf via e-mail aan {bedrijf}. Het product moet ongebruikt en compleet zijn. Het aankoopbedrag betalen we binnen 14 dagen na ontvangst van de retourzending terug. De kosten van het terugsturen zijn voor jou, tenzij we iets anders met je hebben afgesproken.\n\nIs er iets beschadigd of verkeerd geleverd? Stuur ons binnen een paar dagen een foto, dan lossen we het op.",
    c,
  );
}

/** Standaardtekst "Algemene voorwaarden": kort en leesbaar, met de gegevens die de wet vraagt. */
export function voorwaardenTekst(c: Company): string {
  const adres = [c.straat, [c.postcode, c.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const gegevens = [c.naam, adres, c.kvk ? `KVK ${c.kvk}` : "", c.email, c.telefoon].filter(Boolean).join(" · ");
  return `Deze voorwaarden gelden voor elke bestelling bij ${c.naam || "deze webwinkel"}.\n\nWie zijn wij: ${gegevens}.\n\nPrijzen staan in euro's en zijn inclusief btw. Een overeenkomst komt tot stand zodra je bestelling bij ons binnen is en wij die bevestigen. Wij leveren zolang de voorraad strekt. Is een product onverwacht niet beschikbaar, dan horen je dat zo snel mogelijk en krijg je je geld terug of een alternatief.\n\nBetalen kan op de manieren die bij het afrekenen staan. Je mag binnen 14 dagen na ontvangst van een product zonder opgave van reden annuleren; zie de pagina over verzenden en retourneren.\n\nHeb je een klacht? Mail ons, we reageren binnen twee werkdagen. Komen we er samen niet uit, dan kun je terecht bij het Europese platform voor online geschillenbeslechting.`;
}

/** De pagina's van een nieuwe webshop: Home, Over ons, Verzenden en retourneren, Voorwaarden, Contact. */
export function webshopPages(t: WebshopTemplate, c: Company, newId: () => string): Page[] {
  const f = (s: string) => vul(s, c);
  const block = <T extends BlockType>(type: T, props: Partial<BlockProps[T]>) => {
    const b = newBlock(type, newId());
    return { ...b, props: { ...b.props, ...props } } as Block;
  };
  return [
    {
      id: newId(),
      slug: "",
      titel: "Home",
      seoTitel: f("{bedrijf} | webwinkel in {plaats}"),
      seoOmschrijving: f(t.heroTekst),
      blocks: [
        block("hero", { kop: f(t.heroKop), tekst: f(t.heroTekst), knop: t.knop, knopLink: "winkel" }),
        block("producten", { kop: "Onze producten", tekst: "", categorie: "", aantal: 8 }),
        block("usps", { kop: "Waarom bij ons kopen", items: t.usps.map((u) => ({ titel: f(u.titel), tekst: f(u.tekst) })) }),
        block("tekstFoto", { kop: f("Over {bedrijf}"), tekst: f(t.over) }),
        block("reviews", {}),
        block("cta", { kop: "Klaar om te bestellen?", tekst: "Kijk rustig rond. Heb je een vraag, stuur ons gerust een bericht.", knop: t.knop, knopLink: "winkel" }),
      ],
    },
    {
      id: newId(),
      slug: "over-ons",
      titel: "Over ons",
      seoTitel: f("Over {bedrijf}"),
      seoOmschrijving: f(t.over).slice(0, 155),
      blocks: [block("tekst", { kop: f("Over {bedrijf}"), tekst: f(t.over) })],
    },
    {
      id: newId(),
      slug: "verzenden-en-retourneren",
      titel: "Verzenden en retourneren",
      seoTitel: f("Verzenden en retourneren | {bedrijf}"),
      seoOmschrijving: f("Hoe en wanneer {bedrijf} je bestelling verzendt en hoe retourneren werkt."),
      blocks: [block("tekst", { kop: "Verzenden en retourneren", tekst: verzendTekst(c) })],
    },
    {
      id: newId(),
      slug: "voorwaarden",
      titel: "Algemene voorwaarden",
      seoTitel: f("Algemene voorwaarden | {bedrijf}"),
      seoOmschrijving: f("De voorwaarden voor bestellingen bij {bedrijf}."),
      blocks: [block("tekst", { kop: "Algemene voorwaarden", tekst: voorwaardenTekst(c) })],
    },
    {
      id: newId(),
      slug: "contact",
      titel: "Contact",
      seoTitel: f("Contact | {bedrijf}"),
      seoOmschrijving: f("Een vraag over je bestelling of een product? Neem contact op met {bedrijf}."),
      blocks: [block("contact", { kop: "Vragen over een bestelling?", tekst: "Stuur ons een bericht, we antwoorden binnen twee werkdagen." }), block("openingstijden", {})],
    },
  ];
}
