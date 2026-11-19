// ---------------------------------------------------------------------------
// De brede voorpagina (19 nov 2026, eigenaar: "omtover de homepage naar wat wij
// kunnen / wat wij bouwen / wat je kan doen"). Eén frisse, conversationele
// instap die vraagt wat je zoekt en je naar de juiste pagina stuurt, plus een
// overzicht van alles wat ZekerFlex doet. Hier staan de teksten en de
// routering, zodat de pagina alleen opmaak is.
//
// Puur bestand: geen prisma/kv/mail/zod, dus ook bruikbaar in de client-balk
// (components/marketing/HomeZoekBalk.tsx). Alles is waar en nu te doen: geen
// verzonnen cijfers, geen prijzen, geen "binnenkort". Alle links zijn intern.
// ---------------------------------------------------------------------------

/** Een pictogram voor de capability-tegels; de pagina tekent het zelf. */
export type HomeIcoon = "mensen" | "web" | "winkel" | "app" | "branche" | "ai";

/**
 * De conversationele instap: wat iemand typt → waar hij heen gaat, met het label
 * van de knop die we eronder tonen. De eerste regel die past wint, dus de meest
 * specifieke bovenaan. Zonder match gaat hij naar het hele aanbod.
 *
 * De zoekbalk is een échte, antwoordende assistent (hij praat met /api/chat).
 * Deze trefwoord-routering is de snelle, altijd-werkende laag eronder: hij kiest
 * meteen de juiste doorklik-knop en vangt het op als de AI even niet antwoordt.
 */
export interface ZoekIntentie {
  woorden: string[];
  href: string;
  /** het label op de doorklik-knop onder het antwoord ("Werk zoeken", …) */
  knop: string;
}

export const ZOEK_INTENTIES: ZoekIntentie[] = [
  { woorden: ["personeel", "inhuren", "medewerker", "uitzendkracht", "uitzend", "invaller", "spoed", "rooster", "flexkracht", "mensen nodig", "ober", "kok", "magazijnmedewerker"], href: "/voor-bedrijven", knop: "Personeel inhuren" },
  { woorden: ["werk", "baan", "klus", "bijbaan", "bijverdienen", "zzp", "freelance", "flexwerk", "solliciteer", "vacature", "dienst", "verdienen"], href: "/flexwerk", knop: "Werk zoeken" },
  { woorden: ["webshop", "webwinkel", "online verkopen", "verkopen online", "producten verkopen"], href: "/aanbod/webshop", knop: "Webshop openen" },
  { woorden: ["website", "site", "webpagina", "homepage", "internetpagina", "landingspagina"], href: "/website-maken", knop: "Website laten maken" },
  { woorden: ["spel", "spelletje", "game", "talkaro", "flikflak"], href: "/apps-en-spelletjes", knop: "Apps & spelletjes" },
  { woorden: ["app"], href: "/website-maken", knop: "App laten bouwen" },
  { woorden: ["horeca", "restaurant", "cafe", "café", "kassa", "reserveren", "menukaart", "bestellen"], href: "/aanbod/horeca", knop: "Horeca-software" },
  { woorden: ["rijschool", "rijles", "instructeur", "leerling"], href: "/rijschool-software", knop: "Rijschool-software" },
  { woorden: ["logo"], href: "/logo-maker", knop: "Logo maken" },
  { woorden: ["advertentie", "reclame", "flyer", "poster", "adverteren"], href: "/advertentie-op-maat", knop: "Advertentie maken" },
  { woorden: ["domein", "domeinnaam", ".nl", ".com"], href: "/domeinnaam", knop: "Domeinnaam zoeken" },
  { woorden: ["bellen", "telefoon", "telefoonnummer", "beller", "opnemen"], href: "/aanbod/telefonie", knop: "De AI-beller" },
  { woorden: ["factuur", "facturen", "factureren", "boekhoud", "administratie", "e-factuur"], href: "/aanbod#geld", knop: "Facturen & administratie" },
  { woorden: ["review", "google", "recensie", "beoordeling"], href: "/review-check", knop: "Review-check" },
  { woorden: ["kleding", "werkkleding", "schoenen", "shop"], href: "/shop", knop: "Naar de shop" },
];

/** De placeholder in de zoekbalk (wisselt niet van tekst, zodat schermlezers hem kennen). */
export const ZOEK_PLACEHOLDER = "Stel je vraag… bv. 'ik zoek werk in de horeca' of 'wat kost personeel inhuren?'";

