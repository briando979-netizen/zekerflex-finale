// De paspop als tekening: een lichaam op jouw maten (lengte, borst, taille,
// heup) en kledingstukken die op precies dat lichaam vallen. Puur: alleen
// rekenwerk en SVG-paden, zodat de paskamer het tekent en het getest kan worden.
// Een maat te groot tekent het stuk ruimer en langer, een maat te klein smaller:
// dan zie je het lichaam aan de zijkant (zo zie je dat het niet past).

import type { Lichaam, Maten, Slot, Soort } from "@/lib/shop/paskamer";

export const DOEK = { w: 400, h: 1000 } as const;
const TOP = 40;
const ZOOL = 960;
const LENGTE_PX = ZOOL - TOP;

type P = readonly [number, number];
export type Vorm = {
  d: string;
  fill: string;
  /** krijgt de stofschaduw (randen iets donkerder) */
  schaduw?: boolean;
  opacity?: number;
  stroke?: string;
  sw?: number;
  dash?: string;
};
export type Tekening = { achter: Vorm[]; voor: Vorm[] };

/** Catmull-Rom door de punten → vloeiend SVG-pad. */
export function vloeiend(pts: readonly P[], dicht = true): string {
  const n = pts.length;
  if (n < 2) return "";
  const at = (i: number): P => (dicht ? (pts[((i % n) + n) % n] as P) : (pts[Math.max(0, Math.min(n - 1, i))] as P));
  const f = (v: number) => Math.round(v * 10) / 10;
  let d = `M${f(at(0)[0])},${f(at(0)[1])}`;
  const last = dicht ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return dicht ? `${d} Z` : d;
}

