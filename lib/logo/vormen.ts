import { createElement, type ReactElement, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Eigen SVG-vormen voor de logo maker (lib/logo/ontwerp2.ts) en de advertenties:
// ster, baan, bergtoppen, wereldbol, chevron, kroon, bliksem, snelheidsstrepen,
// schild, lauwerkrans, vleugels en een zegelring. Alles zelf getekend uit
// eenvoudige paden, in één kleur, zonder plaatjes of tekens van derden. satori
// (next/og) zet een <svg> in de boom om naar een beeld. Puur.
// Elke vorm krijgt zijn maat in beeldpunten van het eindbeeld en een kleur.
// ---------------------------------------------------------------------------

const NS = "http://www.w3.org/2000/svg";
const r2 = (n: number) => Math.round(n * 100) / 100;

function svg(breedte: number, hoogte: number, viewBox: string, ...kinderen: ReactNode[]): ReactElement {
  return createElement("svg", { width: r2(breedte), height: r2(hoogte), viewBox, xmlns: NS, style: { flexShrink: 0 } }, ...kinderen);
}
const pad = (d: string, extra: Record<string, unknown>): ReactElement => createElement("path", { d, ...extra });

/** Vierpuntige ster met dunne punten. */
export function ster(grootte: number, kleur: string): ReactElement {
  return svg(grootte, grootte, "0 0 100 100", pad("M50 0 C52.5 35 65 47.5 100 50 C65 52.5 52.5 65 50 100 C47.5 65 35 52.5 0 50 C35 47.5 47.5 35 50 0 Z", { fill: kleur }));
}

/** Een ellips als twee halve bogen (voor een pad met evenodd). */
const ellips = (cx: number, cy: number, rx: number, ry: number) => `M${r2(cx - rx)} ${r2(cy)} A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(cx + rx)} ${r2(cy)} A${r2(rx)} ${r2(ry)} 0 1 0 ${r2(cx - rx)} ${r2(cy)} Z`;

/**
 * Een baan: een gedraaide ellips als sikkel, linksonder dik en rechtsboven dun. `rx` en `ry` zijn de stralen, `hoek` in
 * graden. Geeft het beeld en zijn maten terug, zodat de aanroeper het precies om een woord kan leggen.
 */
export function baan(rx: number, ry: number, kleur: string, hoek = -11, dik = 14, dun = 2): { el: ReactElement; breedte: number; hoogte: number } {
  const rad = (hoek * Math.PI) / 180;
  const hb = Math.sqrt((rx * Math.cos(rad)) ** 2 + (ry * Math.sin(rad)) ** 2) + 4;
  const hh = Math.sqrt((rx * Math.sin(rad)) ** 2 + (ry * Math.cos(rad)) ** 2) + 4;
  const t = (dik + dun) / 2;
  const s = (dik - dun) / 2;
  // de binnenellips schuift naar rechtsboven: daar blijft de ring dun
  const binnen = ellips(hb + s * 0.78, hh - s * 0.62, rx - t, ry - t);
  const d = `${ellips(hb, hh, rx, ry)} ${binnen}`;
  const el = svg(hb * 2, hh * 2, `0 0 ${r2(hb * 2)} ${r2(hh * 2)}`, createElement("g", { transform: `rotate(${hoek} ${r2(hb)} ${r2(hh)})` }, pad(d, { fill: kleur, fillRule: "evenodd" })));
  return { el, breedte: hb * 2, hoogte: hh * 2 };
}

/** Bergtoppen, 200 × 100. 1: massief met sneeuwrand, 2: twee toppen in lijn, 3: één scherpe top met zon. */
export function bergen(breedte: number, kleur: string, variant: 1 | 2 | 3 = 1): ReactElement {
  const hoogte = breedte / 2;
  if (variant === 2) {
    const lijn = { fill: "none", stroke: kleur, strokeWidth: 9, strokeLinejoin: "miter", strokeMiterlimit: 8, strokeLinecap: "square" };
    return svg(breedte, hoogte, "0 0 200 100", pad("M8 94 L74 14 L112 60", lijn), pad("M92 84 L136 30 L192 94", lijn));
  }
  if (variant === 3) {
    return svg(breedte, hoogte, "0 0 200 100", createElement("circle", { cx: 148, cy: 26, r: 13, fill: kleur }), pad("M10 96 L92 6 L126 44 L112 44 L92 24 L40 96 Z M104 96 L140 54 L190 96 Z", { fill: kleur }));
  }
  return svg(
    breedte,
    hoogte,
    "0 0 200 100",
    pad("M0 100 L58 28 L78 50 L108 4 L150 60 L166 44 L200 100 Z M108 26 L92 52 L101 46 L108 58 L116 46 L126 54 Z M58 46 L48 62 L58 56 L66 64 Z", { fill: kleur, fillRule: "evenodd" }),
  );
}

/** Een wereldbol als draadmodel. `deel` knipt hem in een boven- of onderhelft, zodat er een woord tussen past. */
export function bol(doorsnee: number, kleur: string, deel: "heel" | "boven" | "onder" = "heel", lijn = 2.4): ReactElement {
  const s = { fill: "none", stroke: kleur, strokeWidth: lijn };
  const delen: ReactNode[] = [createElement("circle", { cx: 50, cy: 50, r: 46.5, ...s }), createElement("ellipse", { cx: 50, cy: 50, rx: 16, ry: 46.5, ...s }), createElement("ellipse", { cx: 50, cy: 50, rx: 33, ry: 46.5, ...s }), createElement("line", { x1: 50, y1: 3.5, x2: 50, y2: 96.5, ...s })];
  for (const dy of [-32, -16, 0, 16, 32]) {
    const hw = Math.sqrt(46.5 ** 2 - dy ** 2);
    delen.push(createElement("line", { x1: r2(50 - hw), y1: 50 + dy, x2: r2(50 + hw), y2: 50 + dy, ...s }));
  }
  if (deel === "heel") return svg(doorsnee, doorsnee, "0 0 100 100", ...delen);
  // de snede valt net naast de evenaar, zodat de helft niet op een halve lijn eindigt
  return svg(doorsnee, doorsnee * 0.4, deel === "boven" ? "0 0 100 40" : "0 60 100 40", ...delen);
}

/** Een scherpe V met een tweede, kleinere V erin. 200 × 150. */
export function chevron(breedte: number, kleur: string): ReactElement {
  return svg(breedte, breedte * 0.75, "0 0 200 150", pad("M0 0 L46 0 L100 92 L154 0 L200 0 L100 150 Z", { fill: kleur }), pad("M72 0 L100 48 L128 0 L110 0 L100 18 L90 0 Z", { fill: kleur }));
}

/** Een kroon met drie punten en bolletjes. 120 × 84. */
export function kroon(breedte: number, kleur: string): ReactElement {
  return svg(
    breedte,
    breedte * 0.7,
    "0 0 120 84",
    pad("M14 62 L8 26 L36 44 L60 12 L84 44 L112 26 L106 62 Z", { fill: kleur }),
    pad("M14 68 H106 V76 H14 Z", { fill: kleur }),
    ...[
      [8, 20],
      [60, 6],
      [112, 20],
    ].map(([cx, cy]) => createElement("circle", { key: `${cx}`, cx, cy, r: 5.5, fill: kleur })),
  );
}

/** Een bliksemschicht. 60 × 100. */
export function bliksem(hoogte: number, kleur: string): ReactElement {
  return svg(hoogte * 0.6, hoogte, "0 0 60 100", pad("M40 0 L4 56 L27 56 L16 100 L57 38 L33 38 Z", { fill: kleur }));
}

/** Drie snelheidsstrepen, schuin afgesneden, rechts uitgelijnd. 120 × 78. */
export function strepen(breedte: number, kleur: string): ReactElement {
  return svg(breedte, breedte * 0.65, "0 0 120 78", pad("M46 0 H120 L113 18 H39 Z", { fill: kleur }), pad("M8 30 H108 L101 48 H1 Z", { fill: kleur }), pad("M56 60 H96 L89 78 H49 Z", { fill: kleur }));
}

/** Een schild als lijn. 100 × 120. */
export function schild(breedte: number, kleur: string, lijn = 5): ReactElement {
  return svg(breedte, breedte * 1.2, "0 0 100 120", pad("M50 5 L92 19 V58 C92 85 74 103 50 115 C26 103 8 85 8 58 V19 Z", { fill: "none", stroke: kleur, strokeWidth: lijn, strokeLinejoin: "miter" }));
}

/** Een lauwerkrans: twee takken met blaadjes, onderaan open. 200 × 200. */
export function lauwer(doorsnee: number, kleur: string): ReactElement {
  const blad: ReactNode[] = [];
  for (let i = 0; i < 11; i++) {
    const hoek = 104 + i * 15.2; // vanaf linksonder omhoog, in graden (0 = rechts, met de klok mee)
    const rad = (hoek * Math.PI) / 180;
    const cx = 100 + 84 * Math.cos(rad);
    const cy = 100 + 84 * Math.sin(rad);
    const draai = hoek + 90 + 30;
    const ry = 16.5 - i * 0.75;
    const rx = 5.6 - i * 0.18;
    blad.push(createElement("ellipse", { key: `l${i}`, cx: r2(cx), cy: r2(cy), rx: r2(rx), ry: r2(ry), fill: kleur, transform: `rotate(${r2(draai)} ${r2(cx)} ${r2(cy)})` }));
    blad.push(createElement("ellipse", { key: `r${i}`, cx: r2(200 - cx), cy: r2(cy), rx: r2(rx), ry: r2(ry), fill: kleur, transform: `rotate(${r2(-draai)} ${r2(200 - cx)} ${r2(cy)})` }));
  }
  // de twee takken, dun, van onder naar boven
  const tak = { fill: "none", stroke: kleur, strokeWidth: 2.2, strokeLinecap: "round" };
  return svg(doorsnee, doorsnee, "0 0 200 200", pad("M92 176 A78 78 0 0 1 62 32", tak), pad("M108 176 A78 78 0 0 0 138 32", tak), ...blad);
}

/** Eén vleugel van vier veren; `spiegel` geeft de rechtervleugel. 100 × 64. */
export function vleugel(breedte: number, kleur: string, spiegel = false): ReactElement {
  const veren = [0, 1, 2, 3, 4].map((i) => {
    const y = 1 + i * 12.4;
    const x = i * 15;
    return pad(`M${x} ${y} L100 ${y + 6} L100 ${y + 14.5} L${x + 12} ${y + 9.5} Z`, { key: i, fill: kleur });
  });
  return svg(breedte, breedte * 0.64, "0 0 100 64", createElement("g", spiegel ? { transform: "translate(100 0) scale(-1 1)" } : {}, ...veren));
}

/** Een zegelring: twee cirkels die in het midden open zijn voor een band met tekst. 200 × 200; de opening loopt van y 78 tot 122. */
export function zegelring(doorsnee: number, kleur: string): ReactElement {
  const dik = { fill: "none", stroke: kleur, strokeWidth: 6 };
  const dun = { fill: "none", stroke: kleur, strokeWidth: 2.2 };
  return svg(
    doorsnee,
    doorsnee,
    "0 0 200 200",
    pad("M9.7 78 A93 93 0 0 1 190.3 78", dik),
    pad("M9.7 122 A93 93 0 0 0 190.3 122", dik),
    pad("M20.5 78 A82.5 82.5 0 0 1 179.5 78", dun),
    pad("M20.5 122 A82.5 82.5 0 0 0 179.5 122", dun),
    pad("M8 78 H192 M8 122 H192", { fill: "none", stroke: kleur, strokeWidth: 3 }),
  );
}

/** Een dunne cirkel. */
export function cirkel(doorsnee: number, kleur: string, lijn = 2): ReactElement {
  return svg(doorsnee, doorsnee, "0 0 100 100", createElement("circle", { cx: 50, cy: 50, r: 50 - lijn, fill: "none", stroke: kleur, strokeWidth: lijn }), createElement("circle", { cx: 50, cy: 50, r: 50 - lijn * 4.2, fill: "none", stroke: kleur, strokeWidth: lijn * 0.45 }));
}

/** Een wig als onderstreping: links dun, rechts dik. */
export function veeg(breedte: number, hoogte: number, kleur: string): ReactElement {
  const w = r2(breedte);
  const h = r2(hoogte);
  return svg(breedte, hoogte, `0 0 ${w} ${h}`, pad(`M0 ${r2(h * 0.62)} C${r2(w * 0.3)} ${r2(h * 0.2)} ${r2(w * 0.7)} 0 ${w} 0 L${w} ${r2(h * 0.7)} C${r2(w * 0.7)} ${r2(h * 0.6)} ${r2(w * 0.3)} ${r2(h * 0.72)} 0 ${r2(h * 0.9)} Z`, { fill: kleur }));
}
