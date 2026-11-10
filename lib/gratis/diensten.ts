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
    nu: "Gemini van Google: tot een bepaald aantal vragen per dag gratis, daarboven per gebruik afgerekend",
    eigen: "Ons eigen model op de VPS (Ollama, gemma3:4b) staat al als reserve klaar: valt de aanbieder weg of geeft hij een foutcode, dan antwoordt onze server vanzelf. Met de knop hierboven gaat álles erheen. Gemeten op 7 november: 3 à 5 seconden per kort antwoord, rekent en vertaalt goed; voor lange teksten voor klanten blijft een groot model sterker.",
    status: "schakelbaar",
    env: ["LLM_BASE_URL", "LLM_API_KEY", "AI_ALLOW_REMOTE", "LLM_FALLBACK_BASE_URL"],
  },
  {
    id: "embeddings",
    naam: "Vectoren voor zoeken",
    waarvoor: "De kennisbank en het zoeken in eigen teksten (RAG)",
    nu: "granite-embedding op onze eigen server (meertalig; vond op 7 november 12 van 16 Nederlandse vragen terug, het vorige model 6)",
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
    nu: "Onze eigen rekenregel (ingesteld bij 'Per dienst kiezen'); Google Distance Matrix alleen nog als je dat zelf terugzet.",
    eigen: "Afstand over de weg uit de coördinaten, met een snelheid die meegroeit met de rit en opstapminuten. Zo'n 10 tot 20% naast Google — ruim genoeg om op reisafstand te matchen, en er gaat geen adres naar buiten.",
    status: "gratis",
    env: ["GOOGLE_MAPS_API_KEY"],
  },
  {
    id: "geocoderen",
    naam: "Adres naar coördinaten",
    waarvoor: "Het adres bij een vestiging of klus invullen en op de kaart zetten, en de thuisbasis van een werker",
    nu: "PDOK Locatieserver voor Nederland, OpenStreetMap (Nominatim) voor een thuisbasis in het buitenland: allebei openbaar en gratis — er is hier nooit een Google-sleutel voor gebruikt",
    eigen: "Dit is al van ons: het zoeken zit in lib/geo/pdok.ts (met time-out en een kleine cache) en loopt via /api/geo/search onder het adresveld. Een thuisbasis in het buitenland zoekt lib/geo/thuisbasis.ts op bij OpenStreetMap (alleen postcode, plaats en land; een aanvraag per seconde). Vindt die niets, dan krijgt de werker een eerlijke melding, nooit het midden van Nederland.",
    status: "gratis",
  },
  {
    id: "stem",
    naam: "Tekst naar spraak",
    waarvoor: "De AI-beller, de AI-console en de stem onder een video",
    nu: "Piper op onze eigen server (Nederlandse stem, draait sinds 6 november); Google Text-to-Speech alleen nog als je dat zelf terugzet",
    eigen: "Piper in een eigen container, model nl_BE-nathalie-medium. Kost niets per keer, de tekst verlaat onze server niet en het geheugen blijft onder de 250 MB.",
    status: "gratis",
    env: ["GOOGLE_TTS_API_KEY"],
  },
  {
    id: "bedrijven",
    naam: "Bedrijven opzoeken",
    waarvoor: "De review-scan en het vinden van bedrijven voor de buitendienst",
    nu: "Buitendienst: onze eigen OpenStreetMap-bron, zowel voor het vinden van bedrijven als voor telefoon en website. Review-scan: nog Google, want alleen daar staan de sterren.",
    eigen: "OpenStreetMap (Nominatim en Overpass) geeft naam, adres, telefoon en website — minder bedrijven dan Google, maar kost niets. Beoordelingen blijven van Google komen; onze eigen bron verzint nooit een cijfer.",
    status: "gratis",
    env: ["GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY"],
  },
  {
    id: "handelsregister",
    naam: "Handelsregister (KVK-gegevens)",
    waarvoor: "Het KVK-nummer van een werkgever controleren; vroeger ook bedrijven zoeken voor de buitendienst",
    nu: "Bedrijf zoeken bij het aanmelden: eerst onze eigen bedrijvenindex (elk bedrijf dat we ooit vonden, ook uit KVKBase, bestaande organisaties en leads), daarna KVKBase zolang er tegoed is, en op verzoek OpenStreetMap voor naam en adres. Controleren van een KVK-nummer gaat nog bij KVKBase, met een tegoed per opvraging.",
    eigen: "Zoeken en invullen kost niets meer: de eigen index groeit met elk antwoord en vraagt KVKBase alleen nog bij een onbekende naam (keuze hieronder, 10 minuten rust na een limiet). Een KVK-inschrijving controleren kan alleen bij het register zelf; dat is nergens gratis. Eerlijk: een bedrijf dat nooit eerder voorbijkwam, vindt de index pas als KVKBase of de bezoeker het aanlevert; OpenStreetMap kent geen KVK-nummers. Btw-nummers controleren doen we al gratis bij de Europese VIES-dienst.",
    status: "nodig",
    env: ["KVKBASE_API_KEY"],
  },
  {
    id: "beeld",
    naam: "Foto's en beelden maken",
    waarvoor: "De marketingkit, foto's in de Studio en beeld onder een video",
    nu: "Staat uit tot er een beeldmodel aan hangt; Gemini kan het pas op een betaald niveau",
    eigen: "Stable Diffusion draait gratis op onze eigen hardware (lib/ai/images.ts praat al met een eigen beeldserver via IMAGE_BASE_URL). De VPS heeft geen videokaart, dus dit vraagt een machine met een GPU — of geduld: op de processor duurt één plaatje minuten.",
    status: "bouwen",
    env: ["IMAGE_BASE_URL", "IMAGE_API_KEY"],
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
  {
    id: "code",
    naam: "Code bewaren",
    waarvoor: "De broncode van ZekerFlex; de server haalt er bij elke uitrol de code op",
    nu: "GitHub: code bewaren is gratis. GitHub Actions (het enige wat geld kost) staat sinds 10 november helemaal uit, dus er komt geen rekening meer.",
    eigen: "Forgejo op onze eigen server (git.37-97-226-24.sslip.io): een eigen GitHub, gratis en open source. Een kopie die elke 10 minuten bijwerkt. Valt GitHub weg, dan halen de live-zetter en de controle de code daar op en gaat de uitrol gewoon door. Zolang GitHub er is, blijft dat de bron van wat live gaat.",
    status: "gratis",
  },
];

/** Hoeveel diensten per stand — voor de tegels bovenaan. */
export function gratisTelling(diensten: GratisDienst[] = GRATIS_DIENSTEN): Record<GratisStatus, number> {
  const t: Record<GratisStatus, number> = { gratis: 0, schakelbaar: 0, bouwen: 0, nodig: 0 };
  for (const d of diensten) t[d.status] += 1;
  return t;
}