/** Rechte lijnen door de punten (voor naden, banden en zakken). */
export function hoekig(pts: readonly P[], dicht = true): string {
  const f = (v: number) => Math.round(v * 10) / 10;
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${f(p[0])},${f(p[1])}`).join(" ") + (dicht ? " Z" : "");
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Interpoleer een waarde op y tussen sleutelpunten [y, waarde] (oplopend in y). */
function opY(keys: readonly P[], y: number): number {
  const first = keys[0] as P;
  const last = keys[keys.length - 1] as P;
  if (y <= first[0]) return first[1];
  if (y >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1] as P;
    const b = keys[i] as P;
    if (y <= b[0]) return lerp(a[1], b[1], (y - a[0]) / (b[0] - a[0] || 1));
  }
  return last[1];
}
const spiegel = (pts: readonly P[], cx: number): P[] => [...pts].reverse().map(([x, y]) => [2 * cx - x, y] as P);

export type Figuur = {
  cx: number;
  /** pixels per centimeter lichaamslengte */
  s: number;
  kind: boolean;
  hoofd: { cx: number; cy: number; rx: number; ry: number };
  y: { kin: number; schouder: number; borst: number; taille: number; heup: number; kruis: number; knie: number; kuit: number; enkel: number; zool: number; elleboog: number; pols: number; top: number; ogen: number };
  half: { nek: number; schouder: number; borst: number; taille: number; heup: number };
  /** halve rompbreedte op hoogte y */
  romp: (y: number) => number;
  /** middenlijn en breedte van de arm; t = 0 schouder … 1 pols; kant = 1 rechts (kijker), -1 links */
  arm: (t: number, kant: 1 | -1) => { x: number; y: number; w: number };
  /** middenlijn en breedte van het been op hoogte y */
  been: (y: number, kant: 1 | -1) => { x: number; w: number };
};

const VERHOUDING = {
  volwassen: { kin: 0.13, schouder: 0.18, borst: 0.27, taille: 0.385, heup: 0.47, kruis: 0.53, knie: 0.72, enkel: 0.955, elleboog: 0.385, pols: 0.49, top: 0.6 },
  kind: { kin: 0.165, schouder: 0.215, borst: 0.3, taille: 0.41, heup: 0.49, kruis: 0.55, knie: 0.73, enkel: 0.955, elleboog: 0.41, pols: 0.51, top: 0.615 },
};

export function figuur(l: Lichaam, m: Maten): Figuur {
  const kind = l.silhouet === "kind";
  const v = VERHOUDING[kind ? "kind" : "volwassen"];
  const cx = DOEK.w / 2;
  const s = LENGTE_PX / Math.max(80, Math.min(220, l.lengte));
  const Y = (f: number) => TOP + f * LENGTE_PX;
  const y = {
    kin: Y(v.kin),
    schouder: Y(v.schouder),
    borst: Y(v.borst),
    taille: Y(v.taille),
    heup: Y(v.heup),
    kruis: Y(v.kruis),
    knie: Y(v.knie),
    kuit: Y(v.knie + (v.enkel - v.knie) * 0.3),
    enkel: Y(v.enkel),
    zool: ZOOL,
    elleboog: Y(v.elleboog),
    pols: Y(v.pols),
    top: Y(v.top),
    ogen: 0,
  };
  const ry = (y.kin - TOP) / 2;
  const hoofd = { cx, cy: TOP + ry, rx: ry * (kind ? 0.86 : 0.8), ry };
  y.ogen = hoofd.cy - ry * 0.1;

  const borst = m.borst * (l.silhouet === "dames" ? 0.155 : 0.16) * s;
  const taille = m.taille * 0.165 * s;
  const heup = m.heup * (l.silhouet === "dames" ? 0.17 : 0.168) * s;
  const half = {
    nek: m.borst * (l.silhouet === "dames" ? 0.045 : 0.05) * s,
    schouder: borst * (l.silhouet === "heren" ? 1.3 : l.silhouet === "dames" ? 1.17 : 1.18),
    borst,
    taille: Math.min(taille, borst * 1.15),
    heup,
  };

  const zijde: P[] = [
    [y.schouder - 8, half.nek],
    [y.schouder - 2, half.schouder * 0.7],
    [y.schouder + 4, half.schouder - 6],
    [y.schouder + 20, half.schouder],
    [y.borst - 22, half.borst + 4],
    [y.borst, half.borst],
    [y.taille, half.taille],
    [y.heup, half.heup],
    [y.kruis, half.heup * 0.98],
  ];
  const romp = (yy: number) => opY(zijde, yy);

  const bovenarm = m.borst * 0.105 * s * (kind ? 0.95 : 1);
  const armBreed = Math.max(half.borst, half.taille);
  const gewrichten = (kant: 1 | -1) => ({
    schouder: { x: cx + kant * (half.schouder - bovenarm * 0.45), y: y.schouder + 14, w: bovenarm },
    elleboog: { x: cx + kant * (armBreed + bovenarm * 0.75 * 0.5 + 7), y: y.elleboog, w: bovenarm * 0.75 },
    pols: { x: cx + kant * (half.heup + bovenarm * 0.48 * 0.5 + 8), y: y.pols, w: bovenarm * 0.48 },
  });
  const arm = (t: number, kant: 1 | -1) => {
    const g = gewrichten(kant);
    const tt = Math.max(0, Math.min(1, t));
    const [a, b, u] = tt <= 0.5 ? [g.schouder, g.elleboog, tt / 0.5] : [g.elleboog, g.pols, (tt - 0.5) / 0.5];
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u) };
  };

  const knieW = half.heup * 0.43;
  const kuitW = half.heup * 0.5;
  const enkelW = half.heup * 0.24;
  const beenKeys = {
    x: [[y.kruis - 30, 0.5], [y.kruis, 0.5], [lerp(y.kruis, y.knie, 0.4), 0.47], [y.knie, 0.42], [y.kuit, 0.42], [y.enkel, 0.4]] as P[],
    w: [[y.kruis - 30, half.heup], [y.kruis, half.heup * 0.98], [lerp(y.kruis, y.knie, 0.4), half.heup * 0.76], [y.knie, knieW], [y.kuit, kuitW], [y.enkel, enkelW]] as P[],
  };
  const been = (yy: number, kant: 1 | -1) => ({ x: cx + kant * opY(beenKeys.x, yy) * half.heup, w: opY(beenKeys.w, yy) });

  return { cx, s, kind, hoofd, y, half, romp, arm, been };
}

// ---------------------------------------------------------------------------
// Het lichaam
// ---------------------------------------------------------------------------

export type Lijf = { romp: string; armen: string[]; handen: string[]; benen: string[]; voeten: string[]; nek: string };

function armPunten(f: Figuur, kant: 1 | -1, t1 = 1, extra = 0): P[] {
  const ts = [0, 0.15, 0.32, 0.5, 0.68, 0.85, 1].filter((t) => t <= t1).concat(t1 < 1 ? [t1] : []);
  const buiten = ts.map((t) => {
    const a = f.arm(t, kant);
    return [a.x + kant * (a.w / 2 + extra), a.y] as P;
  });
  const binnen = ts.map((t) => {
    const a = f.arm(t, kant);
    return [a.x - kant * (a.w / 2 + extra), a.y] as P;
  });
  const top = f.arm(0, kant);
  return [[top.x, f.y.schouder - 3 - extra * 0.5], ...buiten, ...binnen.reverse()];
}

function handPad(f: Figuur, kant: 1 | -1, extra = 0): string {
  const pols = f.arm(1, kant);
  const tip = { x: pols.x - kant * 2, y: f.y.top };
  const w = pols.w;
  const len = tip.y - pols.y;
  return vloeiend([
    [pols.x - w / 2 - extra, pols.y - 4],
    [pols.x + w / 2 + extra, pols.y - 4],
    [lerp(pols.x, tip.x, 0.4) + w * 0.66 + extra, pols.y + len * 0.42],
    [tip.x + w * 0.42 + extra, pols.y + len * 0.86],
    [tip.x, tip.y + extra],
    [tip.x - w * 0.42 - extra, pols.y + len * 0.86],
    [lerp(pols.x, tip.x, 0.4) - w * 0.62 - extra, pols.y + len * 0.4],
  ]);
}

function beenPunten(f: Figuur, kant: 1 | -1, y0: number, y1: number, extra = 0, recht = 0): P[] {
  const ys = [y0, f.y.kruis, lerp(f.y.kruis, f.y.knie, 0.4), f.y.knie, f.y.kuit, lerp(f.y.kuit, f.y.enkel, 0.6), f.y.enkel].filter((yy) => yy >= y0 && yy <= y1);
  if (ys[ys.length - 1] !== y1) ys.push(y1);
  const minHalf = recht > 0 ? (f.been(f.y.knie, kant).w / 2) * recht : 0;
  const halfOp = (yy: number) => Math.max(f.been(yy, kant).w / 2 + extra, yy > f.y.knie ? minHalf + extra : 0);
  const buiten = ys.map((yy) => [f.been(yy, kant).x + kant * halfOp(yy), yy] as P);
  const binnen = ys.map((yy) => [f.been(yy, kant).x - kant * halfOp(yy), yy] as P);
  return [...buiten, ...binnen.reverse()];
}

function voetPad(f: Figuur, kant: 1 | -1, extra = 0, hoogte = 0): string {
  const e = f.been(f.y.enkel, kant);
  const x = e.x + kant * 4;
  const top = f.y.enkel - 6 - hoogte;
  const z = f.y.zool;
  const half = e.w / 2;
  return vloeiend([
    [x - half - extra, top],
    [x + half + extra, top],
    [x + kant * 3 + half + 7 + extra, z - 12],
    [x + kant * 6 + half + 6 + extra, z + extra * 0.3],
    [x + kant * 2 - half - 8 - extra, z + extra * 0.3],
    [x - kant * 1 - half - 8 - extra, z - 12],
  ]);
}

export function lijf(f: Figuur, l: Lichaam): Lijf {
  const { cx, y, half } = f;
  const rechts: P[] = [
    [cx + half.nek, y.schouder - 8],
    [cx + half.schouder * 0.7, y.schouder - 2],
    [cx + half.schouder - 6, y.schouder + 4],
    [cx + half.schouder, y.schouder + 20],
    [cx + half.borst + 4, y.borst - 22],
    [cx + half.borst, y.borst],
    ...(l.silhouet === "dames" ? ([[cx + half.borst + 1, y.borst + 14]] as P[]) : []),
    [cx + half.taille, y.taille],
    [cx + half.heup, y.heup],
    [cx + half.heup * 0.98, y.kruis - 6],
    [cx + half.heup * 0.3, y.kruis + 4],
  ];
  const romp = vloeiend([...rechts, [cx, y.kruis + 6], ...spiegel(rechts, cx)]);
  const nek = vloeiend([
    [cx - half.nek * 0.92, y.kin - 22],
    [cx + half.nek * 0.92, y.kin - 22],
    [cx + half.nek, y.schouder - 6],
    [cx + half.nek * 1.5, y.schouder + 4],
    [cx - half.nek * 1.5, y.schouder + 4],
    [cx - half.nek, y.schouder - 6],
  ]);
  const zijden = [1, -1] as const;
  return {
    romp,
    nek,
    armen: zijden.map((k) => vloeiend(armPunten(f, k))),
    handen: zijden.map((k) => handPad(f, k)),
    benen: zijden.map((k) => vloeiend(beenPunten(f, k, y.kruis - 30, y.enkel + 4))),
    voeten: zijden.map((k) => voetPad(f, k)),
  };
}

// ---------------------------------------------------------------------------
// Kleding
// ---------------------------------------------------------------------------

/** Iets donkerder of lichter maken van een hex-kleur (factor < 1 = donkerder). */
export function tint(hex: string, factor: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1] ?? "000000", 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    const v = factor < 1 ? c * factor : c + (255 - c) * (factor - 1);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `#${[ch(16), ch(8), ch(0)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
/** Lichte kleur? Dan krijgen naden een donkere lijn in plaats van een lichte. */
export function isLicht(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1] ?? "000000", 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
}

