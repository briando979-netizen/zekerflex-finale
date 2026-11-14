// ---------------------------------------------------------------------------
// Eén sprong van de bedrijfssite naar het vacaturesysteem van hetzelfde bedrijf.
//
// Veel bedrijven zetten hun vacatures niet op de eigen site maar bij een dienst
// (hotelzuidbroek.nl → hotelzuidbroek.recruitee.com) of op een eigen subdomein
// (bidfood.nl → werkenbij.bidfood.nl). De crawler bleef op het eigen origin en
// zag die vacatures dus nooit: wel een e-mail, geen vacaturesignaal, geen concept.
//
// Dit bestand is puur (geen netwerk, geen prisma), zodat de regels te testen zijn.
// Toegestaan: alleen https, alleen een bekende dienst in de slug-vorm
// <bedrijf>.<dienst> of een werken-bij-subdomein van het eigen domein. Nooit een
// willekeurige derde partij.
// ---------------------------------------------------------------------------

/** Bekende vacaturediensten; het bedrijf heeft daar een eigen subdomein (<slug>.recruitee.com). */
export const VACATUREDIENSTEN = ["recruitee.com", "homerun.co"] as const;

/** Werken-bij-subdomeinen van het eigen domein (werkenbij.bidfood.nl bij bidfood.nl). */
export const EIGEN_SUBDOMEINEN = ["werkenbij", "werken-bij", "careers", "jobs", "vacatures", "solliciteren"] as const;

/** Het hoofddomein zonder www. */
export function hoofddomein(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * Mag de crawler vanaf `basis` één sprong maken naar `doel`?
 * Alleen https, een ander origin, en óf een werken-bij-subdomein van het eigen
 * domein, óf precies <slug>.<dienst> bij een bekende vacaturedienst.
 */
export function isVacatureSprong(doel: URL, basis: URL): boolean {
  if (doel.protocol !== "https:") return false;
  if (doel.origin === basis.origin) return false;
  const host = doel.hostname.toLowerCase();
  const eigen = hoofddomein(basis.hostname);
  if (EIGEN_SUBDOMEINEN.some((s) => host === `${s}.${eigen}`)) return true;
  return VACATUREDIENSTEN.some((dienst) => {
    if (!host.endsWith(`.${dienst}`)) return false;
    const slug = host.slice(0, -(dienst.length + 1));
    // precies één label vóór de dienst (de bedrijfsslug), geen www of diepere hosts
    return slug.length > 0 && !slug.includes(".") && slug !== "www";
  });
}

/** Adressen van de dienst zelf (support@recruitee.com) zijn nooit het adres van het bedrijf. */
export function isDienstAdres(email: string): boolean {
  const dom = email.split("@")[1]?.toLowerCase() ?? "";
  return VACATUREDIENSTEN.some((d) => dom === d || dom.endsWith(`.${d}`));
}
