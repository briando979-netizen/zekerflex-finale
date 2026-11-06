// ---------------------------------------------------------------------------
// "Alles gratis": één lijst van alle diensten van buiten waar ZekerFlex nog
// van afhankelijk is, met per dienst ons eigen alternatief.
//
// Dit bestand is puur (geen prisma, geen env, geen kv) zodat ook een
// client-component het mag inlezen. De stand per dienst (staat er een sleutel,
// gebruiken we het nu echt) komt uit lib/gratis/status.ts — die leest alleen
// óf er een sleutel staat, nooit de waarde zelf.
// ---------------------------------------------------------------------------

export type GratisStatus =
  /** draait al op onze eigen server of is gewoon gratis */
  | "gratis"
  /** kan nu met één knop naar onze eigen server */
  | "schakelbaar"
  /** eigen alternatief is nog te bouwen */
  | "bouwen"
  /** kan niet zonder: hier blijft een derde partij nodig */
  | "nodig";

export interface GratisDienst {
  id: string;
  naam: string;
  /** waar het platform het voor gebruikt */
  waarvoor: string;
  /** wat we er nu voor gebruiken */
  nu: string;
  /** wat ons eigen, gratis alternatief is (of waarom het niet kan) */
  eigen: string;
  status: GratisStatus;
  /** omgevingssleutels die erbij horen — alleen de namen, nooit de waarden */
  env?: string[];
}

export const GRATIS_STATUS_LABEL: Record<GratisStatus, string> = {
  gratis: "Al gratis",
  schakelbaar: "Nu om te zetten",
  bouwen: "Zelf te bouwen",
  nodig: "Blijft nodig",
};

/** Kleur per stand, in de betekenis van de beheerkit: groen doen, blauw gepland, amber wacht op jou. */
export const GRATIS_STATUS_TINT: Record<GratisStatus, "ok" | "plan" | "warn" | "neutral"> = {
  gratis: "ok",
  schakelbaar: "plan",
  bouwen: "warn",
  nodig: "neutral",
};

