import { fibonacciBol, hashVan, toeval, type Punt3 } from "@/lib/rag/graph-layout3d";

// ---------------------------------------------------------------------------
// Het rekenwerk van het Brein (Admin → Kennisgraaf, 3D), zonder database: waar
// elk neuron (een geheugenstuk, RagChunk) komt te staan, welke korte stralen
// het verbinden en hoeveel procent van een cluster vuurt. Puur en deterministisch,
// zonder krachtensimulatie: duizenden neuronen krijgen een plek uit een vaste
// hash, in wolken rond het middelpunt van hun cluster; stukken uit dezelfde bron
// klonteren samen, stukken uit de kennisbank rond hun document (de 3D-layout van
// de documentgraaf, lib/rag/graph-layout3d.ts).
// ---------------------------------------------------------------------------

export interface BreinNeuronInvoer {
  id: string;
  /** de cluster (index in de clusterlijst) */
  cluster: number;
  sourceRef: string;
  chunkIndex: number;
  /** een document uit de kennisgraaf waar dit stuk bij hoort (corpus-stukken) */
  docId?: string;
  /** stukken waarmee het brein dit stuk bij het voeden verbond (voeding) */
  buren?: string[];
}

/** De middelpunten van de clusters op een bol; de straal groeit mee met het aantal neuronen. */
export function clusterCentra(aantalClusters: number, aantalNeuronen: number): { centra: Punt3[]; straal: number } {
  const straal = Math.round((80 + 2 * Math.sqrt(Math.max(0, aantalNeuronen))) * 100) / 100;
  return { centra: fibonacciBol(aantalClusters, aantalClusters > 1 ? straal : 0), straal };
}

/** Een richting op de bol plus een afstand uit een zaad: steeds dezelfde voor hetzelfde zaad. */
function richting(zaad: number, afstand: number): Punt3 {
  const r = toeval(zaad);
  const u = r() * 2 - 1;
  const phi = r() * Math.PI * 2;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  // som van drie trekkingen: naar het midden toe dichter (wolk in plaats van schil)
  const d = afstand * ((r() + r() + r()) / 3) * 1.4;
  return [s * Math.cos(phi) * d, u * d, s * Math.sin(phi) * d];
}

const plus = (a: Punt3, b: Punt3, f = 1): Punt3 => [a[0] + b[0] * f, a[1] + b[1] * f, a[2] + b[2] * f];
const rond = (p: Punt3): Punt3 => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100, Math.round(p[2] * 100) / 100];

/**
 * De positie van elk neuron. Bronstukken: rond hun clustermiddelpunt, geklonterd per sourceRef. Kennisbankstukken: rond
 * de plek van hun document (uit de documentlayout, verschoven naar het clustermiddelpunt). Voeding: in het midden van
 * de stukken waarmee het verbonden is (echte verwantschap), met een kleine afwijking; zonder bekende buren rond de cluster.
 */
