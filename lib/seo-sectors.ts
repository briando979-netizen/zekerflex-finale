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
  },
];

export function sectorBySlug(slug: string): Sector | undefined {
  return SECTORS.find((s) => s.slug === slug);
}
