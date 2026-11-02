// ---------------------------------------------------------------------------
// ZekerFlex Sites — a customer's website as plain data: pages made of blocks,
// a theme and the company details. Client-safe (the builder renders its live
// preview with the same code as the published site). Photos are referenced by
// media id; the file itself lives on our own disk, so the strict img-src 'self'
// policy holds and visitors never load anything from a third party.
// ---------------------------------------------------------------------------

export type BlockType =
  | "hero"
  | "tekst"
  | "tekstFoto"
  | "diensten"
  | "galerij"
  | "reviews"
  | "faq"
  | "openingstijden"
  | "cta"
  | "contact";

export interface Item {
  titel: string;
  tekst: string;
}

export interface BlockProps {
  hero: { kop: string; tekst: string; knop: string; knopLink: string; foto: string | null };
  tekst: { kop: string; tekst: string };
  tekstFoto: { kop: string; tekst: string; foto: string | null; fotoLinks: boolean };
  diensten: { kop: string; items: Item[] };
  galerij: { kop: string; fotos: string[] };
  reviews: { kop: string; items: { naam: string; tekst: string; sterren: number }[] };
  faq: { kop: string; items: { vraag: string; antwoord: string }[] };
  openingstijden: { kop: string; regels: { dag: string; tijd: string }[] };
  cta: { kop: string; tekst: string; knop: string; knopLink: string };
  contact: { kop: string; tekst: string; formulier: boolean };
}

export type Block = { [T in BlockType]: { id: string; type: T; props: BlockProps[T] } }[BlockType];

export interface Page {
  id: string;
  /** "" is the home page */
  slug: string;
  titel: string;
  seoTitel: string;
  seoOmschrijving: string;
  blocks: Block[];
}

export interface Theme {
  kleur: string;
  accent: string;
  lettertype: "modern" | "klassiek" | "vriendelijk";
  hoeken: "rond" | "strak";
}

export interface Company {
  naam: string;
  kvk: string;
  straat: string;
  postcode: string;
  plaats: string;
  telefoon: string;
  email: string;
}

export interface Media {
  id: string;
  file: string;
  width: number;
  height: number;
  alt: string;
  bron: "upload" | "internet" | "ai";
  sourceUrl?: string;
}

export interface SiteDoc {
  id: string;
  tenantId: string;
  slug: string;
  theme: Theme;
  bedrijf: Company;
  pages: Page[];
  media: Media[];
  /** the build visitors see; null until the first publish */
  liveBuild: string | null;
  builds: { id: string; at: string; by: string }[];
  createdAt: string;
  updatedAt: string;
}

export const THEME_PRESETS: { naam: string; kleur: string; accent: string }[] = [
  { naam: "Bos", kleur: "#0E5C4A", accent: "#F2B544" },
  { naam: "Oceaan", kleur: "#1D4E89", accent: "#F28C38" },
  { naam: "Robijn", kleur: "#9B1D3A", accent: "#F5C04E" },
  { naam: "Antraciet", kleur: "#26313A", accent: "#3FC1A5" },
  { naam: "Aubergine", kleur: "#4B2A6B", accent: "#F2A65A" },
  { naam: "Terracotta", kleur: "#A4482B", accent: "#2F6F73" },
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Openingsblok met foto",
  tekst: "Tekst",
  tekstFoto: "Tekst met foto",
  diensten: "Diensten",
  galerij: "Fotogalerij",
  reviews: "Reviews",
  faq: "Veelgestelde vragen",
  openingstijden: "Openingstijden",
  cta: "Oproep met knop",
  contact: "Contact en formulier",
};