export function neuronPosities(
  neuronen: readonly BreinNeuronInvoer[],
  centra: readonly Punt3[],
  docPosities: Record<string, Punt3>,
  docCentra: Record<string, Punt3>,
): Record<string, Punt3> {
  const perCluster = new Map<number, number>();
  for (const n of neuronen) perCluster.set(n.cluster, (perCluster.get(n.cluster) ?? 0) + 1);
  const uit: Record<string, Punt3> = {};
  const voeding: BreinNeuronInvoer[] = [];
  for (const n of neuronen) {
    const centrum = centra[n.cluster] ?? [0, 0, 0];
    if (n.buren && n.buren.length > 0) {
      voeding.push(n);
      continue;
    }
    const wolk = 8 + 1.8 * Math.sqrt(perCluster.get(n.cluster) ?? 1);
    if (n.docId && docPosities[n.docId]) {
      // rond het document: de documentlayout ligt om zijn eigen thema-middelpunt; dat verplaatsen we naar dit cluster
      const docPos = docPosities[n.docId]!;
      const docCentrum = docCentra[n.docId] ?? [0, 0, 0];
      const rel: Punt3 = [docPos[0] - docCentrum[0], docPos[1] - docCentrum[1], docPos[2] - docCentrum[2]];
      uit[n.id] = rond(plus(plus(centrum, rel, 0.9), richting(hashVan(n.id), 1.6)));
    } else {
      const bron = richting(hashVan(n.sourceRef), wolk);
      uit[n.id] = rond(plus(plus(centrum, bron), richting(hashVan(n.id), 2.4)));
    }
  }
  for (const n of voeding) {
    const bekend = (n.buren ?? []).map((b) => uit[b]).filter((p): p is Punt3 => Boolean(p));
    const centrum = centra[n.cluster] ?? [0, 0, 0];
    if (bekend.length === 0) {
      uit[n.id] = rond(plus(centrum, richting(hashVan(n.id), 6)));
      continue;
    }
    const som = bekend.reduce<Punt3>((s, p) => plus(s, p), [0, 0, 0]);
    const midden: Punt3 = [som[0] / bekend.length, som[1] / bekend.length, som[2] / bekend.length];
    uit[n.id] = rond(plus(midden, richting(hashVan(n.id), 2)));
  }
  return uit;
}

/**
 * De korte stralen: opeenvolgende stukken van dezelfde bron, de voeding naar zijn buren, en per document één straal
 * naar elk verbonden document (de documentgraaf), tot `max` stralen. Paren van indexen in `neuronen`.
 */
export function neuronLijnen(neuronen: readonly BreinNeuronInvoer[], docLijnen: readonly { source: string; target: string }[], max = 8000): [number, number][] {
  const idx = new Map<string, number>(neuronen.map((n, i) => [n.id, i]));
  const uit: [number, number][] = [];
  const gezien = new Set<string>();
  const voeg = (a: number, b: number) => {
    if (a === b || uit.length >= max) return;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (gezien.has(k)) return;
    gezien.add(k);
    uit.push([a, b]);
  };
  // per bron op volgorde van chunkIndex
  const perBron = new Map<string, { i: number; chunkIndex: number }[]>();
  neuronen.forEach((n, i) => perBron.set(n.sourceRef, [...(perBron.get(n.sourceRef) ?? []), { i, chunkIndex: n.chunkIndex }]));
  for (const lijst of perBron.values()) {
    lijst.sort((a, b) => a.chunkIndex - b.chunkIndex);
    for (let k = 1; k < lijst.length; k++) voeg(lijst[k - 1]!.i, lijst[k]!.i);
  }
  // voeding naar zijn buren
  neuronen.forEach((n, i) => {
    for (const b of n.buren ?? []) {
      const j = idx.get(b);
      if (j !== undefined) voeg(i, j);
    }
  });
  // documenten: het eerste stuk van elk document naar het eerste stuk van elk verbonden document
  const eersteVanDoc = new Map<string, number>();
  neuronen.forEach((n, i) => {
    if (!n.docId) return;
    const h = eersteVanDoc.get(n.docId);
    if (h === undefined || n.chunkIndex < (neuronen[h]?.chunkIndex ?? Infinity)) eersteVanDoc.set(n.docId, i);
  });
  for (const l of docLijnen) {
    const a = eersteVanDoc.get(l.source);
    const b = eersteVanDoc.get(l.target);
    if (a !== undefined && b !== undefined) voeg(a, b);
  }
  return uit;
}

/** Welk deel (%) van een cluster vuurde: neuronen met minstens één raadpleging; null zonder meting. */
export function vuurPercentage(ids: readonly string[], perNeuron: ReadonlyMap<string, number>, gemeten: boolean): number | null {
  if (!gemeten || ids.length === 0) return null;
  const n = ids.filter((id) => (perNeuron.get(id) ?? 0) > 0).length;
  return Math.round((100 * n) / ids.length);
}
