// De rekenkern van de 3D-paskamer: de bestanden uit public/paskamer/3d
// (gebouwd door scripts/paskamer/bouw-3d.mjs uit CC0-MakeHuman) inlezen, het
// lichaam vormen naar silhouet en gewicht, en elk kledingstuk, haar of oog op
// dat lichaam passen. Puur rekenwerk zonder three.js: de weergave
// (components/marketing/paskamer/Paspop3D.tsx) zet de getallen in een scène.
// Eenheid van het model: decimeter; de weergave schaalt naar de echte lengte.

export type StukInfo = { o: number; n: number; t: "Float32" | "Uint16" | "Uint32" | "Int16" };
export type BinInfo = { bin: string; stukken: Record<string, StukInfo>; bytes: number };
type Schaal = Partial<Record<"x" | "y" | "z", [number, number, number]>>;

export type DeelInfo = BinInfo & {
  schaal: Schaal;
  punten: number;
  weergave: number;
  tex: Record<string, string | null>;
  kleurbaar?: boolean;
  haar?: boolean;
};

export type Manifest = {
  versie: number;
  eenheid: "dm";
  lichaam: BinInfo & {
    vormen: Record<string, { stap: number; n: number }>;
    punten: number;
    weergave: number;
    ymin: number;
    ymax: number;
    ogen: { l: number[]; r: number[] };
    kin: number;
    kruin: number;
    gewrichten?: Record<string, number[]>;
  };
  delen: Record<string, DeelInfo>;
  huid: Record<string, string | null>;
  huidGem?: Record<string, [number, number, number]>;
};

type Getypt = Float32Array | Uint16Array | Uint32Array | Int16Array;

/** Een stuk uit een .bin als getypte array (zonder kopiëren). */
export function stuk(buf: ArrayBuffer, s: StukInfo | undefined): Getypt {
  if (!s) throw new Error("stuk ontbreekt in de manifest");
  switch (s.t) {
    case "Float32":
      return new Float32Array(buf, s.o, s.n);
    case "Uint16":
      return new Uint16Array(buf, s.o, s.n);
    case "Uint32":
      return new Uint32Array(buf, s.o, s.n);
    case "Int16":
      return new Int16Array(buf, s.o, s.n);
  }
}

export type Vorm = { i: Uint16Array; d: Int16Array; stap: number };
export type LichaamData = {
  basis: Float32Array;
  naarBron: Uint16Array;
  uv: Float32Array;
  idx: Uint16Array | Uint32Array;
  vormen: Record<string, Vorm>;
};

export function leesLichaam(buf: ArrayBuffer, info: Manifest["lichaam"]): LichaamData {
  const s = info.stukken;
  const vormen: Record<string, Vorm> = {};
  for (const [naam, v] of Object.entries(info.vormen)) {
    vormen[naam] = { i: stuk(buf, s[`v-${naam}-i`]) as Uint16Array, d: stuk(buf, s[`v-${naam}-d`]) as Int16Array, stap: v.stap };
  }
  return {
    basis: stuk(buf, s.basis) as Float32Array,
    naarBron: stuk(buf, s.naarBron) as Uint16Array,
    uv: stuk(buf, s.uv) as Float32Array,
    idx: stuk(buf, s.idx) as Uint16Array | Uint32Array,
    vormen,
  };
}

export type DeelData = {
  naarBron: Uint16Array;
  uv: Float32Array;
  idx: Uint16Array | Uint32Array;
  refs: Uint16Array;
  wts: Float32Array;
  off: Float32Array;
  del: Uint16Array;
  schaal: Schaal;
};

export function leesDeel(buf: ArrayBuffer, info: DeelInfo): DeelData {
  const s = info.stukken;
  return {
    naarBron: stuk(buf, s.naarBron) as Uint16Array,
    uv: stuk(buf, s.uv) as Float32Array,
    idx: stuk(buf, s.idx) as Uint16Array | Uint32Array,
    refs: stuk(buf, s.refs) as Uint16Array,
    wts: stuk(buf, s.wts) as Float32Array,
    off: stuk(buf, s.off) as Float32Array,
    del: stuk(buf, s.del) as Uint16Array,
    schaal: info.schaal,
  };
}

export type Silhouet3D = "heren" | "dames" | "kind";

/**
 * Het lichaam als punten (alle punten van het basismodel, ook de hulpvormen
 * waar kleding aan vastzit): basis + silhouet + gewicht (−1 slank … 0 … +1 zwaar).
 */
export function vormLichaam(l: LichaamData, silhouet: Silhouet3D, gewicht: number, uit?: Float32Array): Float32Array {
  const P = uit && uit.length === l.basis.length ? uit : new Float32Array(l.basis.length);
  P.set(l.basis);
  const tel = (v: Vorm | undefined, f: number) => {
    if (!v || f === 0) return;
    const k = v.stap * f;
    for (let j = 0; j < v.i.length; j++) {
      const p = (v.i[j] ?? 0) * 3;
      P[p] = (P[p] ?? 0) + (v.d[j * 3] ?? 0) * k;
      P[p + 1] = (P[p + 1] ?? 0) + (v.d[j * 3 + 1] ?? 0) * k;
      P[p + 2] = (P[p + 2] ?? 0) + (v.d[j * 3 + 2] ?? 0) * k;
    }
  };
  tel(l.vormen[silhouet], 1);
  const g = Math.max(-1, Math.min(1, gewicht));
  tel(l.vormen[g >= 0 ? `${silhouet}-zwaar` : `${silhouet}-slank`], Math.abs(g));
  return P;
}

