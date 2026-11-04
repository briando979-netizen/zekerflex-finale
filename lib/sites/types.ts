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
  | "contact"
  | "vacatures"
  | "stappen"
  | "usps"
  | "producten"
  | "uitgelicht";

export interface Item {
  titel: string;
  tekst: string;
}

/** A card in the diensten block: an item with an optional photo on top (media id). */
export interface Dienst extends Item {
  foto?: string | null | undefined;
}

export interface BlockProps {
  hero: { kop: string; tekst: string; knop: string; knopLink: string; foto: string | null };
  tekst: { kop: string; tekst: string };
  tekstFoto: { kop: string; tekst: string; foto: string | null; fotoLinks: boolean };
  diensten: { kop: string; items: Dienst[] };
  galerij: { kop: string; fotos: string[] };
  reviews: { kop: string; items: { naam: string; tekst: string; sterren: number }[] };
  faq: { kop: string; items: { vraag: string; antwoord: string }[] };
  openingstijden: { kop: string; regels: { dag: string; tijd: string }[] };
  cta: { kop: string; tekst: string; knop: string; knopLink: string };
  contact: { kop: string; tekst: string; formulier: boolean };
  /** the company's open shifts on ZekerFlex, filled in live when a visitor opens the page */
  vacatures: { kop: string; tekst: string; aantal: number };
  /** "how it works": steps, numbered by the page itself */
  stappen: { kop: string; items: Item[] };
  /** reasons to choose the company, each with a check mark */
  usps: { kop: string; items: Item[] };
  /** products from the site's shop (SiteDoc.winkel) as cards; categorie "" = all */
  producten: { kop: string; tekst: string; categorie: string; aantal: number };
  /** one product of the shop, big, with photo and price */
  uitgelicht: { productId: string; kop: string; tekst: string; fotoLinks: boolean };
}

/**
 * A product in a site's own shop. Prices in euro cents including VAT. Photos are
 * media ids of the site, like every other photo. Rendering: lib/sites/winkel-render.ts.
 */
export interface SiteProduct {
  id: string;
  naam: string;
  /** address part of the product page: /p/<slug> */
  slug: string;
  prijsCents: number;
  /** the old price when on offer ("van € 12,50 voor € 9,95"); null = no offer */
  oudePrijsCents?: number | null | undefined;
  /** one line on the card */
  korteTekst: string;
  /** the product page */
  omschrijving: string;
  fotos: string[];
  /** "" = no category */
  categorie: string;
  zichtbaar: boolean;
  uitverkocht: boolean;
  /** how many are left; null/absent = not tracked. At 0 the product counts as sold out; every order lowers it */
  voorraad?: number | null | undefined;
  /** choices a customer makes, e.g. Maat (S, M, L) and Kleur (Zwart, Wit); at most two */
  opties?: ProductOptie[] | undefined;
  /** copied from the ZekerFlex webshop (ShopProduct id), so the builder can show where it came from */
  bron?: { zekerflex: string } | undefined;
}

export interface ProductOptie {
  naam: string;
  waarden: string[];
}

/** A site's shop: products and how ordering works (no online payment yet: the company settles it). */
export interface Winkel {
  producten: SiteProduct[];
  /** the order form (/bestellen) is open */
  bestellen: boolean;
  levering: { afhalen: boolean; bezorgen: boolean; bezorgkostenCents: number; gratisVanafCents: number | null };
  /** how paying works, shown with every order ("Je betaalt bij het afhalen, contant of met pin.") */
  betaalTekst: string;
}

export const LEGE_WINKEL: Winkel = {
  producten: [],
  bestellen: true,
  levering: { afhalen: true, bezorgen: false, bezorgkostenCents: 0, gratisVanafCents: null },
  betaalTekst: "Je betaalt bij het afhalen of bij de bezorging. We nemen na je bestelling contact met je op.",
};

/** One open shift as a company's own website shows it (lib/sites/vacancies.ts fills these in). */
export interface SiteVacancy {
  id: string;
  titel: string;
  /** ISO times */
  start: string;
  eind: string;
  plaats: string;
  uurloonCents: number;
  /** where to react: the shift's page on ZekerFlex */
  url: string;
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
  /**
   * "luxe": more room, fine lines, refined headings and a full-height opening photo.
   * "premium": the ZekerFlex house style since 3 Nov 2026 (like schwarzwald.zekerflex.com): a dark
   * header and opening photo with a gradient, big display headings, round buttons, white cards on
   * cream and sand, a full footer. The default for new sites; existing sites keep theirs.
   * "beleving": premium laid out exactly like schwarzwald.zekerflex.com (lib/sites/beleving-render.ts):
   * an opening in two columns with tilted photos, a band with the offer, labels above headings,
   * big numbered steps, reviews on a dark band, a closing band in the accent. The default for new
   * sites and proposals since 4 Nov 2026; sites in premium keep premium.
   */
  stijl?: "standaard" | "luxe" | "premium" | "beleving" | undefined;
  /** media id of a photo of this site shown as the logo in the header; the name as text when absent */
  logo?: string | null | undefined;
}

