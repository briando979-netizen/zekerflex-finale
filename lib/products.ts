// ---------------------------------------------------------------------------
// Ontbundelde producten ("unbundling"): losse spin-offs uit de ZekerFlex-
// codebase die elk een scherp, acuut probleem oplossen bij een bredere
// doelgroep dan alleen uitzendbureaus — plus het vlaggenschip (all-in-one).
// Dit is de verkoop-catalogus voor /producten. Prijzen zijn INDICATIEVE
// startprijzen (definitief altijd in overleg). De lead-capture (ProductLeadForm
// + /api/partner-lead) gebruikt `slug` om de interesse te herkennen.
// 16 nov 2026: salesComplexity, timeToMrr en reused zijn interne verkoopnotities;
// die staan niet meer op de openbare pagina's. De zichtbare teksten (kicker,
// tagline, concept, audience, why, features) zijn in gewoon Nederlands.
// ---------------------------------------------------------------------------

export type ProductDeployment = "saas" | "self-hosted" | "api" | "platform";
export type SalesComplexity = "laag" | "gemiddeld" | "hoog";

export interface Product {
  slug: string; // URL + lead-herkenning
  name: string;
  kicker: string; // korte categorie, bv. "Kandidaten zoeken en koppelen met AI"
  tagline: string;
  concept: string; // 1-2 zinnen propositie
  audience: string;
  deployment: ProductDeployment;
  /** intern (verkoop): niet openbaar tonen */
  salesComplexity: SalesComplexity;
  /** intern (verkoop): niet openbaar tonen, bv. "2–4 weken" */
  timeToMrr: string;
  priceLabel: string;
  why: string[]; // waarom dit werkt, voor de klant
  features: string[];
  /** intern: bestaande code die hergebruikt wordt; niet openbaar tonen */
  reused: string[];
  ctaLabel: string;
  featured?: boolean;
  flagship?: boolean;
}

export const SPINOFF_PRODUCTS: Product[] = [
  {
    slug: "recruitflex-ai",
    name: "RecruitFlex AI",
    kicker: "Kandidaten zoeken en koppelen met AI",
    tagline: "Sneller de juiste kandidaat vinden — als losse module naast je huidige wervingssysteem.",
    concept:
      "Het koppelen met AI, het uitlezen van cv's, de uitleg bij elke match en het benaderen via WhatsApp van ZekerFlex, los van de verloning. Als losse online dienst of als koppeling met Carerix, Otys, Bullhorn of Teamtailor.",
    audience: "Recruiters bij bedrijven en intercedenten bij uitzendbureaus",
    deployment: "saas",
    salesComplexity: "laag",
    timeToMrr: "2–4 weken",
    priceLabel: "€ 99 – € 299 per recruiter per maand",
    why: [
      "Je zoekt sneller kandidaten met AI, zonder je administratie- of facturatiesysteem te vervangen.",
      "Geen gedoe met de Waadi, StiPP of ingewikkelde regels voor verloning: dit gaat alleen over werven.",
      "Je hoeft niet over te stappen op een heel nieuw systeem.",
    ],
    features: [
      "Met AI kandidaten zoeken in je eigen bestand",
      "Een matchscore met uitleg waarom iemand past",
      "Cv's automatisch uitlezen en een eerste bericht klaarzetten",
      "Kandidaten benaderen via WhatsApp en chat, ook bellen",
      "Koppelt via een API en webhooks aan je huidige wervingssysteem",
    ],
    reused: ["lib/ai", "AI-recruiter + matching/explainMatch", "Jarvis-workbench", "beeld/CV-engine", "WhatsApp/WebRTC-chat"],
    ctaLabel: "RecruitFlex AI aanvragen",
    featured: true,
  },
  {
    slug: "sovereignops",
    name: "SovereignOps Engine",
    kicker: "Eigen AI en apps op je eigen server",
    tagline: "Je eigen AI-basis op een goedkope Europese server — zonder Amerikaanse cloud.",
    concept:
      "Een kant-en-klaar pakket met AI en de techniek eromheen, op je eigen server, voor Europese bedrijven, zorginstellingen en ICT-dienstverleners die hun gegevens niet naar OpenAI of Microsoft mogen of willen sturen (AVG en de Europese AI-verordening).",
    audience: "ICT-dienstverleners, mkb en zorg met strenge privacy-eisen",
    deployment: "self-hosted",
    salesComplexity: "gemiddeld",
    timeToMrr: "3–6 weken",
    priceLabel: "eenmalig € 2.500 inrichting + € 149 – € 499 per maand beheer",
    why: [
      "Een beproefde opzet: de beveiligde verbinding (https) is vanzelf geregeld, met een eigen taalmodel, en alles staat er met één opdracht op.",
      "Draait op een goedkope eigen server en start na een herstart of storing vanzelf weer op.",
      "Een eigen basis voor je AI-toepassingen, zonder je gegevens naar een Amerikaanse cloud te sturen.",
    ],
    features: [
      "Met één opdracht geïnstalleerd op een nieuwe server",
      "Beveiligde verbinding (https) automatisch geregeld",
      "Eigen taal- en beeldmodel op je server, zonder te betalen per gebruik",
      "Bewaking die storingen opvangt, en back-ups",
      "Ingebouwde terminal en code-editor in de browser",
    ],
    reused: ["deploy/-recepten", "Caddyfile + docker-compose.vps.yml", "KV-config", "health-watchdog", "terminal & code-server"],
    ctaLabel: "SovereignOps aanvragen",
  },
  {
    slug: "flexcompliance-api",
    name: "FlexCompliance API",
    kicker: "StiPP- en ABU-regels als koppeling",
    tagline: "De lastige Nederlandse regels voor uitzendwerk als kleine koppeling (API), kant-en-klaar.",
    concept:
      "Een koppeling (API) voor makers van HR-software, salarisadministratiekantoren en bouwers van online software: pensioenaangiftes bij StiPP, de fasen van de ABU en NBBU en de beoordeling volgens de Wet DBA, kant-en-klaar.",
    audience: "Makers van HR-software en salarisbureaus",
    deployment: "api",
    salesComplexity: "gemiddeld",
    timeToMrr: "1–2 maanden",
    priceLabel: "€ 0,05 – € 0,20 per verwerkte loonstrook of aangifte · minimaal € 149 per maand",
    why: [
      "De Nederlandse regels voor uitzendwerk (StiPP, de fasen van de ABU en NBBU, de Wet DBA) zijn ingewikkeld.",
      "Je hoeft die regels niet zelf uit te zoeken en te bouwen.",
      "Dezelfde regels draaien al in het ZekerFlex-platform.",
    ],
    features: [
      "Pensioenaangifte bij StiPP (de maandelijkse UPA) via de API",
      "Bijhouden in welke ABU- of NBBU-fase elke uitzendkracht zit",
      "Beoordeling volgens de Wet DBA, en de regels voor de KOR en btw",
      "Ziekmeldingen (Ziektewet) en een volledig logboek van elke stap",
      "Je betaalt naar gebruik; met een technische beschrijving (OpenAPI) en webhooks",
    ],
    reused: ["StiPP-exportmodules", "ABU-fasenbewaking", "ZW-ziekmeldingen", "auditspoor", "public API (v1)"],
    ctaLabel: "API-toegang aanvragen",
  },
];