/** A fresh block of a type, with sensible example content. */
export function newBlock(type: BlockType, id: string): Block {
  switch (type) {
    case "hero":
      return { id, type, props: { kop: "Welkom", tekst: "Vertel in één zin wat je doet en voor wie.", knop: "Neem contact op", knopLink: "contact", foto: null } };
    case "tekst":
      return { id, type, props: { kop: "Over ons", tekst: "Schrijf hier je verhaal." } };
    case "tekstFoto":
      return { id, type, props: { kop: "Zo werken wij", tekst: "Vertel wat klanten van je mogen verwachten.", foto: null, fotoLinks: false } };
    case "diensten":
      return { id, type, props: { kop: "Wat we doen", items: [{ titel: "Dienst 1", tekst: "Korte uitleg." }, { titel: "Dienst 2", tekst: "Korte uitleg." }, { titel: "Dienst 3", tekst: "Korte uitleg." }] } };
    case "galerij":
      return { id, type, props: { kop: "Ons werk", fotos: [] } };
    case "reviews":
      return { id, type, props: { kop: "Wat klanten zeggen", items: [{ naam: "Een tevreden klant", tekst: "Snel, vriendelijk en precies wat we nodig hadden.", sterren: 5 }] } };
    case "faq":
      return { id, type, props: { kop: "Veelgestelde vragen", items: [{ vraag: "Hoe snel kunnen jullie beginnen?", antwoord: "Meestal binnen een week. Bel of mail ons voor de mogelijkheden." }] } };
    case "openingstijden":
      return { id, type, props: { kop: "Openingstijden", regels: [{ dag: "Maandag t/m vrijdag", tijd: "09:00 – 17:00" }, { dag: "Zaterdag", tijd: "10:00 – 16:00" }, { dag: "Zondag", tijd: "Gesloten" }] } };
    case "cta":
      return { id, type, props: { kop: "Klaar om te beginnen?", tekst: "Neem vandaag nog contact op.", knop: "Neem contact op", knopLink: "contact" } };
    case "contact":
      return { id, type, props: { kop: "Contact", tekst: "Stuur ons een bericht; we reageren binnen één werkdag.", formulier: true } };
  }
}

export interface SectorTemplate {
  id: string;
  naam: string;
  omschrijving: string;
  theme: Pick<Theme, "kleur" | "accent">;
  heroKop: string;
  heroTekst: string;
  over: string;
  diensten: Item[];
  faq: { vraag: string; antwoord: string }[];
}

