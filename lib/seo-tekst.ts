// ---------------------------------------------------------------------------
// Titels en beschrijvingen op een lengte die Google toont (15 nov 2026). De paginacheck vond 332 van de 435 pagina's met
// een titel boven 65 tekens en 384 met een beschrijving boven 165: Google kapt die af met "…", midden in een woord of
// zin. Puur. Alleen voor <title> en de meta-beschrijving; voor delen (og:title, og:description) mag het langer.
// ---------------------------------------------------------------------------

/** Google toont ±580 pixels titel: ongeveer 60 tekens. */
export const TITEL_MAX = 60;
/** En ongeveer 155 tekens beschrijving (op een telefoon soms minder). */
export const BESCHRIJVING_MAX = 155;

/**
 * "Hoofdzaak — toelichting" met " | merk": past het niet, dan valt de toelichting na het streepje weg; past ook dat
 * niet, dan zonder merk; en anders afgekapt op een heel woord.
 */
export function seoTitel(titel: string, merk = "ZekerFlex"): string {
  const vol = `${titel} | ${merk}`;
  if (vol.length <= TITEL_MAX) return vol;
  const kern = (titel.split(" — ")[0] ?? titel).trim();
  if (kern !== titel && `${kern} | ${merk}`.length <= TITEL_MAX) return `${kern} | ${merk}`;
  if (kern.length <= TITEL_MAX) return kern;
  return `${kern.slice(0, TITEL_MAX - 1).replace(/\s+\S*$/, "")}…`;
}

/** Een beschrijving tot de laatste hele zin binnen de grens; is die er niet (of te kort), tot het laatste hele woord. */
export function seoBeschrijving(tekst: string): string {
  const t = tekst.replace(/\s+/g, " ").trim();
  if (t.length <= BESCHRIJVING_MAX) return t;
  const stuk = t.slice(0, BESCHRIJVING_MAX);
  const zin = Math.max(stuk.lastIndexOf(". "), stuk.lastIndexOf("! "), stuk.lastIndexOf("? "));
  if (zin >= 80) return stuk.slice(0, zin + 1);
  return `${t.slice(0, BESCHRIJVING_MAX - 1).replace(/[\s,;:—–-]+\S*$/, "").replace(/[\s,;:—–-]+$/, "")}…`;
}
