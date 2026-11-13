// ---------------------------------------------------------------------------
// De 3D-krachtenlayout van de Kennisgraaf voor de weergave "Sterrenstelsel"
// (components/admin/sterrenstelsel/scene.ts). Puur en deterministisch: dezelfde
// graaf geeft dezelfde posities, dus de server rekent hem één keer uit en houdt
// hem in het geheugen (lib/rag/graph.ts, kennisgraafLayout3D) en de browser
// tekent alleen. Elk thema is een zonnestelsel: de thema's liggen op een bol
// (Fibonacci), de knopen beginnen rond hun eigen zon en worden daar met
// zwaartekracht gehouden; lijnen trekken als veren, alle knopen stoten elkaar
// af. Bij duizenden knopen minder rondes, zodat het berekenen seconden blijft.
// ---------------------------------------------------------------------------

export type Punt3 = [number, number, number];

export interface Layout3D {
  posities: Record<string, Punt3>;
  /** het middelpunt (de zon) van elk thema */
  centra: Record<number, Punt3>;
  /** de straal van de bol waarop de thema's liggen */
  straal: number;
  rondes: number;
}

interface LayoutKnoop {
  id: string;
  thema?: number;
  size: number;
  group: string;
}

interface LayoutLijn {
  source: string;
  target: string;
  weight: number;
}

/** FNV-1a (32 bit): een vast getal per knoop-id, voor een deterministische startpositie. */
export function hashVan(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Mulberry32: kleine, deterministische toevalsgenerator. */
export function toeval(zaad: number): () => number {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n punten gelijk verdeeld over een bol met straal r (Fibonacci-spiraal); n = 1 geeft het middelpunt. */
export function fibonacciBol(n: number, r: number): Punt3[] {
  if (n <= 0) return [];
  if (n === 1) return [[0, 0, 0]];
  const uit: Punt3[] = [];
  const goud = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const hoek = goud * i;
    uit.push([Math.round(Math.cos(hoek) * rad * r * 100) / 100, Math.round(y * r * 100) / 100, Math.round(Math.sin(hoek) * rad * r * 100) / 100]);
  }
  return uit;
}

/** Hoeveel rondes de simulatie draait: minder bij veel knopen (de afstoting is kwadratisch). */
export function rondesVoor(n: number): number {
  return n > 1500 ? 60 : n > 500 ? 120 : 250;
}

/** De natuurlijke afstand tussen twee verbonden knopen. */
const K = 9;

export function layout3D(knopen: LayoutKnoop[], lijnen: LayoutLijn[], opties: { rondes?: number } = {}): Layout3D {
  const n = knopen.length;
  if (n === 0) return { posities: {}, centra: {}, straal: 0, rondes: 0 };
  const themaIds = [...new Set(knopen.map((k) => k.thema).filter((t): t is number => t !== undefined))].sort((a, b) => a - b);
  const straal = Math.round((60 + 6 * Math.sqrt(n)) * 100) / 100;
  const bol = fibonacciBol(Math.max(themaIds.length, 1), themaIds.length > 1 ? straal : 0);
  const centra: Record<number, Punt3> = {};
  themaIds.forEach((t, i) => {
    centra[t] = bol[i] ?? [0, 0, 0];
  });
  const leden = new Map<number, number>();
  for (const k of knopen) if (k.thema !== undefined) leden.set(k.thema, (leden.get(k.thema) ?? 0) + 1);

  const idx = new Map<string, number>(knopen.map((k, i) => [k.id, i]));
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pz = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const vz = new Float64Array(n);
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  const cz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = knopen[i]!;
    const c: Punt3 = k.thema !== undefined ? centra[k.thema] ?? [0, 0, 0] : [0, 0, 0];
    cx[i] = c[0];
    cy[i] = c[1];
    cz[i] = c[2];
    const r = toeval(hashVan(k.id));
    const rad = 6 + 2 * Math.sqrt(k.thema !== undefined ? leden.get(k.thema) ?? 1 : n);
    const u = r() * 2 - 1;
    const phi = r() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const d = rad * (0.4 + 0.6 * r());
    px[i] = c[0] + s * Math.cos(phi) * d;
    py[i] = c[1] + u * d;
    pz[i] = c[2] + s * Math.sin(phi) * d;
  }

  const paren: [number, number, number][] = [];
  for (const l of lijnen) {
    const i = idx.get(l.source);
    const j = idx.get(l.target);
    if (i === undefined || j === undefined || i === j || l.weight <= 0) continue;
    paren.push([i, j, Math.min(1, l.weight)]);
  }

  const rondes = opties.rondes ?? rondesVoor(n);
  const kap = (v: number) => (v > 6 ? 6 : v < -6 ? -6 : v);
  for (let r = 0; r < rondes; r++) {
    const t = 1 - r / rondes;
    const stap = 0.9 * t + 0.1;
    // afstoting tussen alle knopen
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[i]! - px[j]!;
        const dy = py[i]! - py[j]!;
        const dz = pz[i]! - pz[j]!;
        const d2 = Math.max(dx * dx + dy * dy + dz * dz, 0.01);
        const f = Math.min(20, ((K * K) / d2) * 0.6);
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        const fz = (dz / d) * f;
        vx[i] = vx[i]! + fx;
        vy[i] = vy[i]! + fy;
        vz[i] = vz[i]! + fz;
        vx[j] = vx[j]! - fx;
        vy[j] = vy[j]! - fy;
        vz[j] = vz[j]! - fz;
      }
    }
    // veren langs de lijnen: een sterke lijn trekt korter en harder
    for (const [i, j, w] of paren) {
      const dx = px[j]! - px[i]!;
      const dy = py[j]! - py[i]!;
      const dz = pz[j]! - pz[i]!;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const rust = K * (1.4 - w);
      const f = (d - rust) * 0.08 * (0.5 + w);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      const fz = (dz / d) * f;
      vx[i] = vx[i]! + fx;
      vy[i] = vy[i]! + fy;
      vz[i] = vz[i]! + fz;
      vx[j] = vx[j]! - fx;
      vy[j] = vy[j]! - fy;
      vz[j] = vz[j]! - fz;
    }
    // zwaartekracht naar de eigen zon (sterk) en naar het middelpunt van alles (zwak), dan dempen en bewegen
    for (let i = 0; i < n; i++) {
      vx[i] = (vx[i]! + (cx[i]! - px[i]!) * 0.03 - px[i]! * 0.002) * 0.75;
      vy[i] = (vy[i]! + (cy[i]! - py[i]!) * 0.03 - py[i]! * 0.002) * 0.75;
      vz[i] = (vz[i]! + (cz[i]! - pz[i]!) * 0.03 - pz[i]! * 0.002) * 0.75;
      px[i] = px[i]! + kap(vx[i]! * stap);
      py[i] = py[i]! + kap(vy[i]! * stap);
      pz[i] = pz[i]! + kap(vz[i]! * stap);
    }
  }

  const rond = (v: number) => Math.round(v * 100) / 100;
  const posities: Record<string, Punt3> = {};
  for (let i = 0; i < n; i++) posities[knopen[i]!.id] = [rond(px[i]!), rond(py[i]!), rond(pz[i]!)];
  return { posities, centra, straal, rondes };
}