/** Starting points per sector; {bedrijf} and {plaats} are filled in from the company. */
export const SECTOR_TEMPLATES: SectorTemplate[] = [
  {
    id: "algemeen",
    naam: "Zakelijke dienstverlening",
    omschrijving: "Rustig en professioneel, voor elk bedrijf.",
    theme: { kleur: "#0E5C4A", accent: "#F2B544" },
    heroKop: "{bedrijf}: betrouwbaar en dichtbij",
    heroTekst: "Persoonlijk advies en vakwerk in {plaats} en omgeving.",
    over: "{bedrijf} helpt bedrijven en particulieren in {plaats} met heldere afspraken en vakwerk. Je hebt één vast aanspreekpunt en we doen wat we zeggen.",
    diensten: [
      { titel: "Advies", tekst: "We kijken samen wat je nodig hebt en wat het kost, vooraf duidelijk." },
      { titel: "Uitvoering", tekst: "Netjes, op tijd en volgens afspraak." },
      { titel: "Nazorg", tekst: "Ook na de oplevering kun je bij ons terecht." },
    ],
    faq: [
      { vraag: "Werken jullie ook buiten {plaats}?", antwoord: "Ja, in de wijde omgeving. Vraag gerust naar de mogelijkheden." },
      { vraag: "Hoe snel krijg ik een offerte?", antwoord: "Meestal binnen twee werkdagen." },
    ],
  },
  {
    id: "horeca",
    naam: "Horeca",
    omschrijving: "Warm en uitnodigend, voor restaurant, café of catering.",
    theme: { kleur: "#9B1D3A", accent: "#F5C04E" },
    heroKop: "Welkom bij {bedrijf}",
    heroTekst: "Lekker eten en een warm welkom in {plaats}.",
    over: "Bij {bedrijf} draait alles om goede producten, een fijne sfeer en gasten die graag terugkomen.",
    diensten: [
      { titel: "Lunch en diner", tekst: "Seizoensgerechten met verse producten uit de regio." },
      { titel: "Groepen en feesten", tekst: "Van verjaardag tot bedrijfsborrel: wij regelen het." },
      { titel: "Catering", tekst: "Wij koken ook bij jou op locatie." },
    ],
    faq: [
      { vraag: "Moet ik reserveren?", antwoord: "Voor groepen vanaf zes personen wel; bel of mail ons." },
      { vraag: "Houden jullie rekening met allergieën?", antwoord: "Zeker. Meld het bij je reservering of aan tafel." },
    ],
  },
  {
    id: "bouw",
    naam: "Bouw en techniek",
    omschrijving: "Stevig en duidelijk, voor aannemer, installateur of klusbedrijf.",
    theme: { kleur: "#26313A", accent: "#F28C38" },
    heroKop: "{bedrijf}: vakwerk in bouw en techniek",
    heroTekst: "Van verbouwing tot onderhoud in {plaats} en omgeving. Vaste prijs, vaste planning.",
    over: "{bedrijf} is een team van ervaren vakmensen. We werken veilig, ruimen netjes op en houden je op de hoogte.",
    diensten: [
      { titel: "Verbouwen", tekst: "Keuken, badkamer, uitbouw: van ontwerp tot oplevering." },
      { titel: "Installatie", tekst: "Elektra, water en verwarming volgens de normen." },
      { titel: "Onderhoud", tekst: "Periodiek onderhoud en snelle hulp bij storingen." },
    ],
    faq: [
      { vraag: "Werken jullie met een vaste prijs?", antwoord: "Ja, na een opname ter plekke krijg je een vaste prijs." },
      { vraag: "Zijn jullie VCA-gecertificeerd?", antwoord: "Onze vakmensen werken veilig en volgens de geldende certificeringen." },
    ],
  },
  {
    id: "schoonmaak",
    naam: "Schoonmaak",
    omschrijving: "Fris en helder, voor schoonmaak- en facilitaire bedrijven.",
    theme: { kleur: "#1D4E89", accent: "#3FC1A5" },
    heroKop: "Een schone werkplek, zonder zorgen",
    heroTekst: "{bedrijf} maakt kantoren, winkels en woningen schoon in {plaats} en omgeving.",
    over: "{bedrijf} werkt met vaste teams die je pand kennen. Zo weet je wie er binnenkomt en is het elke keer goed.",
    diensten: [
      { titel: "Kantoorschoonmaak", tekst: "Dagelijks, wekelijks of op afroep." },
      { titel: "Glasbewassing", tekst: "Binnen en buiten, ook op hoogte." },
      { titel: "Specialistische reiniging", tekst: "Vloeronderhoud, bouwschoonmaak en meer." },
    ],
    faq: [
      { vraag: "Kunnen jullie buiten kantoortijd werken?", antwoord: "Ja, 's ochtends vroeg, 's avonds of in het weekend." },
      { vraag: "Werken jullie met eigen middelen?", antwoord: "Ja, we nemen alles mee en werken zo duurzaam mogelijk." },
    ],
  },
  {
    id: "logistiek",
    naam: "Logistiek en transport",
    omschrijving: "Strak en efficiënt, voor transport, opslag en koeriers.",
    theme: { kleur: "#4B2A6B", accent: "#F2A65A" },
    heroKop: "Op tijd geleverd, elke keer",
    heroTekst: "{bedrijf} regelt transport en opslag vanuit {plaats}.",
    over: "{bedrijf} zorgt dat je goederen op tijd en heel aankomen. Je volgt je zending en hebt één contactpersoon.",
    diensten: [
      { titel: "Transport", tekst: "Pakketten, pallets en spoedritten." },
      { titel: "Opslag", tekst: "Veilig opgeslagen en snel weer onderweg." },
      { titel: "Orderpicking", tekst: "Wij verzamelen, verpakken en verzenden je orders." },
    ],
    faq: [
      { vraag: "Rijden jullie ook in het weekend?", antwoord: "Op afspraak wel. Vraag naar de mogelijkheden." },
      { vraag: "Is mijn zending verzekerd?", antwoord: "Ja, tijdens vervoer en opslag." },
    ],
  },
  {
    id: "zorg",
    naam: "Zorg en welzijn",
    omschrijving: "Rustig en vertrouwd, voor zorgaanbieders en praktijken.",
    theme: { kleur: "#2F6F73", accent: "#F2B544" },
    heroKop: "Zorg met aandacht",
    heroTekst: "{bedrijf} staat voor je klaar in {plaats} en omgeving.",
    over: "Bij {bedrijf} krijg je zorg van vaste, bekende gezichten. We luisteren, nemen de tijd en denken met je mee.",
    diensten: [
      { titel: "Zorg thuis", tekst: "Ondersteuning in je eigen omgeving." },
      { titel: "Begeleiding", tekst: "Hulp bij dagelijkse dingen, op jouw tempo." },
      { titel: "Advies", tekst: "Samen kijken we welke zorg bij je past." },
    ],
    faq: [
      { vraag: "Hoe vraag ik zorg aan?", antwoord: "Neem contact op; we leggen je de stappen uit en helpen je op weg." },
      { vraag: "Hebben jullie een wachtlijst?", antwoord: "Bel ons voor de actuele situatie." },
    ],
  },
];

