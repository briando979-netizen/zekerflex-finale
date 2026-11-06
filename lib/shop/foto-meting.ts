// "Op mijn foto" zonder betaalde AI: uit een foto van het hele lichaam (van voren)
// meten we op het toestel zelf de houding en de omtrek van de persoon
// (MediaPipe, Apache-2.0, gehost in public/paskamer/ml) en rekenen we daar de
// maten, het gezicht, de huidskleur en de haarkleur uit. Dit bestand bevat alleen
// de pure rekenregels; het laden van het model staat in
// components/marketing/paskamer/fotoMeting.ts. De foto verlaat het toestel nooit.

export type Punt = { x: number; y: number; z?: number; visibility?: number };

/** Indexen van de 33 lichaamspunten van MediaPipe Pose. */
export const POSE = { neus: 0, oogL: 2, oogR: 5, oorL: 7, oorR: 8, mondL: 9, mondR: 10, schouderL: 11, schouderR: 12, elleboogL: 13, elleboogR: 14, polsL: 15, polsR: 16, heupL: 23, heupR: 24, kniL: 25, kniR: 26, enkelL: 27, enkelR: 28, hielL: 29, hielR: 30, voetL: 31, voetR: 32 } as const;

export type Probleem = "geen-mens" | "niet-heel" | "niet-voor" | "klein";

/** Staat de hele persoon in beeld en kijkt hij/zij recht naar de camera? Uit de punten, in beeldverhoudingen (0–1). */
export function beoordeelFoto(p: Punt[] | null | undefined, breedte: number, hoogte: number): Probleem[] {
  if (!p || p.length < 33) return ["geen-mens"];
  const zicht = (i: number) => (p[i]?.visibility ?? 1) > 0.5;
  const nodig = [POSE.neus, POSE.schouderL, POSE.schouderR, POSE.heupL, POSE.heupR, POSE.enkelL, POSE.enkelR];
  const uit: Probleem[] = [];
  const a = p[POSE.enkelL];
  const b = p[POSE.enkelR];
  const neus = p[POSE.neus];
  if (!nodig.every(zicht) || !a || !b || !neus || Math.max(a.y, b.y) > 1.02 || neus.y < -0.02) uit.push("niet-heel");
  const sl = p[POSE.schouderL];
  const sr = p[POSE.schouderR];
  const hl = p[POSE.heupL];
  const hr = p[POSE.heupR];
  if (sl && sr && hl && hr && neus) {
    const schouderBreed = Math.abs(sl.x - sr.x) * breedte;
    const schouderHoog = Math.abs((sl.y + sr.y) / 2 - (hl.y + hr.y) / 2) * hoogte;
    // van opzij zijn de schouders smal ten opzichte van de romp; scheef staan telt ook
    if (schouderBreed < schouderHoog * 0.38 || Math.abs(sl.y - sr.y) * hoogte > schouderHoog * 0.25) uit.push("niet-voor");
  }
  if (a && b && neus && (Math.max(a.y, b.y) - neus.y) * hoogte < 300) uit.push("klein");
  return uit;
}

/** Breedte (px) van het stuk persoon op rij `rij`, vanaf `xMidden` naar links en rechts, hooguit `maxHalf` px per kant. */
export function breedteOpRij(masker: ArrayLike<number>, w: number, h: number, rij: number, xMidden: number, maxHalf: number, drempel = 0.5): { links: number; rechts: number } {
  const y = Math.max(0, Math.min(h - 1, Math.round(rij)));
  const x0 = Math.max(0, Math.min(w - 1, Math.round(xMidden)));
  let links = 0;
  let rechts = 0;
  while (links < maxHalf && x0 - links - 1 >= 0 && (masker[y * w + x0 - links - 1] ?? 0) >= drempel) links++;
  while (rechts < maxHalf && x0 + rechts + 1 < w && (masker[y * w + x0 + rechts + 1] ?? 0) >= drempel) rechts++;
  return { links, rechts };
}

