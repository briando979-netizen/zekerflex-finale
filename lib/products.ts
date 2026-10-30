// ---------------------------------------------------------------------------
// Ontbundelde producten ("unbundling"): losse spin-offs uit de ZekerFlex-
// codebase die elk een scherp, acuut probleem oplossen bij een bredere
// doelgroep dan alleen uitzendbureaus — plus het vlaggenschip (all-in-one).
// Dit is de verkoop-catalogus voor /producten. Prijzen zijn INDICATIEVE
// startprijzen (definitief altijd in overleg). De lead-capture (ProductLeadForm
// + /api/partner-lead) gebruikt `slug` om de interesse te herkennen.
// ---------------------------------------------------------------------------

export type ProductDeployment = "saas" | "self-hosted" | "api" | "platform";
export type SalesComplexity = "laag" | "gemiddeld" | "hoog";

export interface Product {
  slug: string; // URL + lead-herkenning
  name: string;
  kicker: string; // korte categorie, bv. "AI sourcing & matching"
  tagline: string;
  concept: string; // 1-2 zinnen propositie
  audience: string;
  deployment: ProductDeployment;
  salesComplexity: SalesComplexity;
  timeToMrr: string; // "2–4 weken"
  priceLabel: string;
  why: string[]; // waarom dit werkt
  features: string[];
  reused: string[]; // bestaande code die hergebruikt wordt
  ctaLabel: string;
  featured?: boolean;
  flagship?: boolean;
}

