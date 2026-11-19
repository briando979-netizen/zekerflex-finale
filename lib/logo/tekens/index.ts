import { createElement, type ReactElement } from "react";
import data from "@/lib/logo/tekens/phosphor-fill.json";

// ---------------------------------------------------------------------------
// De tekens voor de logo's en advertenties: een gekozen deelverzameling van de
// gevulde Phosphor Icons (MIT, zie README.md en LICENSE-phosphor.txt in deze map),
// als padgegevens in de repo. Er wordt niets live opgehaald. Alleen voor code die
// op de server rendert: dit bestand (175 kB) hoort niet in de bundel van de browser.
// Per teken: `d` (het pad op een raster van 256) en `b` (de werkelijke
// bounding box: x, y, breedte, hoogte), zodat een teken op zijn echte vorm wordt
// geschaald en gecentreerd en niet op het lege raster eromheen.
// ---------------------------------------------------------------------------

interface Teken {
  d: string;
  b: number[];
}
const TEKENS = data as Record<string, Teken>;

export const tekenNamen = (): string[] => Object.keys(TEKENS);
export const heeftTeken = (naam: string): boolean => Object.hasOwn(TEKENS, naam);

const NS = "http://www.w3.org/2000/svg";
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Breedte gedeeld door hoogte van de echte vorm. */
export function tekenVerhouding(naam: string): number {
  const b = TEKENS[naam]?.b;
  return b && b[2] && b[3] ? b[2] / b[3] : 1;
}

/** Een teken als SVG, passend in een vak van `maat` × `maat` (de langste zijde vult het vak). Onbekende naam = null. */
export function teken(naam: string, maat: number, kleur: string): ReactElement | null {
  const t = Object.hasOwn(TEKENS, naam) ? TEKENS[naam] : undefined;
  if (!t) return null;
  const [x = 0, y = 0, w = 256, h = 256] = t.b;
  const schaal = maat / Math.max(w, h);
  return createElement("svg", { width: r2(w * schaal), height: r2(h * schaal), viewBox: `${x} ${y} ${w} ${h}`, xmlns: NS, style: { flexShrink: 0 } }, createElement("path", { d: t.d, fill: kleur }));
}

/** Een cirkel in de kleur met het teken eruit gespaard (evenodd), `maat` × `maat`. */
export function embleem(naam: string, maat: number, kleur: string): ReactElement | null {
  const t = Object.hasOwn(TEKENS, naam) ? TEKENS[naam] : undefined;
  if (!t) return null;
  const [x = 0, y = 0, w = 256, h = 256] = t.b;
  // het teken op 58% van de cirkel, in het midden
  const s = (0.58 * 200) / Math.max(w, h);
  const tx = 100 - (x + w / 2) * s;
  const ty = 100 - (y + h / 2) * s;
  return createElement(
    "svg",
    { width: r2(maat), height: r2(maat), viewBox: "0 0 200 200", xmlns: NS, style: { flexShrink: 0 } },
    createElement("mask", { id: `m-${naam}` }, createElement("rect", { x: 0, y: 0, width: 200, height: 200, fill: "#fff" }), createElement("path", { d: t.d, fill: "#000", transform: `translate(${r2(tx)} ${r2(ty)}) scale(${r2(s)})` })),
    createElement("circle", { cx: 100, cy: 100, r: 100, fill: kleur, mask: `url(#m-${naam})` }),
  );
}
