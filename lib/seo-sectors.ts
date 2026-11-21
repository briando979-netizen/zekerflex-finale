// ---------------------------------------------------------------------------
// Sectoren die hun eigen programmatische landingspagina's krijgen
// ("<sector> personeel inhuren" + per stad). Eén sjabloon
// (components/marketing/SectorLanding.tsx) rendert hub + stad-pagina's uit deze
// lijst, zodat een nieuwe sector toevoegen = één entry hieronder. Elke pagina
// combineert sector-copy met échte lokale context (lib/seo-cities.ts), dus geen
// dunne duplicaat-tekst met alleen een woord verwisseld.
// ---------------------------------------------------------------------------

export interface Sector {
  /** route-segment werkgever-kant, bv. "horeca-personeel-inhuren" */
  slug: string;
  /** route-segment werker-kant, bv. "horeca-vacatures" → /horeca-vacatures */
  workerSlug: string;
  /** korte sleutel, bv. "horeca" */
  key: string;
  /** label met hoofdletter, bv. "Horeca" */
  label: string;
  /** enkelvoudige kracht, bv. "horecakracht" (voor FAQ-copy) */
  worker: string;
  /** opsomming van rollen, bv. "bedieners, afwassers, koks, barpersoneel en runners" */
  roles: string;
  /** korte rollen-regel voor de kaartjes op de hub */
  rolesShort: string;
  /** typische piek, bv. "een drukke avond" / "een grote order" */
  peak: string;
  /** schema.org serviceType */
  serviceType: string;
  /** wat het werk inhoudt, in twee gewone zinnen, voor de werkerspagina's (geen cijfers, geen beloftes) */
  werkUitleg: string;
  /** werkerskant, de kop per stad zoals mensen zoeken ("Schoonmaakwerk en vacatures" → "… in Enschede"); standaard "<label> vacatures" */
  werkKop?: string;
  /** werkerskant, de kop van het overzicht; standaard "Werken in de <sector>: vacatures en bijbanen" */
  werkHub?: string;
  /** werkgeverskant, de kop zoals bedrijven zoeken ("Schoonmaakpersoneel inhuren"); standaard "<label> personeel inhuren" */
  inhurenKop?: string;
  /** werkgeverskant, de kop van het overzicht; standaard gelijk aan inhurenKop */
  inhurenHub?: string;
}