export const FLAGSHIP: Product = {
  slug: "zekerflex-platform",
  name: "ZekerFlex All-in-One",
  kicker: "Het complete flex- en uitzendplatform",
  tagline: "De hele motor onder één dak — voor bureaus die het complete pakket zoeken.",
  concept:
    "Het overkoepelende platform: marktplaats, AI-recruiter, koppelen van werk en krachten, van uren naar facturen, uitzenden (ABU/StiPP) en webshop. Onder je eigen merk, of helemaal op je eigen server.",
  audience: "Nieuwe of overstappende flex- en uitzendbureaus",
  deployment: "platform",
  salesComplexity: "hoog",
  timeToMrr: "2–4 maanden",
  priceLabel: "vanaf € 499 per maand (onder je eigen merk) · op je eigen server op aanvraag",
  why: [
    "Eén uitontwikkelde keten van vacature tot uitbetaling.",
    "Onder je eigen merk, of op je eigen server.",
    "AI op eigen modellen — geen kosten per intake of beeld.",
  ],
  features: [
    "Marktplaats en automatisch koppelen van werk en krachten",
    "AI-recruiter, van uren naar facturen, uitzenden (ABU/StiPP)",
    "Webshop",
    "Eigen merk, kleuren en subdomein",
  ],
  reused: ["het volledige platform"],
  ctaLabel: "Demo of pilot aanvragen",
  flagship: true,
};

/** Hoe een product geleverd wordt, in gewone woorden (16 nov 2026: was "SaaS of plug-in", "Self-hosted", "API as a service"). */
export const DEPLOYMENT_LABEL: Record<ProductDeployment, string> = {
  saas: "Online dienst of koppeling",
  "self-hosted": "Op je eigen server",
  api: "Koppeling (API)",
  platform: "Platform onder je eigen merk",
};

/** Alle producten (spin-offs + vlaggenschip) voor de vergelijkingstabel en de lead-keuze. */
export const ALL_PRODUCTS: Product[] = [...SPINOFF_PRODUCTS, FLAGSHIP];

export const PRODUCT_SLUGS = SPINOFF_PRODUCTS.map((p) => p.slug);

export function spinoffProduct(slug: string): Product | undefined {
  return SPINOFF_PRODUCTS.find((p) => p.slug === slug);
}

/** Herken een product aan slug (spin-off of vlaggenschip) voor de lead-pijplijn. */
export function productBySlug(slug: string): Product | undefined {
  return ALL_PRODUCTS.find((p) => p.slug === slug);
}
