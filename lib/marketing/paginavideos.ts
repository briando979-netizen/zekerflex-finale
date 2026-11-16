// De korte uitlegvideo's op de openbare pagina's (16 nov 2026, eigenaar: "video's met een echte persoon over alle pagina's gespreid met
// uitleg"): per pagina één video van ±30 seconden met vrije beelden van echte mensen aan het werk (Pexels License, zie
// public/videos/pagina/CREDITS.md), een stuk echt scherm van de pagina en onze eigen stem (Piper). De mensen in beeld praten niet zelf:
// de stem is die van ZekerFlex, en dat staat onder elke video. De tekst die wordt voorgelezen staat er ook als tekst bij.
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
    seconden: 27,
    tekst: [
      "Welkom bij ZekerFlex, het Nederlandse platform voor flexwerk.",
      "Als werker kies je zelf klussen bij jou in de buurt. Je ziet vooraf wat je verdient, je checkt in met je telefoon en je geld komt op je eigen rekening.",
      "Ben je een bedrijf? Plaats een klus, en ZekerFlex stelt passende, geverifieerde krachten voor.",
      "Jij kiest wie je inroostert, en je betaalt alleen voor gewerkte uren.",
      "Maak een gratis account en begin vandaag."
    ],
  },
  "voor-bedrijven": {
    slug: "voor-bedrijven",
    titel: "Personeel inhuren met ZekerFlex",
    samenvatting: "Een klus plaatsen, krachten kiezen en wat het kost.",
    seconden: 28,
    tekst: [
      "Een gat in je rooster, of een drukke periode? Plaats een klus in een paar minuten.",
      "Je stelt de klus samen en ziet meteen wat hij kost. Een account heb je pas nodig als je hem plaatst.",
      "ZekerFlex stelt passende, geverifieerde krachten in de buurt voor. Jij kiest wie je inroostert.",
      "Je betaalt het uurtarief van de kracht plus drie euro vijftig platformkosten per gewerkt uur, zonder abonnement.",
      "En de uren, de facturen en de papieren zijn geregeld."
    ],
  },
  "voor-freelancers": {
    slug: "voor-freelancers",
    titel: "Werken via ZekerFlex",
    samenvatting: "Klussen in de buurt, met of zonder KVK.",
    seconden: 27,
    tekst: [
      "Wil je werken wanneer het jou uitkomt? Met ZekerFlex zie je klussen bij jou in de buurt.",
      "Je ziet vooraf wat je verdient, je checkt in met je telefoon, en je geld komt op je eigen rekening.",
      "Meedoen is gratis, en je bent in een paar minuten klaar. De app is er in vijf talen.",
      "Met of zonder KVK: als zelfstandige, of als uitzendkracht via het ZekerFlex uitzendbureau.",
      "Maak gratis een profiel aan en begin vandaag."
    ],
  },
  "uitzendbureau": {
    slug: "uitzendbureau",
    titel: "Het ZekerFlex uitzendbureau",
    samenvatting: "Werken zonder KVK, met loon, cao en pensioen geregeld.",
    seconden: 21,
    tekst: [
      "Werken zonder KVK? Dan kies je het ZekerFlex uitzendbureau.",
      "Bij een uitzendkracht is ZekerFlex de werkgever. Loon, cao en pensioen zijn geregeld.",
      "Jij kiest je diensten en werkt wanneer het jou uitkomt, met de rechten van een dienstverband.",
      "Hier zie je welke uitzendklussen er open staan, en reageer je direct."
    ],
  },
  "prijzen": {
    slug: "prijzen",
    titel: "Wat kost ZekerFlex?",
    samenvatting: "Geen abonnement: je betaalt per gewerkt uur.",
    seconden: 21,
    tekst: [
      "Wat kost ZekerFlex? Eerlijk en voorspelbaar.",
      "Geen abonnement. Je betaalt alleen voor gewerkte uren, en bij meer uren daalt de platformfee volgens een vaste staffel.",
      "Voor personeel betaal je het uurtarief van de kracht plus drie euro vijftig per gewerkt uur.",
      "Wil je het zelf uitrekenen? Gebruik de gratis rekentools."
    ],
  },
  "horeca": {
    slug: "horeca-personeel",
    titel: "Horecapersoneel inhuren",
    samenvatting: "Bediening, keuken en bar binnen uren in de buurt.",
    seconden: 25,
    tekst: [
      "Uitval, no-shows of een drukke avond in de horeca?",
      "Plaats een klus, en ZekerFlex vindt binnen uren betrouwbare bedieners, afwassers, koks, barpersoneel en runners in de buurt.",
      "Je betaalt het uurtarief van de kracht plus drie euro vijftig per gewerkt uur, zonder uitzendmarge en zonder abonnement.",
      "Krachten die goed bevallen zet je bij je favorieten, en je roostert ze met één tik opnieuw in."
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

export const paginaVideo = (id: string): PaginaVideo | undefined => (Object.hasOwn(PAGINA_VIDEOS, id) ? PAGINA_VIDEOS[id] : undefined);

export const videoPad = (v: Pick<PaginaVideo, "slug">): string => `/videos/pagina/${v.slug}.mp4`;
export const posterPad = (v: Pick<PaginaVideo, "slug">): string => `/videos/pagina/${v.slug}.jpg`;

/** "35 seconden" of "1 minuut". */
export const duurTekst = (s: number): string => (s >= 90 ? `${Math.round(s / 60)} minuten` : `${s} seconden`);