/**
 * Voorbeeldvragen die de balk zichzelf laat 'typen' zolang hij nog leeg is (het
 * levende moment in de hero). Elke regel beantwoordt de assistent echt, dus het
 * laat meteen zien dat je gewoon een vraag mag stellen. Staat stil bij
 * 'prefers-reduced-motion'.
 */
export const ZOEK_VOORBEELDEN = [
  "ik zoek werk in de horeca",
  "wat kost personeel inhuren?",
  "ik wil een webshop openen",
  "bouw een website voor mijn zaak",
  "maak een logo voor mijn bedrijf",
  "hoe snel word ik uitbetaald?",
] as const;

/** De plek + het knoplabel waar wat iemand typt het beste past. */
export interface Wegwijzer {
  href: string;
  knop: string;
}

/** Zonder match: het hele aanbod. */
export const ZOEK_STANDAARD = "/aanbod";
export const WEGWIJZER_STANDAARD: Wegwijzer = { href: ZOEK_STANDAARD, knop: "Bekijk het hele aanbod" };

/** De juiste bestemming + knoplabel voor wat iemand typt (de snelle, zekere laag). */
export function kiesWegwijzer(tekst: string): Wegwijzer {
  const t = tekst.toLowerCase();
  for (const intentie of ZOEK_INTENTIES) {
    if (intentie.woorden.some((w) => t.includes(w))) return { href: intentie.href, knop: intentie.knop };
  }
  return WEGWIJZER_STANDAARD;
}

/** Alleen de bestemming (voor wie geen knoplabel nodig heeft). */
export function kiesBestemming(tekst: string): string {
  return kiesWegwijzer(tekst).href;
}

/**
 * De vier grote deuren boven de vouw — het hoofdelement van de voorpagina
 * (besluit eigenaar, 19 nov 2026). Eén merk, één voorpagina: flexwerk is hier
 * een hoofddeur, niet verstopt. De werk-deur krijgt nadruk (de meeste bezoekers
 * zoeken werk). `track` is de code voor de klik-meting (data-track, opgepikt door
 * components/analytics/AnalyticsBeacon.tsx — geen extra code nodig).
 */
export type DeurIcoon = "werk" | "personeel" | "online" | "branche";

export interface HomeDeur {
  icoon: DeurIcoon;
  titel: string;
  tekst: string;
  href: string;
  track: string;
  /** visueel wat prominenter (de werk-deur: de meeste bezoekers) */
  nadruk?: boolean;
}

export const HOME_DEUREN: HomeDeur[] = [
  { icoon: "werk", titel: "Ik zoek werk", tekst: "Kies klussen bij jou in de buurt. Gratis, in vijf talen.", href: "/flexwerk", track: "home-deur-werk", nadruk: true },
  { icoon: "personeel", titel: "Ik zoek personeel", tekst: "Plaats een dienst en krijg meteen passende mensen.", href: "/voor-bedrijven", track: "home-deur-personeel" },
  { icoon: "online", titel: "Ik wil online", tekst: "Website, webshop, logo of domein — wij bouwen het.", href: "/online", track: "home-deur-online" },
  { icoon: "branche", titel: "Software voor mijn branche", tekst: "Horeca, rijschool en inchecken — kant-en-klaar.", href: "/aanbod#branche", track: "home-deur-branche" },
];

/** De snelkeuzeknoppen onder de zoekbalk: wat mensen het vaakst komen doen. */
export const ZOEK_CHIPS: { label: string; href: string }[] = [
  { label: "Ik zoek werk", href: "/flexwerk" },
  { label: "Ik zoek personeel", href: "/voor-bedrijven" },
  { label: "Website laten maken", href: "/website-maken" },
  { label: "Webshop openen", href: "/aanbod/webshop" },
  { label: "App of spel", href: "/apps-en-spelletjes" },
  { label: "Alles bekijken", href: "/aanbod" },
];

/** Wat ZekerFlex voor je doet: de volle breedte in tegels. */
export interface HomeTegel {
  icoon: HomeIcoon;
  titel: string;
  tekst: string;
  href: string;
  /** een tweede, kleine link onder de tegel (bv. de andere kant van de markt) */
  sub?: { label: string; href: string };
}

