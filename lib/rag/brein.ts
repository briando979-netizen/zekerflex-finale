import type { RagSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { documenten, kennisgraaf, kennisgraafLayout3D } from "@/lib/rag/graph";
import { clusterCentra, neuronLijnen, neuronPosities, vuurPercentage, type BreinNeuronInvoer } from "@/lib/rag/brein-layout";
import type { Punt3 } from "@/lib/rag/graph-layout3d";
import { vuurStand } from "@/lib/rag/vuren";
import { voedingLijst } from "@/lib/rag/voeding";

// ---------------------------------------------------------------------------
// Het Brein: alle geheugenstukken (RagChunk) als neuronen in 3D, geclusterd per
// thema van de kennisgraaf (de stukken uit de kennisbank) en per bron (code,
// auditspoor, platformstand, wetgeving, sales, gesprekken en voeding). Alleen
// echte gegevens: de stukken uit de database, de thema's uit de graaf, de posities
// deterministisch uit lib/rag/brein-layout.ts, en "vuurt" uit de raadpleegtelling
// (lib/rag/vuren.ts). Tien minuten in het geheugen; voeden maakt de cache leeg.
// ---------------------------------------------------------------------------

export const BRON_NAAM: Record<RagSourceType, string> = {
  CODE: "Code van het platform",
  AUDIT: "Auditspoor",
  DATABASE: "Platformstand",
  LEGAL: "Wetgeving en kennisbank",
  SALES: "Sales",
  INTERACTION: "Gesprekken en voeding",
};

export interface BreinCluster {
  id: string;
  naam: string;
  soort: "thema" | "bron";
  aantal: number;
  /** % neuronen dat de laatste `dagen` dagen vuurde; null = geen meting */
  vuurt: number | null;
  centrum: Punt3;
}

export interface BreinNeuron {
  id: string;
  /** index in `clusters` */
  c: number;
  p: Punt3;
  /** raadplegingen in de periode */
  v: number;
  /** titel (ingekort) */
  t: string;
  /** bron en herkomst */
  bron: RagSourceType;
  ref: string;
  /** het document in de kennisgraaf, als dit een kennisbankstuk is */
  doc?: string;
}

export interface BreinData {
  op: string;
  clusters: BreinCluster[];
  neuronen: BreinNeuron[];
  /** paren van indexen in `neuronen` */
  lijnen: [number, number][];
  straal: number;
  /** de raadpleegtelling: over hoeveel dagen, en of er ooit iets is gemeten */
  vuur: { dagen: number; gemeten: boolean; totaal: number };
}

interface Geheugen {
  brein?: { op: number; data: BreinData };
}
const g = globalThis as typeof globalThis & { __zfBrein?: Geheugen };
const geheugen: Geheugen = (g.__zfBrein ??= {});
const CACHE_MS = 10 * 60_000;

export function leegBreinCache(): void {
  delete geheugen.brein;
}

const kort = (t: string) => (t.length > 70 ? `${t.slice(0, 70).trimEnd()}…` : t);

export async function breinData(vers = false): Promise<BreinData> {
  const c = geheugen.brein;
  if (!vers && c && Date.now() - c.op < CACHE_MS) return c.data;

  const [graaf, layout, stukken, vuur, voeding] = await Promise.all([
    kennisgraaf(),
    kennisgraafLayout3D(),
    prisma.ragChunk.findMany({ select: { id: true, sourceType: true, sourceRef: true, title: true, chunkIndex: true }, orderBy: [{ sourceRef: "asc" }, { chunkIndex: "asc" }] }),
    vuurStand(7),
    voedingLijst(),
  ]);

  // passage → document → thema
  const passageDoc = new Map<string, string>();
  for (const [docId, d] of documenten()) for (const p of d.passages) passageDoc.set(p.id, docId);
  const themaVanDoc = new Map<string, number>();
  for (const n of graaf.nodes) if (n.thema !== undefined && n.group !== "begrip") themaVanDoc.set(n.id, n.thema);
  const burenVanVoeding = new Map<string, string[]>(voeding.map((v) => [`voeding:${v.id}`, v.buren]));

  // clusters: eerst de thema's van de kennisgraaf, dan de bronnen die voorkomen
  const clusterIdx = new Map<string, number>();
  const clusters: BreinCluster[] = [];
  const maakCluster = (id: string, naam: string, soort: BreinCluster["soort"]) => {
    const bestaand = clusterIdx.get(id);
    if (bestaand !== undefined) return bestaand;
    clusters.push({ id, naam, soort, aantal: 0, vuurt: null, centrum: [0, 0, 0] });
    clusterIdx.set(id, clusters.length - 1);
    return clusters.length - 1;
  };
  for (const t of graaf.themas) maakCluster(`thema:${t.id}`, t.naam, "thema");

  const invoer: BreinNeuronInvoer[] = [];
  const meta = new Map<string, { t: string; bron: RagSourceType; ref: string; doc?: string }>();
  for (const s of stukken) {
    let cluster: number;
    let doc: string | undefined;
    if (s.sourceRef.startsWith("corpus:")) {
      doc = passageDoc.get(s.sourceRef.slice("corpus:".length));
      const thema = doc ? themaVanDoc.get(doc) : undefined;
      cluster = thema !== undefined ? maakCluster(`thema:${thema}`, graaf.themas.find((t) => t.id === thema)?.naam ?? `Thema ${thema}`, "thema") : maakCluster(`bron:${s.sourceType}`, BRON_NAAM[s.sourceType], "bron");
    } else {
      cluster = maakCluster(`bron:${s.sourceType}`, BRON_NAAM[s.sourceType], "bron");
    }
    const buren = burenVanVoeding.get(s.sourceRef);
    invoer.push({ id: s.id, cluster, sourceRef: s.sourceRef, chunkIndex: s.chunkIndex, ...(doc ? { docId: doc } : {}), ...(buren && buren.length > 0 ? { buren } : {}) });
    meta.set(s.id, { t: kort(s.title), bron: s.sourceType, ref: s.sourceRef, ...(doc ? { doc } : {}) });
  }

  const { centra, straal } = clusterCentra(clusters.length, invoer.length);
  clusters.forEach((cl, i) => {
    cl.centrum = centra[i] ?? [0, 0, 0];
  });
  // de documentlayout ligt om de thema-middelpunten van de documentgraaf; brein-layout verplaatst die naar het cluster
  const docCentra: Record<string, Punt3> = {};
  for (const [docId, thema] of themaVanDoc) {
    const c2 = layout.centra[thema];
    if (c2) docCentra[docId] = c2;
  }
  const posities = neuronPosities(invoer, centra, layout.posities, docCentra);
  const docLijnen = graaf.edges.filter((e) => e.soort !== "begrip").map((e) => ({ source: e.source, target: e.target }));
  const lijnen = neuronLijnen(invoer, docLijnen);

  const neuronen: BreinNeuron[] = invoer.map((n) => {
    const m = meta.get(n.id)!;
    return { id: n.id, c: n.cluster, p: posities[n.id] ?? [0, 0, 0], v: vuur.perNeuron.get(n.id) ?? 0, t: m.t, bron: m.bron, ref: m.ref, ...(m.doc ? { doc: m.doc } : {}) };
  });
  const perCluster = new Map<number, string[]>();
  for (const n of neuronen) perCluster.set(n.c, [...(perCluster.get(n.c) ?? []), n.id]);
  clusters.forEach((cl, i) => {
    const ids = perCluster.get(i) ?? [];
    cl.aantal = ids.length;
    cl.vuurt = vuurPercentage(ids, vuur.perNeuron, vuur.gemeten);
  });

  const data: BreinData = {
    op: new Date().toISOString(),
    clusters,
    neuronen,
    lijnen,
    straal,
    vuur: { dagen: vuur.dagen, gemeten: vuur.gemeten, totaal: [...vuur.perNeuron.values()].reduce((s, v) => s + v, 0) },
  };
  geheugen.brein = { op: Date.now(), data };
  return data;
}
