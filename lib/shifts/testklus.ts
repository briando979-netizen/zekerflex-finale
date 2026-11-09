// ---------------------------------------------------------------------------
// Is dit een testklus? In de opbouwfase zet ZekerFlex zelf klussen uit bij het
// eigen testbedrijf ("Test bedrijven"), om te zien of alles werkt. Dat zijn
// echte vacatures in de app, maar er zit geen werk achter. Een werker moet dat
// meteen zien (hij hoeft er niet heen), en Google en Indeed mogen ze niet als
// vacature krijgen (nepvacatures zijn tegen hun regels).
// Herkenning: het bedrijf heet "Test …", of de titel noemt het een testklus.
// Puur bestand: de openbare pagina's (server) en de werker-app delen dit.
// ---------------------------------------------------------------------------

export function isTestklus(s: { title: string; bedrijf?: string | null }): boolean {
  if (/\btest[\s-]?klus\b/i.test(s.title)) return true;
  return /^\s*test(\s|$)/i.test(s.bedrijf ?? "");
}