/** Gewicht als factor −1…+1 uit het BMI (of de gekozen bouw), per silhouet. */
export function gewichtFactor(silhouet: Silhouet3D, bmi: number): number {
  const [slank, gem, zwaar] = silhouet === "kind" ? [14, 17, 22] : silhouet === "dames" ? [17.5, 22.5, 31] : [18.5, 23.5, 32];
  const f = bmi < gem ? (bmi - gem) / (gem - slank) : (bmi - gem) / (zwaar - gem);
  return Math.max(-1, Math.min(1, f));
}

const afstand = (P: Float32Array, a: number, b: number, as: 0 | 1 | 2) => Math.abs((P[a * 3 + as] ?? 0) - (P[b * 3 + as] ?? 0));

/**
 * Een aanhangsel op het lichaam passen (MakeHuman-proxy): elk punt is een
 * gewogen som van drie lichaamspunten plus een verschuiving, geschaald met de
 * maat van het lichaam. `ruimte` > 0 zet de stof verder van het lijf (een maat
 * te groot), < 0 dichter erop (te klein). Uit: posities per weergavepunt.
 */
export function pasDeel(d: DeelData, P: Float32Array, ruimte = 0, uit?: Float32Array): Float32Array {
  const sx = d.schaal.x ? afstand(P, d.schaal.x[0], d.schaal.x[1], 0) / (d.schaal.x[2] || 1) : 1;
  const sy = d.schaal.y ? afstand(P, d.schaal.y[0], d.schaal.y[1], 1) / (d.schaal.y[2] || 1) : 1;
  const sz = d.schaal.z ? afstand(P, d.schaal.z[0], d.schaal.z[1], 2) / (d.schaal.z[2] || 1) : 1;
  const f = 1 + ruimte;
  const n = d.refs.length / 3;
  const pt = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      const r = (d.refs[i * 3 + k] ?? 0) * 3;
      const w = d.wts[i * 3 + k] ?? 0;
      x += w * (P[r] ?? 0);
      y += w * (P[r + 1] ?? 0);
      z += w * (P[r + 2] ?? 0);
    }
    pt[i * 3] = x + (d.off[i * 3] ?? 0) * sx * f;
    pt[i * 3 + 1] = y + (d.off[i * 3 + 1] ?? 0) * sy * f;
    pt[i * 3 + 2] = z + (d.off[i * 3 + 2] ?? 0) * sz * f;
  }
  const m = d.naarBron.length;
  const o = uit && uit.length === m * 3 ? uit : new Float32Array(m * 3);
  for (let k = 0; k < m; k++) {
    const b = (d.naarBron[k] ?? 0) * 3;
    o[k * 3] = pt[b] ?? 0;
    o[k * 3 + 1] = pt[b + 1] ?? 0;
    o[k * 3 + 2] = pt[b + 2] ?? 0;
  }
  return o;
}

/** De posities van de weergavepunten van het lichaam (punten met een eigen uv). */
export function lichaamWeergave(l: LichaamData, P: Float32Array, uit?: Float32Array): Float32Array {
  const m = l.naarBron.length;
  const o = uit && uit.length === m * 3 ? uit : new Float32Array(m * 3);
  for (let k = 0; k < m; k++) {
    const b = (l.naarBron[k] ?? 0) * 3;
    o[k * 3] = P[b] ?? 0;
    o[k * 3 + 1] = P[b + 1] ?? 0;
    o[k * 3 + 2] = P[b + 2] ?? 0;
  }
  return o;
}

/** Driehoeken van het lichaam zonder de stukken huid die onder de kleding verdwijnen. */
export function zichtbaar(l: LichaamData, verborgen: Uint8Array): Uint16Array | Uint32Array {
  const uit: number[] = [];
  const idx = l.idx;
  for (let t = 0; t < idx.length; t += 3) {
    const a = l.naarBron[idx[t] ?? 0] ?? 0;
    const b = l.naarBron[idx[t + 1] ?? 0] ?? 0;
    const c = l.naarBron[idx[t + 2] ?? 0] ?? 0;
    if (verborgen[a] || verborgen[b] || verborgen[c]) continue;
    uit.push(idx[t] ?? 0, idx[t + 1] ?? 0, idx[t + 2] ?? 0);
  }
  return idx instanceof Uint32Array ? Uint32Array.from(uit) : Uint16Array.from(uit);
}

/** Welke lichaamspunten onder de gedragen stukken verdwijnen (MakeHuman delete_verts). */
export function verbergOnder(punten: number, delen: DeelData[]): Uint8Array {
  const v = new Uint8Array(punten);
  for (const d of delen) for (let i = 0; i < d.del.length; i++) v[d.del[i] ?? 0] = 1;
  return v;
}

