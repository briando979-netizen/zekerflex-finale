// ---------------------------------------------------------------------------
// Is dit een testklus? In de opbouwfase zet ZekerFlex zelf klussen uit bij het
// eigen testbedrijf ("Test bedrijven"), om te zien of alles werkt. Dat zijn
// echte vacatures in de app, maar er zit geen werk achter. Een werker moet dat
// meteen zien (hij hoeft er niet heen), en Google en Indeed mogen ze niet als
// vacature krijgen (nepvacatures zijn tegen hun regels).
// Herkenning: het bedrijf heet "Test …", of de titel noemt het een testklus.
// Puur bestand: de openbare pagina's (server) en de werker-app delen dit.
// ---------------------------------------------------------------------------

export function isTestklus(s: { title: string; bedrijf?: string | null; eigenTest?: boolean }): boolean {
  // het bedrijf is in het beheer gemarkeerd als eigen test en de klus is van daarna (lib/admin/eigen-test-kern.ts)
  if (s.eigenTest) return true;
  if (/\btest[\s-]?klus\b/i.test(s.title)) return true;
  return /^\s*test(\s|$)/i.test(s.bedrijf ?? "");
}

/** Sorteerhulp: echte klussen altijd vóór testklussen; verder blijft de volgorde gelijk (0). */
export function echteKlussenEerst(a: { testklus?: boolean }, b: { testklus?: boolean }): number {
  return Number(Boolean(a.testklus)) - Number(Boolean(b.testklus));
}

/** Staan er alleen testklussen in de lijst (en minstens één)? Dan zegt de werker-app dat eerlijk. */
export function alleenTestklussen(shifts: readonly { testklus?: boolean }[]): boolean {
  return shifts.length > 0 && shifts.every((s) => s.testklus);
}
