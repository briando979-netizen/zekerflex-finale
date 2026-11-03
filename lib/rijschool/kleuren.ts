// ---------------------------------------------------------------------------
// Kleuren van een rijschoolsite in de ZekerFlex-huisstijl (zoals
// schwarzwald.zekerflex.com): donkere hero, één merkaccent, crème vlakken.
// Elke rijschool kiest haar eigen kleuren; hier rekenen we uit welke tekst
// daarop leesbaar is (WCAG AA, 4,5:1), zodat geen keuze de site onleesbaar maakt.
// Puur, zodat het te testen is.
// ---------------------------------------------------------------------------

export const NACHT = "#0A120E";
export const CREME = "#FFF6EA";
export const ZAND = "#F4E9DA";

const HEX = /^#[0-9a-fA-F]{6}$/;

function rgb(hex: string): [number, number, number] {
  const h = HEX.test(hex) ? hex : "#1D4E89";
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const naarHex = (c: [number, number, number]) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

function luminantie(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminantie(a), luminantie(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Mengt `deel` (0..1) van kleur a met kleur b. */
export function meng(a: string, b: string, deel: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return naarHex([0, 1, 2].map((i) => x[i]! * deel + y[i]! * (1 - deel)) as [number, number, number]);
}

/** Tekst op deze achtergrond: nacht of wit, wat het best leesbaar is. */
export function tekstOp(achtergrond: string): string {
  return contrast(achtergrond, NACHT) >= contrast(achtergrond, "#FFFFFF") ? NACHT : "#FFFFFF";
}

/** Een knop in deze kleur: de kleur zelf, of iets donkerder als geen tekstkleur er leesbaar op is (middentinten). */
export function knop(kleur: string): { achtergrond: string; tekst: string } {
  const t = tekstOp(kleur);
  if (contrast(kleur, t) >= 4.5) return { achtergrond: kleur, tekst: t };
  for (let donker = 0.05; donker <= 1; donker += 0.05) {
    const k = meng(kleur, NACHT, 1 - donker);
    if (contrast(k, "#FFFFFF") >= 4.5) return { achtergrond: k, tekst: "#FFFFFF" };
  }
  return { achtergrond: NACHT, tekst: "#FFFFFF" };
}

/** De kleur zelf, zo nodig donkerder tot hij als tekst op crème goed leesbaar is. */
export function leesbaarOpLicht(kleur: string, achtergrond = CREME): string {
  for (let donker = 0; donker <= 1; donker += 0.05) {
    const k = meng(kleur, NACHT, 1 - donker);
    if (contrast(k, achtergrond) >= 4.6) return k;
  }
  return NACHT;
}

/** De kleur zo nodig lichter tot hij als tekst op de donkere hero goed leesbaar is. */
export function leesbaarOpDonker(kleur: string, achtergrond: string): string {
  for (let licht = 0; licht <= 1; licht += 0.05) {
    const k = meng(kleur, "#FFFFFF", 1 - licht);
    if (contrast(k, achtergrond) >= 4.6) return k;
  }
  return "#FFFFFF";
}

/** Alle kleuren van de site als CSS-variabelen. */
export function siteKleuren(r: { kleur: string; accent: string }): Record<string, string> {
  const kleur = HEX.test(r.kleur) ? r.kleur.toUpperCase() : "#1D4E89";
  const accent = HEX.test(r.accent) ? r.accent.toUpperCase() : "#F2B544";
  // de nacht van de hero: de hoofdkleur, diep donker gemaakt
  const nacht = meng(kleur, NACHT, 0.28);
  const kk = knop(kleur);
  const ak = knop(accent);
  return {
    "--rs-kleur": kleur,
    "--rs-accent": accent,
    "--rs-nacht": nacht,
    "--rs-diep": meng(kleur, NACHT, 0.55),
    // knoppen en vlakken met tekst erop: zo nodig iets donkerder, altijd leesbaar
    "--rs-kleur-knop": kk.achtergrond,
    "--rs-op-kleur": kk.tekst,
    "--rs-accent-knop": ak.achtergrond,
    "--rs-op-accent": ak.tekst,
    "--rs-kleur-tekst": leesbaarOpLicht(kleur),
    "--rs-accent-tekst": leesbaarOpLicht(accent),
    "--rs-accent-op-nacht": leesbaarOpDonker(accent, nacht),
    "--rs-creme": CREME,
    "--rs-zand": ZAND,
  };
}