/** Gemiddelde van een groep punten (een gewricht, een oog). */
export function midden(P: Float32Array, ids: number[]): [number, number, number] {
  if (ids.length === 0) return [0, 0, 0];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of ids) {
    x += P[i * 3] ?? 0;
    y += P[i * 3 + 1] ?? 0;
    z += P[i * 3 + 2] ?? 0;
  }
  return [x / ids.length, y / ids.length, z / ids.length];
}

/** Hoogte van de voetzool tot de kruin van het gevormde lichaam (alleen echte lichaamspunten). */
export function lichaamsHoogte(l: LichaamData, P: Float32Array): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < l.naarBron.length; k++) {
    const y = P[(l.naarBron[k] ?? 0) * 3 + 1] ?? 0;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, max };
}

/**
 * Waar de gezichtsfoto op het hoofd komt. In het bijsnijdscherm staan de ogen op
 * de groene lijn: 45 % van de fotohoogte van boven (FotoBijsnijden: ry × 0,1
 * onder het midden), en de kin raakt het ovaal onderaan (98 %); de foto is 0,8 ×
 * zo breed als hoog. Uit: midden en maat van de foto in het vlak voor het
 * gezicht (x, y), in modeleenheden.
 */
export const FOTO_OGEN = 0.45;
export const FOTO_KIN = 0.97;
export function gezichtsVlak(ogen: [number, number, number], kin: [number, number, number]): { midden: [number, number]; maat: [number, number] } {
  const h = Math.max(0.5, (ogen[1] - kin[1]) / (FOTO_KIN - FOTO_OGEN));
  const boven = ogen[1] + FOTO_OGEN * h;
  return { midden: [ogen[0], boven - h / 2], maat: [h * 0.8, h] };
}

/** Is een lichaamspunt (op het basismodel) een arm? Voor mouwloze kleding (hesje, bodywarmer). */
export function isArm(p: [number, number, number], schouder: [number, number, number], elleboog: [number, number, number], hand: [number, number, number]): boolean {
  const x = Math.abs(p[0]);
  const zij = (v: [number, number, number]): [number, number, number] => [Math.abs(v[0]), v[1], v[2]];
  const s = zij(schouder);
  const e = zij(elleboog);
  const h = zij(hand);
  const q: [number, number, number] = [x, p[1], p[2]];
  const tot = (a: [number, number, number], b: [number, number, number]) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const aq = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    const len2 = (ab[0] ?? 0) ** 2 + (ab[1] ?? 0) ** 2 + (ab[2] ?? 0) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((aq[0] ?? 0) * (ab[0] ?? 0) + (aq[1] ?? 0) * (ab[1] ?? 0) + (aq[2] ?? 0) * (ab[2] ?? 0)) / len2));
    const d = Math.hypot((aq[0] ?? 0) - t * (ab[0] ?? 0), (aq[1] ?? 0) - t * (ab[1] ?? 0), (aq[2] ?? 0) - t * (ab[2] ?? 0));
    return { t, d };
  };
  const boven = tot(s, e);
  const onder = tot(e, h);
  return x > s[0] * 0.97 && ((boven.t > 0.08 && boven.d < 0.85) || onder.d < 0.8);
}

/**
 * Normalen zonder zichtbare naden: per bronpunt opgeteld (punten met dezelfde
 * plek maar een andere uv delen hun normaal) en dan naar de weergavepunten.
 */
export function normalen(idx: ArrayLike<number>, naarBron: Uint16Array, pos: Float32Array, bronAantal: number, uit?: Float32Array): Float32Array {
  const acc = new Float32Array(bronAantal * 3);
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t] ?? 0;
    const b = idx[t + 1] ?? 0;
    const c = idx[t + 2] ?? 0;
    const ax = pos[a * 3] ?? 0, ay = pos[a * 3 + 1] ?? 0, az = pos[a * 3 + 2] ?? 0;
    const ux = (pos[b * 3] ?? 0) - ax, uy = (pos[b * 3 + 1] ?? 0) - ay, uz = (pos[b * 3 + 2] ?? 0) - az;
    const vx = (pos[c * 3] ?? 0) - ax, vy = (pos[c * 3 + 1] ?? 0) - ay, vz = (pos[c * 3 + 2] ?? 0) - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const r of [a, b, c]) {
      const s = (naarBron[r] ?? 0) * 3;
      acc[s] = (acc[s] ?? 0) + nx;
      acc[s + 1] = (acc[s + 1] ?? 0) + ny;
      acc[s + 2] = (acc[s + 2] ?? 0) + nz;
    }
  }
  const m = naarBron.length;
  const o = uit && uit.length === m * 3 ? uit : new Float32Array(m * 3);
  for (let k = 0; k < m; k++) {
    const s = (naarBron[k] ?? 0) * 3;
    const x = acc[s] ?? 0, y = acc[s + 1] ?? 0, z = acc[s + 2] ?? 0;
    const l = Math.hypot(x, y, z) || 1;
    o[k * 3] = x / l;
    o[k * 3 + 1] = y / l;
    o[k * 3 + 2] = z / l;
  }
  return o;
}
