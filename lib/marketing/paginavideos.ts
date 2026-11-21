// De korte uitlegvideo's op de openbare pagina's (16 nov 2026, eigenaar: "video's met een echte persoon over alle pagina's gespreid met
// uitleg"): per pagina één video van ±30 seconden met vrije beelden van echte mensen aan het werk (Pexels License, zie
// public/videos/pagina/CREDITS.md), een stuk echt scherm van de pagina en onze eigen stem (Piper). De mensen in beeld praten niet zelf:
// de stem is die van ZekerFlex, en dat staat onder elke video. De tekst die wordt voorgelezen staat er ook als tekst bij.
// Sinds 17 nov 2026 is het beeld van onze eigen campagnefoto's, in de stijl van de reclamevideo's (geen fotobank meer).
// Sinds 21 nov 2026 (eigenaar: "een mooie Nederlandse stem") spreekt een Nederlandse mannenstem (Chatterbox, zelf gedraaid) de
// flexwerkvideo's in, met ware tekst: ZekerFlex is zelf geen uitzendbureau en geen werkgever.
// Puur: geen prisma of kv.

export interface PaginaVideo {
  /** bestandsnaam zonder map en zonder .mp4, in public/videos/pagina/ */
  slug: string;
  titel: string;
  samenvatting: string;
  seconden: number;
  /** wat de stem zegt, zin voor zin */
  tekst: string[];
}