export const SECTORS: Sector[] = [
  {
    slug: "horeca-personeel-inhuren",
    workerSlug: "horeca-vacatures",
    key: "horeca",
    label: "Horeca",
    worker: "horecakracht",
    roles: "bedieners, afwassers, koks, barpersoneel en runners",
    rolesShort: "bediening · keuken · bar · afwas",
    peak: "een drukke avond",
    serviceType: "Horeca flexwerk- en uitzendplatform",
    werkUitleg:
      "Je werkt in de bediening, achter de bar, in de keuken of bij de afwas, vaak 's avonds en in het weekend. Bij elke dienst zie je vooraf wat er van je gevraagd wordt, het uurtarief en hoe lang je reist.",
  },
  {
    slug: "logistiek-personeel-inhuren",
    workerSlug: "logistiek-vacatures",
    key: "logistiek",
    label: "Logistiek",
    worker: "magazijnkracht",
    roles: "orderpickers, inpakkers, heftruckchauffeurs en laders",
    rolesShort: "orderpicken · inpakken · heftruck · laden",
    peak: "een piek of een grote order",
    serviceType: "Logistiek flexwerk- en uitzendplatform",
    // Search Console 22 nov 2026: "vacatures logistiek eindhoven", "logistieke vacatures eindhoven", "logistiek medewerker …"
    werkKop: "Logistieke vacatures",
    werkUitleg:
      "Je werkt als orderpicker, inpakker, lader of heftruckchauffeur in een magazijn of distributiecentrum, vaak in ploegen. Voor werk op een heftruck vraagt een opdrachtgever meestal een heftruckcertificaat; dat staat dan bij de dienst.",
  },
  {
    slug: "schoonmaak-personeel-inhuren",
    workerSlug: "schoonmaak-vacatures",
    key: "schoonmaak",
    label: "Schoonmaak",
    worker: "schoonmaker",
    roles: "schoonmakers, glazenwassers en huishoudelijk medewerkers",
    rolesShort: "kantoor · horeca · glas · oplevering",
    peak: "een extra opdracht",
    serviceType: "Schoonmaak flexwerk- en uitzendplatform",
    // Search Console 22 nov 2026: "schoonmaakwerk", "werken als schoonmaker", "schoonmaak vacatures enschede",
    // "schoonmakers inhuren", "schoonmaakpersoneel inhuren"
    werkKop: "Schoonmaakwerk en vacatures",
    werkHub: "Schoonmaakwerk: werken als schoonmaker",
    inhurenKop: "Schoonmaakpersoneel inhuren",
    inhurenHub: "Schoonmakers en schoonmaakpersoneel inhuren",
    werkUitleg:
      "Je maakt kantoren, hotelkamers, horecazaken of net opgeleverde woningen schoon, vaak vroeg in de ochtend of 's avonds na sluitingstijd. Ervaring helpt, en bij elke klus staat wat de opdrachtgever precies vraagt.",
  },
  {
    slug: "evenementen-personeel-inhuren",
    workerSlug: "evenementen-vacatures",
    key: "evenementen",
    label: "Evenementen",
    worker: "eventmedewerker",
    roles: "hosts, hostesses, op- en afbouwers, barmedewerkers en crew",
    rolesShort: "crew · bar · hosting · op- en afbouw",
    peak: "een evenement of festival",
    serviceType: "Evenementen flexwerk- en uitzendplatform",
    werkHub: "Werken op evenementen: vacatures en bijbanen",
    werkUitleg:
      "Je helpt bij festivals, beurzen, concerten en bedrijfsfeesten: bij de op- en afbouw, achter de bar, bij de ingang of als host. Het werk zit vaak in het weekend en 's avonds, soms in een paar lange dagen achter elkaar.",
  },
  {
    slug: "retail-personeel-inhuren",
    workerSlug: "retail-vacatures",
    key: "retail",
    label: "Retail",
    worker: "winkelmedewerker",
    roles: "verkoopmedewerkers, vakkenvullers en kassamedewerkers",
    rolesShort: "verkoop · kassa · vakkenvullen",
    peak: "een drukke periode of uitverkoop",
    serviceType: "Retail flexwerk- en uitzendplatform",
    werkUitleg:
      "Je helpt klanten op de winkelvloer, zit achter de kassa of vult de schappen, overdag, op koopavonden of in het weekend. In drukke tijden, zoals de feestdagen en de uitverkoop, zoeken winkels extra mensen.",
  },
  // 21 nov 2026 (eigenaar: "branches zoals YoungOnes", ook Promotie en Bezorging, met de regio's)
  {
    slug: "promotie-personeel-inhuren",
    workerSlug: "promotie-vacatures",
    key: "promotie",
    label: "Promotie",
    worker: "promotiemedewerker",
    roles: "promotiemedewerkers, samplers, beurspromotors en straatwervers",
    rolesShort: "sampling · beurs · winkel · straat",
    peak: "een actieweek, beurs of productlancering",
    serviceType: "Promotie flexwerk- en uitzendplatform",
    werkHub: "Promotiewerk: vacatures en bijbanen",
    werkUitleg:
      "Je deelt proefmonsters uit, staat op een beurs of in een winkel om een product te laten zien, of spreekt mensen aan op straat. Je werkt per actie of per dag, vaak in het weekend.",
  },
  {
    slug: "bezorging-personeel-inhuren",
    workerSlug: "bezorging-vacatures",
    key: "bezorging",
    label: "Bezorging",
    worker: "bezorger",
    roles: "bezorgers en koeriers op de fiets, scooter of in een bestelbus",
    rolesShort: "fiets · scooter · bus · pakketten",
    peak: "een drukke avond of de feestdagen",
    serviceType: "Bezorging flexwerk- en uitzendplatform",
    // Search Console 22 nov 2026: "koerier den bosch", "bezorger 's-hertogenbosch", "bezorger inhuren"
    werkKop: "Bezorg- en koerierswerk",
    werkHub: "Werken als bezorger of koerier",
    inhurenKop: "Bezorgers en koeriers inhuren",
    werkUitleg:
      "Je bezorgt maaltijden, boodschappen of pakketten op de fiets, de scooter of in een bestelbus. Wat je nodig hebt, zoals een rijbewijs of een eigen fiets, staat bij de dienst.",
  },
];

export function sectorBySlug(slug: string): Sector | undefined {
  return SECTORS.find((s) => s.slug === slug);
}

// De koppen per sector (22 nov 2026): zoals mensen echt zoeken (Search Console), met een gewone standaard.

/** Werkerskant per stad: "Horeca vacatures", "Schoonmaakwerk en vacatures" (+ " in <stad>"). */
export const werkKop = (s: Sector): string => s.werkKop ?? `${s.label} vacatures`;
/** Werkerskant, het overzicht: "Werken in de horeca: vacatures en bijbanen". */
export const werkHubKop = (s: Sector): string => s.werkHub ?? `Werken in de ${s.label.toLowerCase()}: vacatures en bijbanen`;
/** Werkgeverskant per stad: "Horeca personeel inhuren", "Schoonmaakpersoneel inhuren" (+ " in <stad>"). */
export const inhurenKop = (s: Sector): string => s.inhurenKop ?? `${s.label} personeel inhuren`;
/** Werkgeverskant, het overzicht. */
export const inhurenHubKop = (s: Sector): string => s.inhurenHub ?? inhurenKop(s);
/** De korte rollen als gewone opsomming: "bediening · keuken · bar · afwas" → "bediening, keuken, bar en afwas". */
export function rollenKort(s: Sector): string {
  const delen = s.rolesShort.split(" · ").map((d) => d.trim()).filter(Boolean);
  if (delen.length < 2) return delen.join("");
  return `${delen.slice(0, -1).join(", ")} en ${delen[delen.length - 1] ?? ""}`;
}