export const GRATIS_DIENSTEN: GratisDienst[] = [
  {
    id: "ai",
    naam: "AI-taalmodel",
    waarvoor: "Alle AI: chat, samenvatten, vertalen, beoordelen, teksten schrijven",
    nu: "Gemini van Google, per gebruik afgerekend",
    eigen: "Ons eigen model op de VPS (Ollama). Zet de knop hierboven aan en élke AI-taak draait gratis op onze eigen server.",
    status: "schakelbaar",
    env: ["LLM_BASE_URL", "LLM_API_KEY", "AI_ALLOW_REMOTE"],
  },
  {
    id: "embeddings",
    naam: "Vectoren voor zoeken",
    waarvoor: "De kennisbank en het zoeken in eigen teksten (RAG)",
    nu: "nomic-embed-text op onze eigen server",
    eigen: "Draait al bij ons; kost niets.",
    status: "gratis",
    env: ["LLM_EMBED_BASE_URL", "LLM_EMBED_MODEL"],
  },
  {
    id: "kaart",
    naam: "Kaart en kaarttegels",
    waarvoor: "De ZekerFlex Kaart, open diensten en de 3D-kaart",
    nu: "Eigen tegels (PMTiles) met openbare gegevens van PDOK",
    eigen: "Draait al bij ons; kost niets en er gaat geen bezoeker naar een derde partij.",
    status: "gratis",
  },
  {
    id: "reistijd",
    naam: "Reistijd en afstand",
    waarvoor: "Matchen op reisafstand en de reistijd bij een klus",
    nu: "Google Distance Matrix, per opvraging afgerekend",
    eigen: "Eigen rekenregel op coördinaten (afstand over de weg + gemiddelde snelheid per soort rit); later een eigen routeserver op de VPS.",
    status: "bouwen",
    env: ["GOOGLE_MAPS_API_KEY"],
  },
  {
    id: "geocoderen",
    naam: "Adres naar coördinaten",
    waarvoor: "Een klus of bedrijf op de kaart zetten",
    nu: "Deels Google, deels PDOK",
    eigen: "PDOK Locatieserver: openbaar, gratis en Nederlands.",
    status: "bouwen",
    env: ["GOOGLE_MAPS_API_KEY"],
  },
  {
    id: "stem",
    naam: "Tekst naar spraak",
    waarvoor: "De AI-beller en teksten laten voorlezen",
    nu: "Google Text-to-Speech, per teken afgerekend",
    eigen: "Piper op onze eigen server: een Nederlandse stem, kost niets per keer.",
    status: "bouwen",
    env: ["GOOGLE_TTS_API_KEY"],
  },
  {
    id: "bedrijven",
    naam: "Bedrijven opzoeken",
    waarvoor: "De review-scan en het vinden van bedrijven voor de buitendienst",
    nu: "Google Places, per opvraging afgerekend",
    eigen: "OpenStreetMap (Overpass) voor de vindplaats plus het openbare KVK-register; reviews blijven van Google komen, want die staan alleen daar.",
    status: "bouwen",
    env: ["GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY"],
  },
  {
    id: "meldingen",
    naam: "Meldingen op de telefoon",
    waarvoor: "Push naar werkers, werkgevers en beheer",
    nu: "Web Push met onze eigen sleutels (VAPID)",
    eigen: "Draait al bij ons; kost niets.",
    status: "gratis",
    env: ["VAPID_PUBLIC_KEY"],
  },
  {
    id: "bellen",
    naam: "Bellen en sms",
    waarvoor: "De AI-beller, spoedoproepen per sms, zakelijke nummers",
    nu: "Twilio, per minuut en per bericht",
    eigen: "Een eigen telefooncentrale (SIP) op de VPS kan het gesprek zelf doen, maar een nummer en een lijn naar het telefoonnet moet je altijd bij een aanbieder huren. Goedkoper kan wel, gratis niet.",
    status: "nodig",
    env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  },
  {
    id: "mail",
    naam: "Mail versturen",
    waarvoor: "Alle mail van het platform",
    nu: "Eigen postbus bij TransIP (in het pakket inbegrepen)",
    eigen: "Zit al bij de server in; kost niets extra.",
    status: "gratis",
    env: ["SMTP_HOST"],
  },
  {
    id: "betalen",
    naam: "Betalen en uitbetalen",
    waarvoor: "Afrekenen, uitbetalen, incasso, kaarten",
    nu: "Stripe, een percentage per transactie",
    eigen: "Geld aannemen mag je niet zelf doen zonder vergunning. Dit blijft bij een betaaldienst; wel kunnen we de kosten drukken door meer via incasso en iDEAL te laten lopen.",
    status: "nodig",
    env: ["STRIPE_SECRET_KEY"],
  },
  {
    id: "domeinen",
    naam: "Domeinnamen",
    waarvoor: "Domeinen zoeken, vastleggen en verlengen voor klanten",
    nu: "TransIP-API; de domeinnaam zelf is inkoop",
    eigen: "De inkoopprijs van een domein is een echte kostenpost die we doorberekenen (inkoop + 15%). De koppeling zelf kost niets.",
    status: "nodig",
    env: ["TRANSIP_LOGIN", "TRANSIP_PRIVATE_KEY"],
  },
  {
    id: "rapportages",
    naam: "Rapportages (BI)",
    waarvoor: "Admin → Rapportages en de grafieken voor werkgevers",
    nu: "Metabase op onze eigen server",
    eigen: "Draait al bij ons; kost niets.",
    status: "gratis",
    env: ["METABASE_URL"],
  },
  {
    id: "foutmeldingen",
    naam: "Foutmeldingen en snelheid",
    waarvoor: "Het foutenlogboek en de prestatiemeting",
    nu: "GlitchTip op onze eigen server",
    eigen: "Draait al bij ons; kost niets.",
    status: "gratis",
    env: ["GLITCHTIP_DSN"],
  },
  {
    id: "beveiliging",
    naam: "Aanvallen tegenhouden",
    waarvoor: "De muur voor de website (WAF) en het blokkeren van misbruik",
    nu: "CrowdSec op onze eigen server",
    eigen: "Draait al bij ons; kost niets.",
    status: "gratis",
  },
  {
    id: "lettertypes",
    naam: "Lettertypes",
    waarvoor: "Alle tekst op de site en in de app",
    nu: "Zelf gehost in public/fonts",
    eigen: "De build haalt niets meer bij Google; kost niets en is sneller.",
    status: "gratis",
  },
];

/** Hoeveel diensten per stand — voor de tegels bovenaan. */
export function gratisTelling(diensten: GratisDienst[] = GRATIS_DIENSTEN): Record<GratisStatus, number> {
  const t: Record<GratisStatus, number> = { gratis: 0, schakelbaar: 0, bouwen: 0, nodig: 0 };
  for (const d of diensten) t[d.status] += 1;
  return t;
}