export interface Company {
  naam: string;
  kvk: string;
  straat: string;
  postcode: string;
  plaats: string;
  telefoon: string;
  email: string;
  /** mobile number for a WhatsApp button, empty for none */
  whatsapp?: string | undefined;
  /** the company's pages on social media (https only) */
  socials?: string[] | undefined;
}

/**
 * A design proposal from ZekerFlex to a company (lib/sales/website-proposal.ts):
 * every page says it is not their official website, the contact form sends
 * nothing, search engines stay out and it stops showing when it expires.
 */
export interface SiteProposalMark {
  /** their current, official website ("devries-schilders.nl"), if known */
  officieel: string | null;
  /** ISO time after which the proposal no longer shows */
  verloopt: string;
}

export interface Media {
  id: string;
  file: string;
  width: number;
  height: number;
  alt: string;
  bron: "upload" | "internet" | "ai";
  sourceUrl?: string;
  /** a smaller copy (<id>-k.webp, 1600 px) next to an original of up to 4K: phones load that one (srcset) */
  klein?: { width: number; height: number } | undefined;
}

/** The result of the last DNS + https check of an own domain (lib/sites/domain.ts). */
export interface DomainCheck {
  at: string;
  /** zekerflex-site=<code> found: the company owns the domain */
  txt: boolean;
  /** every A record of the domain is our server */
  a: boolean;
  /** no AAAA records, or only ours (a foreign one sends visitors and Let's Encrypt elsewhere) */
  aaaa: boolean;
  /** the alias (www) points to us too; true when there is no alias */
  alias: boolean;
  /** our server answered over https with this site */
  https: boolean;
  problem: string | null;
}

/**
 * An own domain for a site: bakkerjansen.nl instead of /site/bakkerij-jansen.
 * Kept under its own KV key (lib/sites/domain.ts), not on the SiteDoc, so the
 * builder's autosave of a stale copy can never wipe it.
 */
export interface SiteDomain {
  /** the address visitors use, e.g. "bakkerjansen.nl" */
  host: string;
  /** the other form that redirects to host ("www.bakkerjansen.nl"); null for a deeper subdomain */
  alias: string | null;
  addedAt: string;
  /** ownership proven (TXT): both hosts are claimed for this site */
  verifiedAt: string | null;
  /** answered over https: visitors and search engines go to the own domain */
  activeAt: string | null;
  check: DomainCheck | null;
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
  /** an example site (lib/sites/demo.ts): a banner says so and the contact form sends nothing */
  voorbeeld?: boolean;
  /** a design proposal to a company that is not (yet) a customer */
  voorstel?: SiteProposalMark | undefined;
  /** the site's own shop; absent until the company adds a first product */
  winkel?: Winkel | undefined;
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
  stappen: "Zo werkt het (stappen)",
  usps: "Waarom wij (voordelen)",
  galerij: "Fotogalerij",
  reviews: "Reviews",
  faq: "Veelgestelde vragen",
  openingstijden: "Openingstijden",
  cta: "Oproep met knop",
  contact: "Contact en formulier",
  vacatures: "Vacatures (je open diensten)",
  producten: "Producten uit je winkel",
  uitgelicht: "Uitgelicht product",
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
    case "vacatures":
      return { id, type, props: { kop: "Werken bij ons", tekst: "Kom ons team versterken. Kies een dienst die bij je past en reageer direct via ZekerFlex.", aantal: 6 } };
    case "stappen":
      return {
        id,
        type,
        props: {
          kop: "Zo werkt het",
          items: [
            { titel: "Neem contact op", tekst: "Bel, mail of stuur een bericht via de website." },
            { titel: "Afspraak op maat", tekst: "We bespreken wat je nodig hebt. Je weet vooraf waar je aan toe bent." },
            { titel: "Wij gaan aan de slag", tekst: "Netjes, op tijd en volgens afspraak." },
          ],
        },
      };
    case "producten":
      return { id, type, props: { kop: "Ons assortiment", tekst: "", categorie: "", aantal: 8 } };
    case "uitgelicht":
      return { id, type, props: { productId: "", kop: "Uitgelicht", tekst: "", fotoLinks: false } };
    case "usps":
      return {
        id,
        type,
        props: {
          kop: "Waarom kiezen voor ons",
          items: [
            { titel: "Persoonlijk", tekst: "Eén vast aanspreekpunt, van begin tot eind." },
            { titel: "Duidelijke afspraken", tekst: "Vooraf weten waar je aan toe bent." },
            { titel: "Dichtbij", tekst: "Uit de buurt, dus snel ter plaatse." },
          ],
        },
      };
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
        block("stappen", {}),
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
