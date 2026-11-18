// ---------------------------------------------------------------------------
// Het gezicht van de smiley in het SmileyApp-voorstel, als pure rekensom: bij
// een 1 kijkt hij boos (koraal), bij een 10 lacht hij breed (het groen van hun
// logo), daartussen via geel. Gedeeld door de server (vaste smileys) en de
// browser (de smiley die je zelf swipet), dus overal precies hetzelfde.
// ---------------------------------------------------------------------------

const STOPS: readonly (readonly [number, readonly [number, number, number]])[] = [
  [1, [240, 112, 95]], // koraal
  [5.5, [253, 209, 26]], // geel uit het logo
  [10, [90, 186, 142]], // groen uit het logo
];

const binnen = (score: number) => Math.min(10, Math.max(1, Number.isFinite(score) ? score : 10));
const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/** De kleur van ring, ogen en mond bij een score van 1 tot 10. */
export function gezichtKleur(score: number): string {
  const s = binnen(score);
  for (let i = 1; i < STOPS.length; i++) {
    const [tot, b] = STOPS[i] ?? [10, [90, 186, 142] as const];
    const [van, a] = STOPS[i - 1] ?? [1, [240, 112, 95] as const];
    if (s <= tot) {
      const t = (s - van) / (tot - van);
      return `#${hex(a[0] + (b[0] - a[0]) * t)}${hex(a[1] + (b[1] - a[1]) * t)}${hex(a[2] + (b[2] - a[2]) * t)}`.toUpperCase();
    }
  }
  return "#5ABA8E";
}

/** De mond als SVG-pad in een vak van 100 × 100: frons bij 1, recht rond 5,5, grote lach bij 10. */
export function mondPad(score: number): string {
  const krom = (binnen(score) - 5.5) * 3.6; // -16,2 … +16,2
  const hoek = 66 - krom * 0.25;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `M 30 ${r(hoek)} Q 50 ${r(66 + krom)} 70 ${r(hoek)}`;
}
