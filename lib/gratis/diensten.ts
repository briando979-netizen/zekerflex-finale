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
  /** externe hosts die de code van deze dienst aanroept (tests/gratis-dekking.test.ts bewaakt dat elke externe host hier of op de basislijn staat) */
  hosts?: string[];
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
    hosts: ["generativelanguage.googleapis.com"],
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
    hosts: ["service.pdok.nl"],
    naam: "Kaart en kaarttegels",
    waarvoor: "De ZekerFlex Kaart, open diensten en de 3D-kaart",
    nu: "Eigen tegels (PMTiles) met openbare gegevens van PDOK",
    eigen: "Draait al bij ons; kost niets en er gaat geen bezoeker naar een derde partij.",
    status: "gratis",
  },
  {
    id: "reistijd",
    hosts: ["maps.googleapis.com"],
    naam: "Reistijd en afstand",
    waarvoor: "Matchen op reisafstand en de reistijd bij een klus",
    nu: "Eerst onze eigen routeplanner (echte route over de weg voor auto, fiets en lopen), anders onze eigen rekenregel (ingesteld bij 'Per dienst kiezen'); Google Distance Matrix alleen nog als je dat zelf terugzet.",
    eigen: "De routeplanner hieronder rekent de echte route uit. Voor het OV, en als de routeplanner er even niet is, rekenen we het zelf uit: afstand over de weg uit de coördinaten, met een snelheid die meegroeit met de rit en opstapminuten. Zo'n 10 tot 20% naast Google — ruim genoeg om op reisafstand te matchen, en er gaat geen adres naar buiten.",
    status: "gratis",
    env: ["GOOGLE_MAPS_API_KEY"],
  },
  {
    id: "routeplanner",
    naam: "Routeplanner",
    waarvoor: "De route met afslagen op ZekerFlex Kaart, de route van huis naar een klus en de reistijd in de matching",
    nu: "Valhalla op onze eigen server, met de wegen van Nederland uit OpenStreetMap (bestand van Geofabrik, bijwerken met deploy/route/haal-route.sh)",
    eigen: "Draait bij ons (dienst routes): auto, fiets en lopen, met de afslagen in het Nederlands. Kost niets per route en er gaat geen adres naar buiten. Is hij er even niet (nog geen wegen gebouwd, herstart), dan rekenen we de reistijd zelf uit en zegt de kaart dat de routeplanner even niet beschikbaar is.",
    status: "gratis",
    env: ["ROUTE_BASE_URL"],
  },
  {
    id: "geocoderen",
    hosts: ["api.pdok.nl", "nominatim.openstreetmap.org"],
    naam: "Adres naar coördinaten",
    waarvoor: "Het adres bij een vestiging of klus invullen en op de kaart zetten, en de thuisbasis van een werker",
    nu: "PDOK Locatieserver voor Nederland, OpenStreetMap (Nominatim) voor een thuisbasis in het buitenland: allebei openbaar en gratis — er is hier nooit een Google-sleutel voor gebruikt",
    eigen: "Dit is al van ons: het zoeken zit in lib/geo/pdok.ts (met time-out en een kleine cache) en loopt via /api/geo/search onder het adresveld. Een thuisbasis in het buitenland zoekt lib/geo/thuisbasis.ts op bij OpenStreetMap (alleen postcode, plaats en land; een aanvraag per seconde). Vindt die niets, dan krijgt de werker een eerlijke melding, nooit het midden van Nederland.",
    status: "gratis",
  },
  {
    id: "stem",
    hosts: ["texttospeech.googleapis.com"],
    naam: "Tekst naar spraak",
    waarvoor: "De AI-beller, de AI-console en de stem onder een video",
    nu: "Piper op onze eigen server (Nederlandse stem, draait sinds 6 november); Google Text-to-Speech alleen nog als je dat zelf terugzet",
    eigen: "Piper in een eigen container, model nl_BE-nathalie-medium. Kost niets per keer, de tekst verlaat onze server niet en het geheugen blijft onder de 250 MB.",
    status: "gratis",
    env: ["GOOGLE_TTS_API_KEY"],
  },
  {
    id: "bedrijven",
    hosts: ["places.googleapis.com", "overpass-api.de", "nominatim.openstreetmap.org"],
    naam: "Bedrijven opzoeken",
    waarvoor: "De review-scan en het vinden van bedrijven voor de buitendienst",
    nu: "Buitendienst: onze eigen OpenStreetMap-bron, zowel voor het vinden van bedrijven als voor telefoon en website. Review-scan: nog Google, want alleen daar staan de sterren.",
    eigen: "OpenStreetMap (Nominatim en Overpass) geeft naam, adres, telefoon en website — minder bedrijven dan Google, maar kost niets. Beoordelingen blijven van Google komen; onze eigen bron verzint nooit een cijfer.",
    status: "gratis",
    env: ["GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY"],
  },
  {
    id: "handelsregister",
    hosts: ["api.kvkbase.nl"],
    naam: "Handelsregister (KVK-gegevens)",
    waarvoor: "Het KVK-nummer van een werkgever controleren; vroeger ook bedrijven zoeken voor de buitendienst",
    nu: "Bedrijf zoeken bij het aanmelden: eerst onze eigen bedrijvenindex (elk bedrijf dat we ooit vonden, ook uit KVKBase, bestaande organisaties en leads), daarna KVKBase zolang er tegoed is, en op verzoek OpenStreetMap voor naam en adres. Controleren van een KVK-nummer gaat nog bij KVKBase, met een tegoed per opvraging: elk antwoord bewaren we 30 dagen, en is het tegoed op, dan wacht de controle en probeert een cron het later opnieuw. Zoeken voor de buitendienst en de nachtelijke KVK-meting gebruiken het tegoed alleen ruim boven een reserve voor die controles.",
    eigen: "Zoeken en invullen kost niets meer: de eigen index groeit met elk antwoord en vraagt KVKBase alleen nog bij een onbekende naam (keuze hieronder, 10 minuten rust na een limiet). Een KVK-inschrijving controleren kan alleen bij het register zelf; dat is nergens gratis. Eerlijk: een bedrijf dat nooit eerder voorbijkwam, vindt de index pas als KVKBase of de bezoeker het aanlevert; OpenStreetMap kent geen KVK-nummers. Btw-nummers controleren doen we al gratis bij de Europese VIES-dienst.",
    status: "nodig",
    env: ["KVKBASE_API_KEY"],
  },
  {
    id: "beeld",
    hosts: ["api.cloudflare.com"],
    naam: "Foto's en beelden maken",
    waarvoor: "De marketingkit, foto's in de Studio en beeld onder een video",
    nu: "Staat uit tot er een beeldmodel aan hangt; Gemini kan het pas op een betaald niveau",
    eigen: "Stable Diffusion draait gratis op onze eigen hardware (lib/ai/images.ts praat al met een eigen beeldserver via IMAGE_BASE_URL). De VPS heeft geen videokaart, dus dit vraagt een machine met een GPU — of geduld: op de processor duurt één plaatje minuten.",
    status: "bouwen",
    env: ["IMAGE_BASE_URL", "IMAGE_API_KEY"],
  },
  {
    id: "gezicht",
    naam: "Gezichtsvergelijking bij de ID-controle",
    waarvoor: "De pasfoto op het document tegen de selfie, bij het verifiëren van een werker (lib/kyc/gezicht)",
    nu: "Draait in de app zelf, op de processor van onze server; er gaat geen foto naar een andere partij",
    eigen: "Twee open modellen van OpenCV Zoo: YuNet (MIT) vindt het gezicht, SFace (Apache 2.0) vergelijkt. Samen 39 MB, met een vaste hash. Eenmalig op de server zetten met deploy/scripts/gezichtsmodellen-ophalen.sh; zonder dat haalt de app ze bij het eerste gebruik zelf van github.com/opencv/opencv_zoo. Kost niets.",
    status: "gratis",
    env: ["GEZICHT_DATA_DIR"],
  },
  {
    id: "meldingen",
    hosts: ["api.push.apple.com", "api.sandbox.push.apple.com"],
    naam: "Meldingen op de telefoon",
    waarvoor: "Push naar werkers, werkgevers en beheer",
    nu: "Web Push met onze eigen sleutels (VAPID)",
    eigen: "Draait al bij ons; kost niets.",
    status: "gratis",
    env: ["VAPID_PUBLIC_KEY"],
  },
  {
    id: "bellen",
    hosts: ["api.twilio.com"],
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
    id: "sociale-media",
    hosts: ["graph.facebook.com"],
    naam: "Facebook en Instagram (Meta)",
    waarvoor: "Goedgekeurde berichten van Sociale media (Admin → Sales & groei) zelf plaatsen op de eigen Facebook-pagina en het eigen Instagram-account",
    nu: "De Meta Graph API met een paginatoken van onszelf (app in ontwikkelmodus, geen goedkeuring en geen kosten voor de eigen pagina). Het token staat versleuteld in de database; zonder token niets, dan staat de tekst klaar voor een mens.",
    eigen: "Er is niets te vervangen en niets dat geld kost: zonder koppeling plaatst een mens het bericht zelf met de knoppen bij het bericht. LinkedIn, TikTok, YouTube, X en Google staan er bewust niet in: die gaan altijd met de hand (hun koppeling vraagt een eigen goedkeuring of betaling).",
    status: "gratis",
  },
  {
    id: "betalen",
    hosts: ["api.stripe.com", "js.stripe.com"],
    naam: "Betalen en uitbetalen",
    waarvoor: "Afrekenen, uitbetalen, incasso, kaarten",
    nu: "Stripe, een percentage per transactie",
    eigen: "Geld aannemen mag je niet zelf doen zonder vergunning. Dit blijft bij een betaaldienst; wel kunnen we de kosten drukken door meer via incasso en iDEAL te laten lopen.",
    status: "nodig",
    env: ["STRIPE_SECRET_KEY"],
  },
  {
    id: "domeinen",
    hosts: ["api.transip.nl", "rdap.sidn.nl", "rdap.verisign.com", "rdap.centralnic.com", "rdap.gmoregistry.net", "rdap.identitydigital.services", "rdap.nic.amsterdam", "rdap.publicinterestregistry.org", "rdap.radix.host", "pubapi.registry.google"],
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
    hosts: ["api.github.com"],
    naam: "Code bewaren",
    waarvoor: "De broncode van ZekerFlex; de server haalt er bij elke uitrol de code op",
    nu: "GitHub: code bewaren is gratis. GitHub Actions (het enige wat geld kost) staat sinds 10 november helemaal uit, dus er komt geen rekening meer.",
    eigen: "Forgejo op onze eigen server (git.37-97-226-24.sslip.io): een eigen GitHub, gratis en open source. Een kopie die elke 10 minuten bijwerkt. Valt GitHub weg, dan halen de live-zetter en de controle de code daar op en gaat de uitrol gewoon door. Zolang GitHub er is, blijft dat de bron van wat live gaat.",
    status: "gratis",
  },
  {
    id: "play",
    naam: "Google Play (de app publiceren)",
    waarvoor: "De Android-app in Google Play zetten en bijwerken vanuit Admin",
    nu: "De Google Play Developer API met een serviceaccount van onszelf",
    eigen: "Een eigen app-winkel bestaat niet voor Android. Zonder koppeling uploadt een mens de app met de hand in de Play Console; de website en de rest van het platform blijven werken.",
    status: "nodig",
    hosts: ["androidpublisher.googleapis.com"],
  },
  {
    id: "dns-aanbieders",
    naam: "DNS bij Cloudflare of Hetzner (klantdomeinen)",
    waarvoor: "Records voor een klantdomein zetten als de klant zijn DNS daar heeft staan",
    nu: "De API van Cloudflare of Hetzner DNS, met het token van de klant zelf",
    eigen: "Laat de klant zijn domein bij ons (TransIP) onderbrengen: dan zetten we de records zelf. Staat zijn DNS elders, dan blijft zijn eigen token nodig; dat kunnen we niet voor hem oplossen.",
    status: "nodig",
    hosts: ["api.cloudflare.com", "dns.hetzner.com"],
  },
  {
    id: "video",
    naam: "Video maken uit een foto",
    waarvoor: "Korte video's maken in de Studio",
    nu: "Een gratis openbare videogenerator van Lightricks (LTX) op Hugging Face, met een daglimiet",
    eigen: "Nog niet: een eigen videogenerator vraagt een machine met een videokaart (de VPS heeft er geen). Is de gratis bron vol of weg, dan geeft de Studio een Nederlandse foutmelding en maakt hij geen video.",
    status: "bouwen",
    env: ["VIDEO_GRADIO_URL"],
    hosts: ["lightricks-ltx-2-3.hf.space"],
  },
  {
    id: "markten",
    naam: "Koersen en cryptomarkt",
    waarvoor: "De marktscan voor de eigenaar: aandelen, grondstoffen en cryptomunten",
    nu: "Openbare gegevens van Yahoo Finance en CoinGecko, zonder sleutel",
    eigen: "Een eigen bron voor koersen kan niet; die komen altijd van een beurs of aggregator. Valt een bron weg, dan wordt alleen die reeks overgeslagen.",
    status: "nodig",
    hosts: ["query1.finance.yahoo.com", "api.coingecko.com"],
  },
  {
    id: "weer",
    naam: "Weer op het kantoorscherm",
    waarvoor: "De weerregel in het beheerscherm (Amsterdam)",
    nu: "Het openbare weerbericht van het Noorse meteorologisch instituut (MET Norway): gratis en zonder sleutel",
    eigen: "Er is niets dat geld kost. Valt de dienst weg, dan blijft de weerregel leeg.",
    status: "gratis",
    hosts: ["api.met.no"],
  },
  {
    id: "wachtwoordcheck",
    naam: "Gelekte wachtwoorden controleren",
    waarvoor: "Bij het kiezen van een wachtwoord nagaan of het in een bekend datalek zit",
    nu: "Have I Been Pwned (Pwned Passwords): gratis, en er gaan alleen de eerste 5 tekens van een afgeleide code naar buiten, nooit het wachtwoord",
    eigen: "Een eigen lijst van gelekte wachtwoorden is te groot en veroudert. De aanroep wacht maximaal 2,5 seconden en geeft dan op.",
    status: "gratis",
    hosts: ["api.pwnedpasswords.com"],
  },
  {
    id: "botcontrole",
    naam: "Bots tegenhouden (captcha)",
    waarvoor: "Aanmeld- en contactformulieren beschermen tegen bots",
    nu: "Naar keuze Cloudflare Turnstile of hCaptcha, of ons eigen werkbewijs (proof of work)",
    eigen: "Het eigen werkbewijs (instelling 'pow') draait volledig bij ons en kost niets. Turnstile en hCaptcha zijn gratis, maar een derde partij; valt die weg, dan gaat aanmelden door onder een strengere limiet per IP (lib/security/captcha.ts).",
    status: "schakelbaar",
    env: ["CAPTCHA_SECRET"],
    hosts: ["challenges.cloudflare.com", "api.hcaptcha.com"],
  },
  {
    id: "zoekmachines",
    naam: "Zoekmachines laten weten wat nieuw is",
    waarvoor: "Bing en andere zoekmachines melden dat een pagina is aangepast (IndexNow)",
    nu: "De gratis IndexNow-dienst",
    eigen: "Zonder de melding vinden zoekmachines hetzelfde via de sitemap, alleen later. Een mislukte melding is geen fout voor de bezoeker.",
    status: "gratis",
    hosts: ["api.indexnow.org"],
  },
  {
    id: "open-data",
    naam: "Open overheidsgegevens",
    waarvoor: "Brandstofprijzen en wet- en regelgeving voor de kennisbank en de rekentools",
    nu: "CBS StatLine, de zoekdienst van repository.overheid.nl en rijksoverheid.nl: openbaar en gratis",
    eigen: "Het zijn openbare bronnen zonder kosten; een eigen bron is niet nodig.",
    status: "gratis",
    hosts: ["opendata.cbs.nl", "repository.overheid.nl", "www.rijksoverheid.nl"],
  },
  {
    id: "id-leverancier",
    naam: "Identiteitscontrole door Didit",
    waarvoor: "Een ID-document en gezicht laten controleren bij het aanmelden van een werker of werkgever",
    nu: "De API van Didit (een externe leverancier, per controle betaald)",
    eigen: "ZekerFlex heeft een eigen ID-controle (lezen van het document, ID-scan, gezichtsvergelijking, chip in de Android-app). Die is nog niet voor elk document volledig, dus Didit blijft een extra bron tot de eigen controle het overneemt.",
    status: "bouwen",
    env: ["DIDIT_API_KEY"],
    hosts: ["verification.didit.me"],
  },
  {
    id: "youtube-plaatje",
    naam: "Voorbeeldplaatje van een YouTube-video",
    waarvoor: "Het plaatje voor een video die pas bij een klik afspeelt",
    nu: "Een keer opgehaald bij YouTube (i.ytimg.com); daarna bewaren we een eigen kopie, zodat een bezoeker niets bij Google laadt",
    eigen: "Draait al zo: de kopie staat op onze eigen schijf.",
    status: "gratis",
    hosts: ["i.ytimg.com"],
  },
  {
    id: "voorbeeldfotos",
    naam: "Foto's voor voorbeeldsites",
    waarvoor: "De foto's op de voorbeeldsites per branche en de demo's",
    nu: "Gratis foto's van Unsplash en Pexels, eenmalig opgehaald bij het maken van een voorbeeldsite",
    eigen: "De foto's komen bij het maken in onze eigen mediaopslag; de gebouwde site toont ze van onszelf. Een eigen fotobank is er niet.",
    status: "gratis",
    hosts: ["images.unsplash.com", "images.pexels.com"],
  },
  {
    id: "ocr-taaldata",
    naam: "Tekstherkenning (taalbestanden)",
    waarvoor: "Tekst lezen uit foto's en documenten (OCR), bijvoorbeeld bonnen",
    nu: "tesseract.js in ons eigen proces, met een eigen kopie van de taalbestanden (Nederlands en Engels) in storage/ocr op het opslagvolume. GitHub is alleen de bron van de eerste download; die gebeurt bij het opstarten op de achtergrond en anders bij het eerste gebruik.",
    eigen: "Draait al van onze eigen kopie: na de eerste download werkt alles zonder netwerk en gaat er nooit een foto naar buiten. Een download komt eerst in een tijdelijk bestand en wordt pas daarna de echte, dus er blijft nooit een half bestand liggen; mislukt hij, dan probeert de volgende aanroep het opnieuw. Is GitHub bij de allereerste keer onbereikbaar, dan lukt tekstherkenning pas als de bestanden er staan.",
    status: "gratis",
    hosts: ["github.com"],
  },
  {
    id: "alpaca-papier",
    naam: "Alpaca (demo-rekening van de AI-trader)",
    waarvoor: "De stand van de AI-trader laten zien in Beheer: vermogen, posities en orders van de demo-rekening (nep-geld)",
    nu: "De papier-omgeving van Alpaca (paper-api.alpaca.markets), gratis. Beheer doet alleen GET: lezen, nooit een order plaatsen. De sleutel staat verzegeld in de opslag.",
    eigen: "Geen eigen alternatief nodig: het is een gratis demo-rekening en de trader zelf draait op de pc van de eigenaar. Zonder sleutel of bij een storing toont Beheer een duidelijke melding en blijft de rest van het platform gewoon werken.",
    status: "gratis",
    hosts: ["paper-api.alpaca.markets"],
  },];

/** Hoeveel diensten per stand — voor de tegels bovenaan. */
export function gratisTelling(diensten: GratisDienst[] = GRATIS_DIENSTEN): Record<GratisStatus, number> {
  const t: Record<GratisStatus, number> = { gratis: 0, schakelbaar: 0, bouwen: 0, nodig: 0 };
  for (const d of diensten) t[d.status] += 1;
  return t;
}