export const PAGINA_VIDEOS: Record<string, PaginaVideo> = {
  "home": {
    slug: "home",
    titel: "ZekerFlex in een halve minuut",
    samenvatting: "Wat ZekerFlex is, voor werkers en voor bedrijven.",
    seconden: 32,
    tekst: [
      "Welkom bij ZekerFlex, het platform voor flexwerk in Nederland.",
      "Als werker kies je zelf klussen bij jou in de buurt, en je ziet vooraf wat je verdient.",
      "Als bedrijf plaats je een klus, en jij kiest wie er voor je werkt.",
      "Bedrijven betalen drie euro vijftig platformkosten per gewerkt uur, zonder abonnement, en de eerste maand is gratis.",
      "Maak een gratis account en begin vandaag."
    ],
  },
  "voor-bedrijven": {
    slug: "voor-bedrijven",
    titel: "Personeel inhuren met ZekerFlex",
    samenvatting: "Een klus plaatsen, kiezen wie er komt en wat het kost.",
    seconden: 38,
    tekst: [
      "Een gat in je rooster? Plaats een klus in een paar minuten.",
      "ZekerFlex stelt passende, betrouwbare krachten in de buurt voor, en jij kiest wie er komt.",
      "Je betaalt het uurtarief plus drie euro vijftig platformkosten per gewerkt uur, zonder abonnement. De eerste maand is gratis.",
      "De kracht checkt in met de QR-code die jij ophangt, jij keurt de uren goed, en ZekerFlex maakt de facturen.",
      "Plaats vandaag nog je eerste klus."
    ],
  },
  "voor-freelancers": {
    slug: "voor-freelancers",
    titel: "Werken via ZekerFlex",
    samenvatting: "Klussen in de buurt, als zzp'er of als uitzendkracht via een aangesloten uitzendbureau.",
    seconden: 34,
    tekst: [
      "Werken wanneer het jou uitkomt? In de app zie je klussen bij jou in de buurt.",
      "Je ziet vooraf wat je verdient, en de app is er in vijf talen.",
      "Als zzp'er stuur je geen facturen, want die maakt ZekerFlex, en je kiest zelf hoe snel je wordt uitbetaald.",
      "Zonder KVK werk je als uitzendkracht, via een aangesloten uitzendbureau.",
      "Maak gratis een profiel aan en begin vandaag."
    ],
  },
  // 21 nov 2026: ZekerFlex is zelf geen uitzendbureau (uitzenden via aangesloten uitzendbureaus); de tekst van elke video zegt dat.
  "uitzendbureau": {
    slug: "uitzendbureau",
    titel: "Uitzendwerk via ZekerFlex",
    samenvatting: "Werken zonder KVK, via een aangesloten uitzendbureau: dat bureau is je werkgever.",
    seconden: 33,
    tekst: [
      "Werken zonder KVK? Dan werk je als uitzendkracht, via een uitzendbureau dat bij ZekerFlex is aangesloten.",
      "Dat uitzendbureau is je werkgever. Het regelt je contract en betaalt je loon, met vakantiegeld en pensioen volgens zijn cao.",
      "ZekerFlex is zelf geen uitzendbureau: in de app vind je de klussen.",
      "Kies in de app bij Type klus voor Uitzendklussen, en vraag bij een klus een uitzendcontract aan."
    ],
  },
  "prijzen": {
    slug: "prijzen",
    titel: "Wat kost ZekerFlex?",
    samenvatting: "Geen abonnement: € 3,50 platformkosten per gewerkt uur, en de eerste maand is gratis.",
    seconden: 31,
    tekst: [
      "Wat kost ZekerFlex? Eerlijk en voorspelbaar.",
      "Je betaalt geen abonnement en geen opstartkosten, alleen voor uren die echt gewerkt zijn.",
      "Bovenop het uurtarief betaal je drie euro vijftig platformkosten per gewerkt uur.",
      "En de eerste maand is gratis: dertig dagen vanaf je eerste dienst.",
      "Reken het zelf uit met de gratis rekentools."
    ],
  },
  "horeca": {
    slug: "horeca-personeel",
    titel: "Horecapersoneel inhuren",
    samenvatting: "Bediening, keuken en bar: plaats een klus en kies wie er komt.",
    seconden: 28,
    tekst: [
      "Uitval, no-shows of een drukke avond in de horeca?",
      "Plaats een klus voor bediening, keuken of bar, en ZekerFlex stelt passende krachten in de buurt voor.",
      "Je betaalt het uurtarief plus drie euro vijftig per gewerkt uur, zonder abonnement, en de eerste maand is gratis.",
      "Krachten die goed bevallen, zet je bij je favorieten. Zo bouw je een vaste ploeg."
    ],
  },
  "rijschool-software": {
    slug: "rijschool-software",
    titel: "Rijschoolsoftware van ZekerFlex",
    samenvatting: "Agenda, tegoed, leskaart en een eigen app voor je leerlingen.",
    seconden: 20,
    tekst: [
      "Rijschoolsoftware die je lessen, leerlingen en betalingen regelt.",
      "Een agenda die niet dubbel boekt, tegoed en betalen altijd in beeld, en een leskaart na elke les.",
      "Je leerlingen hebben een eigen app met de naam en kleuren van jouw rijschool.",
      "Neem je leerlingen over uit een lijst, en begin dezelfde week."
    ],
  },
  "website-maken": {
    slug: "website-maken",
    titel: "Zelf een website of webshop maken",
    samenvatting: "Kies een ontwerp, pas het aan en zet het online.",
    seconden: 19,
    tekst: [
      "Een eigen website of webshop, zonder dat je iets van techniek hoeft te weten.",
      "Kies een ontwerp, pas het aan door te slepen en te typen en zet je website of webshop online.",
      "Een webshop die af is, met bestellingen, klanten en een kassa voor in de winkel.",
      "Bouwen en bekijken is gratis."
    ],
  },
};

/**
 * De paginavideo's in de videokamer /uitleg/videos (21 nov 2026, eigenaar: "alle uitlegvideo's in een aparte ruimte bij Uitleg").
 * Alleen flexwerk. Niet: rijschool-software en website-maken (geen flexwerk). Uitzendbureau en voor-freelancers staan er sinds ze
 * opnieuw zijn ingesproken (21 nov 2026) ook in.
 */
export const VIDEOKAMER: readonly string[] = ["home", "voor-freelancers", "uitzendbureau", "voor-bedrijven", "prijzen", "horeca"];

export const paginaVideo = (id: string): PaginaVideo | undefined => (Object.hasOwn(PAGINA_VIDEOS, id) ? PAGINA_VIDEOS[id] : undefined);

export const videoPad = (v: Pick<PaginaVideo, "slug">): string => `/videos/pagina/${v.slug}.mp4`;
export const posterPad = (v: Pick<PaginaVideo, "slug">): string => `/videos/pagina/${v.slug}.jpg`;

/** "35 seconden" of "1 minuut". */
export const duurTekst = (s: number): string => (s >= 90 ? `${Math.round(s / 60)} minuten` : `${s} seconden`);