/** Omtrek (cm) van een ellips uit breedte en diepte (Ramanujan). */
export function ellipsOmtrek(breedteCm: number, diepteCm: number): number {
  const a = breedteCm / 2;
  const b = diepteCm / 2;
  const h = ((a - b) * (a - b)) / ((a + b) * (a + b) || 1);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/** Hoe diep een romp is ten opzichte van zijn breedte, op borst-, taille- en heuphoogte (gemiddelde postuur). */
const DIEPTE = { borst: 0.66, taille: 0.7, heup: 0.62 } as const;

export type Meting = {
  borst: number;
  taille: number;
  heup: number;
  /** px per cm in de foto */
  schaal: number;
  schouderCm: number;
  /** de rijen (px) waarop gemeten is, voor de tekening over de foto */
  rijen: { borst: number; taille: number; heup: number };
};

/**
 * De maten uit het masker en de punten. `lengteCm` is de lengte die de klant
 * opgaf; de afstand van kruin tot voetzool in de foto geeft de schaal.
 * Tussen de schouders en de heupen liggen de borst- (25 %), taille- (62 %) en
 * heuprij (100 %). De breedte van de borst wordt begrensd op de schouderbreedte,
 * zodat armen die tegen het lijf hangen de meting niet opblazen.
 */
export function meetLichaam(masker: ArrayLike<number>, w: number, h: number, p: Punt[], lengteCm: number): Meting | null {
  const neus = p[POSE.neus];
  const sl = p[POSE.schouderL];
  const sr = p[POSE.schouderR];
  const hl = p[POSE.heupL];
  const hr = p[POSE.heupR];
  const el = p[POSE.enkelL];
  const er = p[POSE.enkelR];
  if (!neus || !sl || !sr || !hl || !hr || !el || !er) return null;
  // kruin: bovenste rij van het masker boven de neus
  const neusX = Math.round(neus.x * w);
  let kruin = Math.round(neus.y * h);
  while (kruin > 0 && (masker[(kruin - 1) * w + neusX] ?? 0) >= 0.5) kruin--;
  const voetzool = Math.max(p[POSE.hielL]?.y ?? el.y, p[POSE.hielR]?.y ?? er.y, el.y, er.y) * h + 0.04 * h * 0.35;
  const lengtePx = voetzool - kruin;
  if (lengtePx < 200 || lengteCm < 80) return null;
  const schaal = lengtePx / lengteCm;
  const sY = ((sl.y + sr.y) / 2) * h;
  const hY = ((hl.y + hr.y) / 2) * h;
  const midX = ((sl.x + sr.x + hl.x + hr.x) / 4) * w;
  const schouderPx = Math.abs(sl.x - sr.x) * w;
  const rijBorst = sY + (hY - sY) * 0.25;
  const rijTaille = sY + (hY - sY) * 0.62;
  const rijHeup = hY;
  const meet = (rij: number, maxHalf: number) => {
    const { links, rechts } = breedteOpRij(masker, w, h, rij, midX, maxHalf);
    return (links + rechts) / schaal;
  };
  const borstB = Math.min(meet(rijBorst, schouderPx * 0.62), (schouderPx / schaal) * 0.92);
  const tailleB = meet(rijTaille, schouderPx * 0.62);
  const heupB = meet(rijHeup, schouderPx * 0.75);
  if (borstB < 15 || tailleB < 12 || heupB < 15) return null;
  const rond = (n: number) => Math.round(n);
  return {
    borst: rond(ellipsOmtrek(borstB, borstB * DIEPTE.borst)),
    taille: rond(ellipsOmtrek(tailleB, tailleB * DIEPTE.taille)),
    heup: rond(ellipsOmtrek(heupB, heupB * DIEPTE.heup)),
    schaal,
    schouderCm: Math.round(schouderPx / schaal),
    rijen: { borst: rijBorst, taille: rijTaille, heup: rijHeup },
  };
}

export type Kader = { x: number; y: number; w: number; h: number };

/**
 * Het gezichtskader (hairline tot kin) voor de paspop, zoals het bijsnijdscherm
 * het maakt: 0,8 × zo breed als hoog en de ogen op 45 % van de hoogte. De hoogte
 * volgt uit de afstand tussen de ogen (ongeveer 3,5 ×).
 */
export function gezichtsKader(oogL: Punt, oogR: Punt, breedte: number, hoogte: number): Kader {
  const dx = (oogR.x - oogL.x) * breedte;
  const dy = (oogR.y - oogL.y) * hoogte;
  const oog = Math.hypot(dx, dy);
  const h = oog * 3.5;
  const cx = ((oogL.x + oogR.x) / 2) * breedte;
  const cy = ((oogL.y + oogR.y) / 2) * hoogte;
  return { x: cx - (h * 0.8) / 2, y: cy - h * 0.45, w: h * 0.8, h };
}

/** Gemiddelde kleur (hex) van een stuk pixels; lege of te donkere/lichte vlakken tellen niet mee. */
export function gemiddeldeKleur(data: Uint8ClampedArray, tel = 4): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += 4 * tel) {
    const lum = 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0);
    if ((data[i + 3] ?? 0) < 200 || lum < 18 || lum > 245) continue;
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
    n++;
  }
  if (n < 8) return null;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** De dichtstbijzijnde kleur uit een lijst (voor de haarkleur-keuze van de paspop). */
export function dichtstbij(hex: string, opties: readonly string[]): string {
  const [r, g, b] = rgb(hex);
  let beste = opties[0] ?? hex;
  let min = Infinity;
  for (const o of opties) {
    const [or, og, ob] = rgb(o);
    const d = (r - or) ** 2 + (g - og) ** 2 + (b - ob) ** 2;
    if (d < min) (min = d), (beste = o);
  }
  return beste;
}

/** Huidskleur van de foto gladstrijken naar iets dat op een paspop past (niet te donker, niet overbelicht). */
export function huidVoorPaspop(hex: string): string {
  const [r, g, b] = rgb(hex);
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const f = l < 70 ? 70 / l : l > 225 ? 225 / l : 1;
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0");
  return `#${k(r)}${k(g)}${k(b)}`;
}