const fillIn = (s: string, c: Pick<Company, "naam" | "plaats">) =>
  s
    .replaceAll("{bedrijf}", c.naam || "Ons bedrijf")
    // no town known: "in de regio", not "in de regio en omgeving"
    .replaceAll("{plaats} en omgeving", c.plaats ? `${c.plaats} en omgeving` : "de regio")
    .replaceAll("{plaats}", c.plaats || "de regio");

/** The pages of a new site, from a sector template and the company details. */
export function pagesFromTemplate(t: SectorTemplate, c: Company, newId: () => string): Page[] {
  const f = (s: string) => fillIn(s, c);
  const block = <T extends BlockType>(type: T, props: Partial<BlockProps[T]>) => {
    const b = newBlock(type, newId());
    return { ...b, props: { ...b.props, ...props } } as Block;
  };
  return [
    {
      id: newId(),
      slug: "",
      titel: "Home",
      seoTitel: f("{bedrijf} in {plaats}"),
      seoOmschrijving: f(t.heroTekst),
      blocks: [
        block("hero", { kop: f(t.heroKop), tekst: f(t.heroTekst) }),
        block("diensten", { kop: "Wat we doen", items: t.diensten.map((d) => ({ titel: f(d.titel), tekst: f(d.tekst) })) }),
        block("tekstFoto", { kop: f("Over {bedrijf}"), tekst: f(t.over) }),
        block("reviews", {}),
        block("cta", {}),
      ],
    },
    {
      id: newId(),
      slug: "over-ons",
      titel: "Over ons",
      seoTitel: f("Over {bedrijf}"),
      seoOmschrijving: f(t.over).slice(0, 155),
      blocks: [block("tekst", { kop: f("Over {bedrijf}"), tekst: f(t.over) }), block("faq", { items: t.faq.map((q) => ({ vraag: f(q.vraag), antwoord: f(q.antwoord) })) })],
    },
    {
      id: newId(),
      slug: "contact",
      titel: "Contact",
      seoTitel: f("Contact | {bedrijf}"),
      seoOmschrijving: f("Neem contact op met {bedrijf} in {plaats}."),
      blocks: [block("contact", {}), block("openingstijden", {})],
    },
  ];
}

/** "Bakkerij De Vries" → "bakkerij-de-vries" (a-z, 0-9 and dashes, 3–40 characters). */
export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** A page slug as used in links: "" for home, otherwise lowercase words with dashes. */
export function pageSlug(s: string): string {
  return slugify(s);
}

export const isHexColor = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