type Boven = {
  ruimte: number; // extra halve breedte in px
  zoom: number; // y van de zoom (onderrand)
  mouw: number; // 0 = mouwloos, anders t langs de arm (1 = pols)
  hals: "rond" | "v" | "kraag" | "hoog" | "open";
  recht: number; // 0 = getailleerd … 1 = recht vanaf de borst
};

/** Romp-, mouw- en halspaden van een bovenstuk dat op de figuur valt. */
function bovenstuk(f: Figuur, b: Boven) {
  const { cx, y, half } = f;
  const e = b.ruimte;
  const halsDiep = b.hals === "v" ? y.borst - 6 : b.hals === "open" ? y.taille - 10 : b.hals === "kraag" ? y.schouder + 18 : b.hals === "hoog" ? y.schouder - 16 : y.schouder + 8;
  const halsBreed = half.nek + (b.hals === "hoog" ? 4 : 8);
  const zij = (yy: number) => {
    const lichaam = f.romp(yy);
    const vanaf = yy > y.borst ? lerp(lichaam, half.borst, b.recht) : lichaam;
    return Math.max(lichaam, vanaf) + e;
  };
  const tot = Math.max(b.zoom, y.borst + 30);
  const mouwloos = b.mouw <= 0;
  const rechts: P[] = [
    [cx + halsBreed, b.hals === "hoog" ? y.schouder - 18 : y.schouder - 9],
    [cx + half.schouder * 0.72 + e * 0.3, y.schouder - 4],
    [cx + half.schouder + e * 0.6 - (mouwloos ? 14 : 0), y.schouder + (mouwloos ? 6 : 14)],
    ...(mouwloos ? ([[cx + half.borst + e * 0.6 - 4, y.borst - 26]] as P[]) : ([[cx + half.borst + e + 2, y.borst - 18]] as P[])),
    [cx + zij(y.borst), y.borst],
    ...(tot > y.taille ? ([[cx + zij(y.taille), y.taille]] as P[]) : []),
    ...(tot > y.heup - 10 ? ([[cx + zij(Math.min(tot, y.heup)), Math.min(tot, y.heup)]] as P[]) : []),
    [cx + zij(tot) + 1, tot],
    [cx + zij(tot) * 0.5, tot + 3],
  ];
  // rechts van de hals naar de zoom, dan gespiegeld links omhoog, en via het halsdiepste punt dicht
  const omtrek: P[] = [...rechts, [cx, tot + 4], ...spiegel(rechts, cx), [cx, halsDiep]];
  // een dikkere laag (fleece, jas) krijgt naar verhouding ruimere mouwen, zodat de mouw eronder niet doorpiept
  const mouwen = mouwloos ? [] : ([1, -1] as const).map((k) => vloeiend(armPunten(f, k, b.mouw, 4 + e * (e > 8 ? 0.55 : 0.45))));
  return { romp: vloeiend(omtrek), mouwen, tot, halsDiep, halsBreed, zij };
}

