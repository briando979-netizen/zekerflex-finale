// Puur hulpje van controle.mjs (zonder neveneffecten, dus ook te importeren in een test): mag een bewaarde controle-uitslag worden
// hergebruikt voor een controle met deze gevraagde basis (vanaf)?

const isSha = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);

/**
 * Zonder gevraagde basis (geen vanaf) altijd; met een volledige sha alleen als de uitslag met precies die basis is gemaakt.
 * Een controle met een andere basis (bv. een tak-sha) dekte misschien alleen de laatste commit.
 */
export function basisKlopt(uitslag, gevraagd) {
  return !isSha(gevraagd) || uitslag.vanaf === gevraagd;
}