export const SPINOFF_PRODUCTS: Product[] = [
  {
    slug: "recruitflex-ai",
    name: "RecruitFlex AI",
    kicker: "AI sourcing & matching",
    tagline: "Sneller de juiste kandidaat vinden — als losse module naast je bestaande ATS.",
    concept:
      "De AI-matching, CV-parsing, match-uitleg en WhatsApp-outreach van ZekerFlex, losgekoppeld van payroll. Als standalone SaaS of plug-in die koppelt met Carerix, Otys, Bullhorn of Teamtailor.",
    audience: "Corporate recruiters en uitzendbureau-intercedenten",
    deployment: "saas",
    salesComplexity: "laag",
    timeToMrr: "2–4 weken",
    priceLabel: "€ 99 – € 299 per recruiter / maand",
    why: [
      "Bedrijven willen wél sneller sourcen met AI, maar hun administratie- en facturatiesysteem niet vervangen.",
      "Geen last van WAADI, StiPP of complexe payroll-wetgeving.",
      "Korte verkoopcyclus (1–2 weken) t.o.v. een heel platform (3–6 maanden).",
    ],
    features: [
      "Kandidaten sourcen uit je eigen pool met AI",
      "Matchingscore mét uitleg (waarom deze match)",
      "Automatische CV-parsing en concept-outreach",
      "WhatsApp-outreach en chat (incl. bellen)",
      "Koppelt via REST-API + webhooks aan je bestaande ATS",
    ],
    reused: ["lib/ai", "AI-recruiter + matching/explainMatch", "Jarvis-workbench", "beeld/CV-engine", "WhatsApp/WebRTC-chat"],
    ctaLabel: "RecruitFlex AI aanvragen",
    featured: true,
  },
  {
    slug: "sovereignops",
    name: "SovereignOps Engine",
    kicker: "Self-hosted private AI & app-stack",
    tagline: "Je eigen soevereine AI-fundering op goedkope EU-hardware — zonder Amerikaanse cloud.",
    concept:
      "Een kant-en-klare, self-hosted AI- en infrastructuur-appliance voor Europese bedrijven, zorginstellingen en ICT-dienstverleners die hun data niet naar OpenAI/Microsoft mogen of willen sturen (AVG & EU AI Act).",
    audience: "ICT-dienstverleners en MKB/zorg met privacy-eisen",
    deployment: "self-hosted",
    salesComplexity: "gemiddeld",
    timeToMrr: "3–6 weken",
    priceLabel: "eenmalig € 2.500 setup + € 149 – € 499 / maand beheer",
    why: [
      "Frictieloze deploy-recepten: Caddy auto-TLS, eigen LLM-node, Redis fail-open, code-server, one-command installer.",
      "Draait op een goedkope VPS en overleeft reboot/crash vanzelf.",
      "Veel MKB-softwarehuizen zoeken precies deze soevereine fundering voor hun eigen AI-apps.",
    ],
    features: [
      "One-command installer op een verse VPS",
      "Caddy reverse-proxy met automatische HTTPS",
      "Eigen taal- en beeldmodel (Ollama + Stable Diffusion), geen vendor-credits",
      "Redis fail-open, health-watchdog en back-ups",
      "Ingebouwde terminal + web-based VS Code",
    ],
    reused: ["deploy/-recepten", "Caddyfile + docker-compose.vps.yml", "KV-config", "health-watchdog", "terminal & code-server"],
    ctaLabel: "SovereignOps aanvragen",
  },
  {
    slug: "flexcompliance-api",
    name: "FlexCompliance API",
    kicker: "StiPP & ABU-fase engine as a service",
    tagline: "De lastige NL uitzend-compliance als micro-API — stop met het wiel heruitvinden.",
    concept:
      "Een specialistische API voor HR-software-ontwikkelaars, salarisadministratiekantoren en SaaS-bouwers: StiPP-pensioenaangiftes, de ABU/NBBU-faseketen en WDBA-beoordeling, kant-en-klaar.",
    audience: "HR-software-ontwikkelaars en salarisbureaus",
    deployment: "api",
    salesComplexity: "gemiddeld",
    timeToMrr: "1–2 maanden",
    priceLabel: "€ 0,05 – € 0,20 per verwerkte loonstrook/aangifte · minimaal € 149 / maand",
    why: [
      "NL uitzendwetgeving (StiPP, ABU/NBBU-faseketen, WDBA) is berucht ingewikkeld.",
      "Ontwikkelaars heruitvinden dit wiel liever niet zelf.",
      "De domeinlogica zit al in de bestaande API-routes en datamodellen.",
    ],
    features: [
      "StiPP-pensioenaangifte (maandelijkse UPA) via API",
      "ABU/NBBU-fasebewaking per uitzendkracht",
      "WDBA-beoordeling en KOR/btw-logica",
      "ZW-ziekmeldingen en volledig auditspoor",
      "Usage-based facturatie, OpenAPI-spec en webhooks",
    ],
    reused: ["StiPP-exportmodules", "ABU-fasenbewaking", "ZW-ziekmeldingen", "auditspoor", "public API (v1)"],
    ctaLabel: "API-toegang aanvragen",
  },
];

export const FLAGSHIP: Product = {
  slug: "zekerflex-platform",
  name: "ZekerFlex All-in-One",
  kicker: "Het complete flex-/uitzendplatform",
  tagline: "De hele motor onder één dak — voor bureaus die het complete pakket zoeken.",
  concept:
    "Het overkoepelende platform: marktplaats, AI-recruiter, matching, uren → facturen, uitzend (ABU/StiPP), bank en webshop. Als white-label onder je eigen merk, of volledig self-hosted.",
  audience: "Nieuwe of overstappende flex-/uitzendbureaus",
  deployment: "platform",
  salesComplexity: "hoog",
  timeToMrr: "2–4 maanden",
  priceLabel: "vanaf € 499 / maand (white-label) · self-hosted op aanvraag",
  why: [
    "Eén uitontwikkelde keten van vacature tot uitbetaling.",
    "White-label onder eigen merk, of soeverein op eigen infra.",
    "AI op eigen modellen — geen kosten per intake of beeld.",
  ],
  features: [
    "Marktplaats + automatische matching",
    "AI-recruiter, uren → facturen, uitzend (ABU/StiPP)",
    "ZekerFlex Bank, webshop en betalingen",
    "Eigen merk, kleuren en subdomein",
  ],
  reused: ["het volledige platform"],
  ctaLabel: "Demo of pilot aanvragen",
  flagship: true,
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
