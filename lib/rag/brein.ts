import type { RagSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { documenten, kennisgraaf, kennisgraafLayout3D } from "@/lib/rag/graph";
import { clusterCentra, neuronLijnen, neuronPosities, vuurPercentage, type BreinNeuronInvoer } from "@/lib/rag/brein-layout";
import type { Punt3 } from "@/lib/rag/graph-layout3d";
import { vuurStand } from "@/lib/rag/vuren";
import { voedingLijst } from "@/lib/rag/voeding";
import { clusterUitleg, leesSlim, type OntdektStand } from "@/lib/rag/slim";

// ---------------------------------------------------------------------------
// Het Brein: alle geheugenstukken (RagChunk) als neuronen in 3D, geclusterd per
// thema van de kennisgraaf (de stukken uit de kennisbank) en per bron (code,
// auditspoor, platformstand, wetgeving, sales, gesprekken en voeding), én in de
// thema's die het brein zelf op betekenis ontdekt (lib/rag/slim.ts). Alleen echte
// gegevens: de stukken uit de database, de thema's uit de graaf, de posities
// deterministisch uit lib/rag/brein-layout.ts, de synapsen uit de echte embeddings
// en "vuurt" uit de raadpleegtelling (lib/rag/vuren.ts). Tien minuten in het
// geheugen; voeden maakt de cache leeg.
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
  /** index in `clusters` (bron of thema van de kennisgraaf) */
  c: number;
  p: Punt3;
  /** index in `ontdekt.clusters` en de plek in die indeling; ontbreekt zolang het brein nog niet heeft gerekend */
  o?: number;
  q?: Punt3;
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

export interface BreinOntdekt {
  op: string;
  clusters: { id: string; naam: string; termen: string[]; aantal: number; vuurt: number | null; centrum: Punt3 }[];
}

export interface BreinData {
  op: string;
  clusters: BreinCluster[];
  neuronen: BreinNeuron[];
  /** paren van indexen in `neuronen`: opeenvolgende stukken, voeding en verbonden documenten */
  lijnen: [number, number][];
  /** synapsen: echte betekenisverwanten (cosinus), als [index, index, sterkte]; leeg zolang het brein nog niet heeft gerekend */
  synapsen: [number, number, number][];
  /** de thema's die het brein zelf ontdekte, met een tweede indeling van de neuronen (q) */
  ontdekt: BreinOntdekt | null;
  /** stil geheugen: stukken zonder raadpleging en zonder synaps */
  stil: { aantal: number; voorbeelden: { id: string; t: string; ref: string }[] } | null;
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

  const [graaf, layout, stukken, vuur, voeding, slim] = await Promise.all([
    kennisgraaf(),
    kennisgraafLayout3D(),
    prisma.ragChunk.findMany({ select: { id: true, sourceType: true, sourceRef: true, title: true, chunkIndex: true }, orderBy: [{ sourceRef: "asc" }, { chunkIndex: "asc" }] }),
    vuurStand(7),
    voedingLijst(),
    leesSlim(),
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

  // de tweede indeling: de thema's die het brein zelf ontdekte (zonder documentgroepering, wel per bron geklonterd)
  const ontdekt = slim.ontdekt;
  const ontdektIndeling = ontdekt ? tweedeIndeling(invoer, ontdekt) : null;

  const idx = new Map<string, number>(invoer.map((n, i) => [n.id, i]));
  const synapsenLijst: [number, number, number][] = [];
  const metSynaps = new Set<string>();
  if (slim.synapsen) {
    for (const [a, b, s] of slim.synapsen.paren) {
      const i = idx.get(a);
      const j = idx.get(b);
      if (i === undefined || j === undefined) continue;
      synapsenLijst.push([i, j, s]);
      metSynaps.add(a);
      metSynaps.add(b);
    }
  }

  const neuronen: BreinNeuron[] = invoer.map((n) => {
    const m = meta.get(n.id)!;
    const o = ontdekt?.per[n.id];
    const q = ontdektIndeling?.posities[n.id];
    return {
      id: n.id,
      c: n.cluster,
      p: posities[n.id] ?? [0, 0, 0],
      ...(o !== undefined && q ? { o, q } : {}),
      v: vuur.perNeuron.get(n.id) ?? 0,
      t: m.t,
      bron: m.bron,
      ref: m.ref,
      ...(m.doc ? { doc: m.doc } : {}),
    };
  });
  const perCluster = new Map<number, string[]>();
  for (const n of neuronen) perCluster.set(n.c, [...(perCluster.get(n.c) ?? []), n.id]);
  clusters.forEach((cl, i) => {
    const ids = perCluster.get(i) ?? [];
    cl.aantal = ids.length;
    cl.vuurt = vuurPercentage(ids, vuur.perNeuron, vuur.gemeten);
  });

  let ontdektUit: BreinOntdekt | null = null;
  if (ontdekt && ontdektIndeling) {
    const perO = new Map<number, string[]>();
    for (const n of neuronen) if (n.o !== undefined) perO.set(n.o, [...(perO.get(n.o) ?? []), n.id]);
    ontdektUit = {
      op: ontdekt.op,
      clusters: ontdekt.themas.map((t, i) => ({
        id: `ontdekt:${t.id}`,
        naam: t.naam,
        termen: t.termen,
        aantal: perO.get(i)?.length ?? 0,
        vuurt: vuurPercentage(perO.get(i) ?? [], vuur.perNeuron, vuur.gemeten),
        centrum: ontdektIndeling.centra[i] ?? [0, 0, 0],
      })),
    };
  }

  // stil geheugen: nooit geraadpleegd en zonder betekenisverwant (alleen zinvol als er gemeten en gerekend is)
  let stil: BreinData["stil"] = null;
  if (vuur.gemeten && slim.synapsen) {
    const stille = neuronen.filter((n) => n.v === 0 && !metSynaps.has(n.id));
    stil = { aantal: stille.length, voorbeelden: stille.slice(0, 8).map((n) => ({ id: n.id, t: n.t, ref: n.ref })) };
  }

  const data: BreinData = {
    op: new Date().toISOString(),
    clusters,
    neuronen,
    lijnen,
    synapsen: synapsenLijst,
    ontdekt: ontdektUit,
    stil,
    straal,
    vuur: { dagen: vuur.dagen, gemeten: vuur.gemeten, totaal: [...vuur.perNeuron.values()].reduce((s, v) => s + v, 0) },
  };
  geheugen.brein = { op: Date.now(), data };
  return data;
}

/** De plekken van de neuronen in de ontdekte thema's: zelfde rekenwerk, andere clusters. */
function tweedeIndeling(invoer: readonly BreinNeuronInvoer[], ontdekt: OntdektStand): { posities: Record<string, Punt3>; centra: Punt3[] } {
  const k = ontdekt.themas.length;
  const { centra } = clusterCentra(k, invoer.length);
  const invoer2: BreinNeuronInvoer[] = invoer.map((n) => ({ id: n.id, cluster: ontdekt.per[n.id] ?? 0, sourceRef: n.sourceRef, chunkIndex: n.chunkIndex, ...(n.buren ? { buren: n.buren } : {}) }));
  return { posities: neuronPosities(invoer2, centra, {}, {}), centra };
}

/** De uitleg van één cluster (bron/thema of ontdekt) door het taalmodel, uit zijn echte stukken. */
export async function breinUitleg(clusterId: string): Promise<{ clusterId: string; naam: string; tekst: string; stukken: number; bron: "model" | "geen-model" | "storing" } | null> {
  const d = await breinData();
  let naam: string | null = null;
  let ids: string[] = [];
  const i = d.clusters.findIndex((c) => c.id === clusterId);
  if (i >= 0) {
    naam = d.clusters[i]!.naam;
    ids = d.neuronen.filter((n) => n.c === i).map((n) => n.id);
  } else if (d.ontdekt) {
    const j = d.ontdekt.clusters.findIndex((c) => c.id === clusterId);
    if (j >= 0) {
      naam = d.ontdekt.clusters[j]!.naam;
      ids = d.neuronen.filter((n) => n.o === j).map((n) => n.id);
    }
  }
  if (naam === null) return null;
  const u = await clusterUitleg(clusterId, ids, d.op);
  return { clusterId, naam, ...u };
}

export { clusterUitleg };