const lijn = (d: string, stroke: string, sw = 1.4, dash?: string): Vorm => ({ d, fill: "none", stroke, sw, ...(dash ? { dash } : {}) });

/**
 * Tekening van één kledingstuk op de figuur. `ruimteCm` komt uit het
 * maatadvies (+ = de gekozen maat is ruimer dan je lijf, − = krapper).
 */
export function kledingstuk(f: Figuur, soort: Soort, kleur: string, accent: string | undefined, ruimteCm: number): Tekening {
  const { cx, y, half, s } = f;
  const r = Math.max(-8, Math.min(24, ruimteCm));
  // omtrek in cm → halve breedte in px (voorkant ≈ 0,16 × omtrek); krap mag het lijf laten zien
  const breder = r * 0.16 * s;
  const langer = r * 1.1;
  const naad = isLicht(kleur) ? tint(kleur, 0.78) : tint(kleur, 1.35);
  const donker = tint(kleur, 0.82);
  const achter: Vorm[] = [];
  const voor: Vorm[] = [];

  const top = (b: Boven, opts: { manchet?: boolean; boord?: boolean } = {}) => {
    const g = bovenstuk(f, { ...b, ruimte: b.ruimte + breder });
    for (const m of g.mouwen) voor.push({ d: m, fill: kleur, schaduw: true });
    voor.push({ d: g.romp, fill: kleur, schaduw: true });
    if (r < -2.5) {
      // trekplooien: de stof spant over borst en buik
      const w = half.borst * 0.85;
      for (const k of [1, -1] as const) {
        voor.push(lijn(`M${cx + k * 6},${y.borst + 8} q${k * w * 0.5},${-10} ${k * w},${-22} M${cx + k * 6},${y.taille - 6} q${k * w * 0.5},${-8} ${k * w},${-18}`, tint(kleur, 0.7), 1.6));
      }
    }
    if (opts.manchet && b.mouw > 0.9) {
      for (const k of [1, -1] as const) {
        const a = f.arm(b.mouw, k);
        const w = a.w / 2 + 4 + (b.ruimte + breder) * 0.45;
        voor.push({ d: hoekig([[a.x - w, a.y - 12], [a.x + w, a.y - 12], [a.x + w, a.y], [a.x - w, a.y]]), fill: donker });
      }
    }
    if (opts.boord) {
      const w = g.zij(g.tot);
      voor.push({ d: hoekig([[cx - w, g.tot - 12], [cx + w, g.tot - 12], [cx + w + 1, g.tot + 3], [cx - w - 1, g.tot + 3]]), fill: donker });
    }
    return g;
  };

  switch (soort) {
    case "tshirt": {
      const g = top({ ruimte: 6, zoom: y.heup + 8 + langer, mouw: 0.3 + r * 0.004, hals: "rond", recht: 0.75 });
      voor.push(lijn(vloeiend([[cx - g.halsBreed, y.schouder - 9], [cx, g.halsDiep + 4], [cx + g.halsBreed, y.schouder - 9]], false), naad, 3));
      if (accent) voor.push({ d: `M${cx + half.borst * 0.42},${y.borst - 6} m-9,0 a9,9 0 1,0 18,0 a9,9 0 1,0 -18,0`, fill: accent });
      break;
    }
    case "overhemd":
    case "blouse": {
      const dames = soort === "blouse";
      const g = top({ ruimte: dames ? 3 : 4, zoom: y.heup + 2 + langer, mouw: 1, hals: dames ? "v" : "kraag", recht: dames ? 0.25 : 0.55 }, { manchet: true });
      // kraag: twee punten over de hals
      for (const k of [1, -1] as const) {
        voor.push({ d: vloeiend([[cx + k * (half.nek + 6), y.schouder - 12], [cx + k * (half.nek + 14), y.schouder + 2], [cx + k * 4, dames ? y.schouder + 28 : y.schouder + 22]]), fill: tint(kleur, 0.96), stroke: naad, sw: 1 });
      }
      voor.push(lijn(`M${cx},${dames ? g.halsDiep : y.schouder + 20} L${cx},${g.tot}`, naad, 1.2));
      for (let yy = (dames ? g.halsDiep : y.schouder + 30) + 8; yy < g.tot - 8; yy += 34) voor.push({ d: `M${cx - 2.6},${yy} a2.6,2.6 0 1,0 5.2,0 a2.6,2.6 0 1,0 -5.2,0`, fill: naad });
      break;
    }
    case "hoodie": {
      const g = top({ ruimte: 10, zoom: y.heup + 14 + langer, mouw: 1, hals: "rond", recht: 0.85 }, { manchet: true, boord: true });
      achter.push({ d: vloeiend([[cx - half.nek - 30, y.schouder + 4], [cx - half.nek - 18, y.kin - 2], [cx, y.kin - 12], [cx + half.nek + 18, y.kin - 2], [cx + half.nek + 30, y.schouder + 4]]), fill: donker, schaduw: true });
      const pw = half.borst * 0.62 + breder * 0.5;
      const py = lerp(y.taille, g.tot, 0.15);
      voor.push({ d: vloeiend([[cx - pw, g.tot - 16], [cx - pw * 0.82, py], [cx + pw * 0.82, py], [cx + pw, g.tot - 16]]), fill: donker, opacity: 0.55 });
      voor.push(lijn(`M${cx - 10},${y.schouder + 6} l-3,58 M${cx + 10},${y.schouder + 6} l3,58`, accent ?? naad, 2.2));
      break;
    }
    case "overshirt":
    case "fleece":
    case "softshell": {
      const jas = soort === "softshell";
      const g = top({ ruimte: jas ? 12 : 9, zoom: (jas ? y.heup + 26 : soort === "overshirt" ? y.heup + 18 : y.heup + 8) + langer, mouw: 1, hals: soort === "overshirt" ? "kraag" : "hoog", recht: 0.9 }, { manchet: true, boord: soort === "fleece" });
      if (soort === "overshirt") {
        for (const k of [1, -1] as const) {
          voor.push({ d: vloeiend([[cx + k * (half.nek + 6), y.schouder - 12], [cx + k * (half.nek + 16), y.schouder + 4], [cx + k * 5, y.schouder + 24]]), fill: donker });
          const px = cx + k * half.borst * 0.48;
          voor.push({ d: hoekig([[px - 17, y.borst - 14], [px + 17, y.borst - 14], [px + 17, y.borst + 18], [px, y.borst + 24], [px - 17, y.borst + 18]]), fill: donker, opacity: 0.8 });
        }
        for (let yy = y.schouder + 34; yy < g.tot - 8; yy += 36) voor.push({ d: `M${cx - 3},${yy} a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0`, fill: naad });
        voor.push(lijn(`M${cx},${y.schouder + 22} L${cx},${g.tot}`, naad, 1.2));
      } else {
        voor.push({ d: hoekig([[cx - half.nek - 6, y.schouder - 18], [cx + half.nek + 6, y.schouder - 18], [cx + half.nek + 10, y.schouder + 4], [cx - half.nek - 10, y.schouder + 4]]), fill: donker });
        voor.push(lijn(`M${cx},${y.schouder - 18} L${cx},${g.tot + 2}`, accent ?? naad, 2.4));
        if (jas) {
          for (const k of [1, -1] as const) voor.push(lijn(`M${cx + k * half.borst * 0.3},${y.borst - 4} l${k * 26},${-16}`, accent ?? naad, 2));
          for (const k of [1, -1] as const) voor.push(lijn(`M${cx + k * (half.taille * 0.55)},${y.heup - 4} l${k * 4},${34}`, naad, 1.6));
        }
      }
      break;
    }
    case "bodywarmer": {
      const g = top({ ruimte: 14, zoom: y.heup + 10 + langer, mouw: 0, hals: "hoog", recht: 0.95 });
      for (let yy = y.schouder + 30; yy < g.tot - 6; yy += 34) {
        const w = g.zij(yy) - 2;
        voor.push(lijn(`M${cx - w},${yy} Q${cx},${yy + 5} ${cx + w},${yy}`, tint(kleur, 1.5), 1.3));
      }
      voor.push({ d: hoekig([[cx - half.nek - 7, y.schouder - 20], [cx + half.nek + 7, y.schouder - 20], [cx + half.nek + 11, y.schouder + 4], [cx - half.nek - 11, y.schouder + 4]]), fill: donker });
      voor.push(lijn(`M${cx},${y.schouder - 20} L${cx},${g.tot + 2}`, accent ?? tint(kleur, 1.6), 2.2));
      break;
    }
    case "hesje": {
      const g = top({ ruimte: 18, zoom: y.heup + 4 + langer * 0.5, mouw: 0, hals: "v", recht: 1 });
      const zilver = accent ?? "#c9ced3";
      for (const yy of [y.borst + 20, y.taille + 22]) {
        const w = g.zij(yy + 6);
        voor.push({ d: hoekig([[cx - w, yy], [cx - 4, yy], [cx - 4, yy + 13], [cx - w, yy + 13]]), fill: zilver });
        voor.push({ d: hoekig([[cx + 4, yy], [cx + w, yy], [cx + w, yy + 13], [cx + 4, yy + 13]]), fill: zilver });
      }
      for (const k of [1, -1] as const) {
        const x = cx + k * half.borst * 0.55;
        voor.push({ d: hoekig([[x - 7, y.schouder - 2], [x + 7, y.schouder - 2], [x + 7, y.borst + 20], [x - 7, y.borst + 20]]), fill: zilver });
      }
      voor.push(lijn(`M${cx},${g.halsDiep} L${cx},${g.tot}`, tint(kleur, 0.7), 1.5));
      break;
    }
    case "chino":
    case "werkbroek":
    case "thermobroek": {
      const band = lerp(y.taille, y.heup, f.kind ? 0.2 : 0.35);
      const e = (soort === "werkbroek" ? 6 : 4) + breder;
      const zoom = y.enkel + 2 - Math.max(0, -r) * 0.6;
      const rechts = beenPunten(f, 1, y.kruis, zoom, e, 0.95);
      const links = beenPunten(f, -1, y.kruis, zoom, e, 0.95);
      const n = rechts.length / 2;
      const rBuiten = rechts.slice(0, n);
      const rBinnen = rechts.slice(n);
      const lBuiten = links.slice(0, n);
      const lBinnen = links.slice(n);
      const heupR = f.romp(band) + e;
      // buiten = van het kruis naar de zoom, binnen = van de zoom terug naar het kruis.
      // Rechts: heup → buitenkant omlaag → binnenkant omhoog → kruis; links in omgekeerde volgorde.
      const omtrek: P[] = [
        [cx + heupR, band],
        [cx + half.heup + e, y.heup],
        ...rBuiten,
        ...rBinnen.slice(0, -1),
        [cx, y.kruis + 10],
        ...[...lBinnen].reverse().slice(1),
        ...[...lBuiten].reverse(),
        [cx - half.heup - e, y.heup],
        [cx - heupR, band],
      ];
      voor.push({ d: vloeiend(omtrek), fill: kleur, schaduw: true });
      voor.push({ d: hoekig([[cx - heupR, band], [cx + heupR, band], [cx + heupR + 1, band + 11], [cx - heupR - 1, band + 11]]), fill: donker });
      for (const k of [1, -1] as const) {
        const b = f.been(f.y.knie, k);
        if (soort === "werkbroek") {
          const w = b.w / 2 + e - 3;
          voor.push({ d: hoekig([[b.x - w, y.knie - 30], [b.x + w, y.knie - 30], [b.x + w, y.knie + 26], [b.x - w, y.knie + 26]]), fill: accent ?? donker, opacity: 0.9 });
          const zx = f.been(lerp(y.kruis, y.knie, 0.4), k);
          voor.push({ d: hoekig([[zx.x + k * (zx.w / 2 + e - 2), lerp(y.kruis, y.knie, 0.25)], [zx.x + k * (zx.w / 2 + e - 32), lerp(y.kruis, y.knie, 0.25)], [zx.x + k * (zx.w / 2 + e - 32), lerp(y.kruis, y.knie, 0.65)], [zx.x + k * (zx.w / 2 + e - 2), lerp(y.kruis, y.knie, 0.65)]]), fill: donker, opacity: 0.7 });
          voor.push(lijn(`M${b.x - w},${y.knie - 30} L${b.x + w},${y.knie - 30} M${b.x - w},${y.knie + 26} L${b.x + w},${y.knie + 26}`, tint(kleur, 1.6), 1, "4 3"));
        } else if (soort === "chino") {
          voor.push(lijn(`M${f.been(y.kruis + 40, k).x},${y.kruis + 40} L${f.been(zoom, k).x},${zoom - 4}`, donker, 1.2));
          voor.push(lijn(`M${cx + k * (heupR - 22)},${band + 11} q${k * 10},${30} ${k * 24},${44}`, donker, 1.4));
        } else {
          const z = f.been(zoom, k);
          const w = z.w / 2 + e + 1;
          voor.push({ d: hoekig([[z.x - w, zoom - 16], [z.x + w, zoom - 16], [z.x + w, zoom], [z.x - w, zoom]]), fill: donker });
        }
      }
      if (soort === "chino") for (const x of [-heupR + 18, -18, 18, heupR - 18]) voor.push({ d: hoekig([[cx + x - 3, band - 2], [cx + x + 3, band - 2], [cx + x + 3, band + 13], [cx + x - 3, band + 13]]), fill: tint(kleur, 0.7) });
      break;
    }
    case "riem": {
      const band = lerp(y.taille, y.heup, f.kind ? 0.2 : 0.35);
      const w = f.romp(band) + 6;
      voor.push({ d: hoekig([[cx - w, band + 1], [cx + w, band + 1], [cx + w, band + 10], [cx - w, band + 10]]), fill: kleur });
      voor.push({ d: hoekig([[cx - 11, band - 2], [cx + 11, band - 2], [cx + 11, band + 13], [cx - 11, band + 13]]), fill: "none", stroke: accent ?? "#c9b27c", sw: 3 });
      break;
    }
    case "kniebeschermer": {
      for (const k of [1, -1] as const) {
        const b = f.been(y.knie, k);
        const w = b.w / 2 + 9;
        voor.push({ d: vloeiend([[b.x - w, y.knie - 24], [b.x + w, y.knie - 24], [b.x + w + 2, y.knie + 4], [b.x + w, y.knie + 26], [b.x - w, y.knie + 26], [b.x - w - 2, y.knie + 4]]), fill: kleur, schaduw: true });
        voor.push(lijn(`M${b.x - w},${y.knie - 12} L${b.x + w},${y.knie - 12} M${b.x - w},${y.knie + 16} L${b.x + w},${y.knie + 16}`, tint(kleur, 1.7), 2));
      }
      break;
    }
    case "sokken": {
      for (const k of [1, -1] as const) {
        voor.push({ d: vloeiend(beenPunten(f, k, y.enkel - 46, y.enkel + 2, 1.5)), fill: kleur });
        voor.push({ d: voetPad(f, k, 1.5), fill: kleur, schaduw: true });
        const b = f.been(y.enkel - 44, k);
        voor.push(lijn(`M${b.x - b.w / 2 - 1},${y.enkel - 40} L${b.x + b.w / 2 + 1},${y.enkel - 40}`, tint(kleur, 1.5), 2));
      }
      break;
    }
    case "werkschoen":
    case "sneaker":
    case "antislip": {
      const hoog = soort === "werkschoen" ? 34 : soort === "sneaker" ? 6 : 2;
      const zool = accent ?? "#d9c3a0";
      for (const k of [1, -1] as const) {
        const extra = 7 + Math.max(-2, Math.min(4, r)) * 1.4;
        if (soort === "werkschoen") voor.push({ d: vloeiend(beenPunten(f, k, y.enkel - hoog, y.enkel, 7)), fill: kleur, schaduw: true });
        voor.push({ d: voetPad(f, k, extra, hoog * 0.15), fill: kleur, schaduw: true });
        const e = f.been(y.enkel, k);
        const x = e.x + k * 4;
        const w = e.w / 2 + 9 + extra;
        voor.push({ d: hoekig([[x - w - 1, y.zool - 9], [x + w + 1 + k * 4, y.zool - 9], [x + w + k * 4, y.zool + 3], [x - w, y.zool + 3]]), fill: soort === "antislip" ? tint(kleur, 1.4) : zool });
        if (soort !== "antislip") voor.push(lijn(`M${x - 5},${y.enkel - hoog + 6} l10,6 m-10,6 l10,6 m-10,6 l10,6`, tint(kleur, 1.6), 1.4));
        if (soort === "sneaker") voor.push(lijn(`M${x - w + 4},${y.zool - 16} q${w},${-14} ${2 * w - 6},${-2}`, accent ?? "#f1f1ee", 2.4));
      }
      break;
    }
    case "handschoen":
    case "snijhandschoen": {
      for (const k of [1, -1] as const) {
        voor.push({ d: handPad(f, k, 2.5), fill: kleur, schaduw: true });
        const p = f.arm(0.94, k);
        const w = p.w / 2 + 4;
        voor.push({ d: hoekig([[p.x - w, p.y - 6], [p.x + w, p.y - 6], [p.x + w, p.y + 14], [p.x - w, p.y + 14]]), fill: tint(kleur, 0.85) });
        // gecoate vingers
        const pols = f.arm(1, k);
        const len = y.top - pols.y;
        voor.push({ d: vloeiend([[pols.x - pols.w * 0.75, pols.y + len * 0.55], [pols.x + pols.w * 0.75, pols.y + len * 0.55], [pols.x + pols.w * 0.5, pols.y + len * 0.9], [pols.x - k * 2, y.top + 2.5], [pols.x - pols.w * 0.5, pols.y + len * 0.9]]), fill: accent ?? donker, opacity: 0.92 });
      }
      break;
    }
    case "pet": {
      const h = f.hoofd;
      const rand = h.cy - h.ry * 0.38;
      voor.push({ d: vloeiend([[h.cx - h.rx * 1.04, rand], [h.cx - h.rx * 0.9, h.cy - h.ry * 0.86], [h.cx, h.cy - h.ry * 1.1], [h.cx + h.rx * 0.9, h.cy - h.ry * 0.86], [h.cx + h.rx * 1.04, rand]]), fill: kleur, schaduw: true });
      voor.push({ d: vloeiend([[h.cx - h.rx * 1.06, rand - 2], [h.cx + h.rx * 1.06, rand - 2], [h.cx + h.rx * 0.98, rand + 9], [h.cx, rand + 16], [h.cx - h.rx * 0.98, rand + 9]]), fill: donker });
      voor.push({ d: `M${h.cx - 3.5},${h.cy - h.ry * 1.1 + 2} a3.5,3 0 1,0 7,0 a3.5,3 0 1,0 -7,0`, fill: donker });
      if (accent) voor.push({ d: `M${h.cx - 7},${h.cy - h.ry * 0.62} a7,7 0 1,0 14,0 a7,7 0 1,0 -14,0`, fill: accent });
      break;
    }
    case "helm": {
      const h = f.hoofd;
      const rand = h.cy - h.ry * 0.32;
      voor.push({ d: vloeiend([[h.cx - h.rx * 1.14, rand], [h.cx - h.rx * 1.02, h.cy - h.ry * 0.96], [h.cx, h.cy - h.ry * 1.26], [h.cx + h.rx * 1.02, h.cy - h.ry * 0.96], [h.cx + h.rx * 1.14, rand]]), fill: kleur, schaduw: true, stroke: tint(kleur, 0.8), sw: 1 });
      voor.push({ d: vloeiend([[h.cx - h.rx * 1.34, rand + 2], [h.cx, rand - 6], [h.cx + h.rx * 1.34, rand + 2], [h.cx + h.rx * 1.2, rand + 10], [h.cx, rand + 6], [h.cx - h.rx * 1.2, rand + 10]]), fill: tint(kleur, 0.9), stroke: tint(kleur, 0.75), sw: 1 });
      voor.push(lijn(`M${h.cx},${h.cy - h.ry * 1.24} L${h.cx},${rand - 4}`, tint(kleur, 0.78), 5));
      break;
    }
    case "bril": {
      const h = f.hoofd;
      const yy = y.ogen;
      const w = h.rx * 0.92;
      const glas = vloeiend([[h.cx - w, yy - 8], [h.cx - 8, yy - 10], [h.cx, yy - 4], [h.cx + 8, yy - 10], [h.cx + w, yy - 8], [h.cx + w * 0.86, yy + 10], [h.cx + w * 0.45, yy + 16], [h.cx + 6, yy + 8], [h.cx, yy + 4], [h.cx - 6, yy + 8], [h.cx - w * 0.45, yy + 16], [h.cx - w * 0.86, yy + 10]]);
      voor.push({ d: glas, fill: kleur, opacity: 0.42, stroke: "#5c6670", sw: 1.6 });
      voor.push(lijn(`M${h.cx - w * 0.7},${yy - 4} l${w * 0.3},-2 M${h.cx + w * 0.3},${yy - 6} l${w * 0.3},2`, "#ffffff", 2));
      break;
    }
    case "tas": {
      const k = 1;
      const sch = { x: cx + k * (half.schouder * 0.62), y: y.schouder - 2 };
      const tas = { x: cx + k * (half.heup + 34), y: y.heup - 6 };
      voor.push(lijn(`M${sch.x},${sch.y} Q${sch.x + 26},${lerp(sch.y, tas.y, 0.5)} ${tas.x - 18},${tas.y - 4}`, tint(kleur, 0.7), 5));
      voor.push(lijn(`M${sch.x - 8},${sch.y + 2} Q${sch.x + 6},${lerp(sch.y, tas.y, 0.5)} ${tas.x - 40},${tas.y + 2}`, tint(kleur, 0.7), 5));
      voor.push({ d: hoekig([[tas.x - 52, tas.y], [tas.x + 22, tas.y - 4], [tas.x + 30, tas.y + 92], [tas.x - 48, tas.y + 96]]), fill: kleur, schaduw: true, stroke: tint(kleur, 0.8), sw: 1 });
      break;
    }
  }
  return { achter, voor };
}