export const HOME_TEGELS: HomeTegel[] = [
  {
    icoon: "mensen",
    titel: "Flexwerk & uitzenden",
    tekst: "Vind of huur flexwerkers, uitzendkrachten en zzp'ers. Plaats een dienst en ZekerFlex stelt direct passende mensen voor.",
    href: "/voor-bedrijven",
    sub: { label: "Of ik zoek zelf werk", href: "/flexwerk" },
  },
  {
    icoon: "web",
    titel: "Website laten bouwen",
    tekst: "Een snelle, moderne site op je eigen domein, zonder cookies van anderen. Teksten en foto's pas je zelf aan.",
    href: "/website-maken",
    sub: { label: "Bekijk wat we maakten", href: "/website-maken#voorbeelden" },
  },
  {
    icoon: "winkel",
    titel: "Webshop openen",
    tekst: "Je eigen webwinkel met producten, bestellingen, kortingen en verzending. De wettelijke pagina's staan als begin klaar.",
    href: "/aanbod/webshop",
  },
  {
    icoon: "app",
    titel: "Apps & spelletjes",
    tekst: "We bouwen complete apps. Praat met een vreemde of speel een spel in Talkaro, swipe korte video's in FlikFlak.",
    href: "/apps-en-spelletjes",
  },
  {
    icoon: "branche",
    titel: "Branchesoftware",
    tekst: "Kant-en-klare software voor jouw soort zaak: reserveren en bestellen in de horeca, of lessen plannen bij een rijschool.",
    href: "/aanbod#branche",
  },
  {
    icoon: "ai",
    titel: "AI & automatisering",
    tekst: "Een assistent die de telefoon opneemt als jij niet kunt, slimme matching en facturen die vanzelf uit je uren komen.",
    href: "/aanbod/telefonie",
  },
];

/** De twee werelden: wie werk zoekt en wie mensen of software zoekt. */
export const HOME_WERELDEN: { kant: "mensen" | "bedrijven"; eyebrow: string; titel: string; tekst: string; knop: string; href: string; foto: string; alt: string }[] = [
  {
    kant: "mensen",
    eyebrow: "Voor werkers",
    titel: "Zelf je werk kiezen",
    tekst: "Flexwerker, uitzendkracht of zzp'er: kies klussen bij jou in de buurt, zie vooraf wat je verdient en check in met je telefoon. Gratis, in vijf talen.",
    knop: "Ik zoek werk",
    href: "/flexwerk",
    foto: "/werk/campagne-kop.jpg",
    alt: "Een medewerker met een dienblad onder de arm in de deuropening van een café",
  },
  {
    kant: "bedrijven",
    eyebrow: "Voor bedrijven",
    titel: "Alles voor je zaak op één plek",
    tekst: "Huur personeel in, laat een website of webshop bouwen en zet branchesoftware aan. Inchecken, uren goedkeuren en factureren gaan in dezelfde omgeving.",
    knop: "Ik zoek personeel",
    href: "/voor-bedrijven",
    foto: "/marketing/employer-hero.jpg",
    alt: "Een horecaondernemer met een tablet achter de bar, zijn team op de achtergrond",
  },
];

/** De vragen over het hele platform (ook als FAQPage voor zoekmachines, via ldJson). */
export const HOME_FAQ: { q: string; a: string }[] = [
  { q: "Wat is ZekerFlex precies?", a: "Eén platform waarmee je mensen vindt of inhuurt, en waarmee we een website, webshop, app of branchesoftware voor je bouwen. Je zet aan wat je nodig hebt; de rest laat je uit." },
  { q: "Kan ik hier werk vinden?", a: "Ja. Als flexwerker, uitzendkracht of zzp'er kies je zelf je klussen bij jou in de buurt. Meedoen als werker is gratis en de app werkt in vijf talen. Begin op de pagina voor flexwerk." },
  { q: "Wat kost het om personeel in te huren?", a: "Je betaalt vaste platformkosten per gewerkt uur, alleen wanneer er iemand werkt — geen abonnement en geen opstartkosten. Je ziet de kosten vooraf als je een klus samenstelt." },
  { q: "Bouwen jullie echt websites en apps?", a: "Ja. Je ziet voorbeelden van sites en apps die we maakten, zoals SmileyApp, Het Schwarzwald, FlikFlak en Talkaro. Vul je wensen in en je krijgt een voorbeeld terug." },
  { q: "Draait alles bij jullie zelf?", a: "Zoveel mogelijk op onze eigen servers: matching, reistijd, het lezen van certificaten en de AI-assistent. Voor betalingen en verificatie gebruiken we gespecialiseerde partners." },
  { q: "Hoe begin ik?", a: "Typ bovenaan wat je zoekt, of kies een van de knoppen. Je komt dan op de juiste pagina en kunt vaak eerst rondkijken voordat je een account maakt." },
];

/** De vragen als FAQPage voor zoekmachines. */
export function homeFaqJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