// ---------------------------------------------------------------------------
// De hele paspop in tekenvolgorde
// ---------------------------------------------------------------------------

export type Gedragen = { slot: Slot; soort: Soort; kleur: string; accent?: string | undefined; ruimte: number };
export type Scene = {
  figuur: Figuur;
  /** alles onder het hoofd, in tekenvolgorde */
  lagen: Vorm[];
  /** pet, helm en bril: over het hoofd */
  opHoofd: Vorm[];
  vloer: { cx: number; cy: number; rx: number; ry: number };
};

// broek en schoenen vóór de armen (de handen hangen over de broek), de rest erna
const ONDER: Slot[] = ["sokken", "onder", "voeten", "knie", "riem"];
const BOVEN: Slot[] = ["top", "midden", "jas", "hesje", "handen", "tas"];

/** Lichaam + kleding in de juiste volgorde: capuchon achter de nek, broek onder de trui, hesje over alles. */
export function scene(l: Lichaam, m: Maten, huid: string, stukken: Gedragen[]): Scene {
  const f = figuur(l, m);
  const body = lijf(f, l);
  const tekeningen = stukken.map((g) => ({ g, t: kledingstuk(f, g.soort, g.kleur, g.accent, g.ruimte) }));
  const huidVorm = (d: string): Vorm => ({ d, fill: huid, schaduw: true });
  const lagen: Vorm[] = [
    ...tekeningen.flatMap((x) => x.t.achter),
    ...body.benen.map(huidVorm),
    ...body.voeten.map(huidVorm),
    huidVorm(body.romp),
    huidVorm(body.nek),
  ];
  const leg = (slots: Slot[]) => {
    for (const slot of slots) for (const x of tekeningen) if (x.g.slot === slot) lagen.push(...x.t.voor);
  };
  leg(ONDER);
  lagen.push(...body.armen.map(huidVorm), ...body.handen.map(huidVorm));
  leg(BOVEN);
  const opHoofd = (["hoofd", "gezicht"] as Slot[]).flatMap((slot) => tekeningen.filter((x) => x.g.slot === slot).flatMap((x) => x.t.voor));
  return { figuur: f, lagen, opHoofd, vloer: { cx: f.cx, cy: ZOOL + 6, rx: f.half.schouder * 1.25, ry: 13 } };
}
