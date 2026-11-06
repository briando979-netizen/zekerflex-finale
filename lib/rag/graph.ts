import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { corpus, type Passage } from "@/lib/rag/corpus";
import { cosine } from "@/lib/rag/store";
import { recall } from "@/lib/rag/recall";
import { conceptenUit, hiaten, naarGraphML, pagerank, verbondenDelen, type Begrip, type GraafKnoop, type GraafLijn, type Hiaten } from "@/lib/rag/graph-analyse";

// ---------------------------------------------------------------------------
// De Kennisgraaf: het brein van ZekerFlex als netwerk. Elke knoop is een document
// (interne platformdoc, kennisbank-gids, blog, whitepaper, FAQ …) of een begrip;
// elke lijn een verwantschap:
//   begrippen   — overlap in woorden tussen twee documenten (Jaccard), altijd
//   semantisch  — de echte embeddings uit de RagChunk-index (nomic, 768 dim),
//                 gemiddeld per document, als die er zijn
//   begrip      — een begrip (TF-IDF) hangt aan de documenten waarin het zwaar weegt
// Erbij: clusters, PageRank (welk document is het meest centraal), hiaten, een
// detail per knoop en het denkpad van een vraag (welke knopen het brein pakt).
// De corpusgraaf komt uit de code en werkt op elke uitrol; de semantische laag
// komt uit de database en valt stil weg als de index er niet is.
// ---------------------------------------------------------------------------

export type GraphNode = GraafKnoop;
export type GraphEdge = GraafLijn;

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Cluster {
  id: number;
  grootte: number;
  /** de drie meest centrale documenten van het deel */
  kern: { id: string; label: string }[];
  groepen: Record<string, number>;
}

export interface Kennisgraaf extends KnowledgeGraphData {
  begrippen: Begrip[];
  clusters: Cluster[];
  /** de meest centrale documenten (PageRank × 1000) */
  centraal: { id: string; label: string; group: string; score: number }[];
  hiaten: Hiaten;
  /** passages per publiek */
  publiek: Record<string, number>;
  /** chunks in het geheugen (RagChunk) per bron; leeg zonder index */
  geheugen: Record<string, number>;
  /** hoeveel documenten een semantische vector hadden */
  semantisch: number;
  op: string;
}

const STOP = new Set([
  "de", "het", "een", "en", "van", "voor", "met", "op", "in", "te", "is", "dat", "die", "niet", "zijn", "aan",
  "als", "naar", "ook", "maar", "om", "per", "uur", "je", "we", "er", "of", "dan", "bij", "tot", "wordt", "worden",
  "deze", "dit", "zo", "nog", "wel", "geen", "door", "over", "uit", "kan", "kun", "moet", "hun", "hij", "zij",
  "the", "and", "for", "with", "you", "your", "are", "this", "that", "from", "per", "into", "has", "have",
]);

function labelFromSlug(slug: string): string {
  const s = slug.replace(/^\d+-/, "").replace(/-/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Groepeer een passage naar het document waar hij bij hoort. */
export function docOf(p: Passage): { docId: string; label: string; group: string; href?: string } {
  const id = p.id;
  const seg = (s: string) => s.split("#")[0] ?? s;
  if (id.startsWith("kb:")) {
    const file = seg(id.slice(3));
    return { docId: `kb:${file}`, label: labelFromSlug(file.replace(/\.md$/, "")), group: "intern" };
  }
  if (id.startsWith("guide:")) {
    const slug = seg(id.slice(6));
    return { docId: `guide:${slug}`, label: labelFromSlug(slug), group: "kennisbank", href: `/kennis/${slug}` };
  }
  if (id.startsWith("blog:")) {
    const slug = seg(id.slice(5));
    return { docId: `blog:${slug}`, label: labelFromSlug(slug), group: "blog", href: `/kennis/blog/${slug}` };
  }
  if (id.startsWith("wp:")) {
    const slug = seg(id.slice(3));
    return { docId: `wp:${slug}`, label: labelFromSlug(slug), group: "whitepaper", href: `/kennis/whitepapers/${slug}` };
  }
  if (id.startsWith("faq:")) {
    const cat = id.split(":")[1] ?? "algemeen";
    return { docId: `faq:${cat}`, label: `FAQ: ${cat}`, group: "faq", href: "/kennis/faq" };
  }
  if (id.startsWith("dba:")) return { docId: "dba", label: "Wet DBA", group: "wet-dba", href: "/kennis/wet-dba" };
  if (id.startsWith("help:")) return { docId: "help", label: "Helpcentrum werkgevers", group: "help", href: "/kennis/werkgevers" };
  if (id.startsWith("howto:")) return { docId: "howto", label: "Hulp in de app", group: "howto" };
  return { docId: id, label: p.title, group: "overig" };
}

function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{4,}/g) ?? []) {
    if (!STOP.has(w)) out.add(w);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

const TOP_PER_NODE = 3;
const MIN_WEIGHT = 0.05;
/** vanaf deze cosinus telt de semantische laag mee (nomic-vectoren liggen dicht bij elkaar) */
const MIN_COSINE = 0.5;

interface Doc {
  node: GraphNode;
  text: string;
  passages: Passage[];
  terms: Set<string>;
  audience: Set<string>;
}

let docCache: Map<string, Doc> | null = null;

/** Documenten uit de corpus, met passages en termen; één keer per serverinstantie. */
export function documenten(): Map<string, Doc> {
  if (docCache) return docCache;
  const docs = new Map<string, Doc>();
  for (const p of corpus()) {
    const d = docOf(p);
    const existing = docs.get(d.docId);
    if (existing) {
      existing.node.size += 1;
      existing.text += " " + p.title + " " + p.text;
      existing.passages.push(p);
      for (const a of p.audience) existing.audience.add(a);
    } else {
      docs.set(d.docId, {
        node: { id: d.docId, label: d.label, group: d.group, size: 1, ...(d.href ? { href: d.href } : {}) },
        text: `${d.label} ${p.title} ${p.text}`,
        passages: [p],
        terms: new Set(),
        audience: new Set(p.audience),
      });
    }
  }
  for (const d of docs.values()) d.terms = terms(d.text);
  docCache = docs;
  return docs;
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Per document de sterkste lijnen (woordoverlap, plus de semantische score als die er is). */
function lijnenTussen(entries: Doc[], vectoren: Map<string, number[]>): GraphEdge[] {
  const picked = new Map<string, GraphEdge>();
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i]!;
    const va = vectoren.get(a.node.id);
    const scored: { j: number; w: number; soort: GraphEdge["soort"] }[] = [];
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const b = entries[j]!;
      const jac = jaccard(a.terms, b.terms);
      const vb = vectoren.get(b.node.id);
      // boven MIN_COSINE telt elke 0,1 cosinus als een flinke woordoverlap
      const sem = va && vb ? Math.max(0, cosine(va, vb) - MIN_COSINE) * 2 : 0;
      const w = jac + sem;
      if (w >= MIN_WEIGHT) scored.push({ j, w, soort: sem > jac ? "semantisch" : "begrippen" });
    }
    scored.sort((x, y) => y.w - x.w);
    for (const { j, w, soort } of scored.slice(0, TOP_PER_NODE)) {
      const k = key(a.node.id, entries[j]!.node.id);
      const bestaand = picked.get(k);
      if (!bestaand || bestaand.weight < w) picked.set(k, { source: a.node.id, target: entries[j]!.node.id, weight: Math.round(w * 100) / 100, soort });
    }
  }
  return [...picked.values()];
}

/** De graaf zonder database: documenten + woordoverlap. Werkt op elke uitrol. */
export function knowledgeGraph(): KnowledgeGraphData {
  const entries = [...documenten().values()];
  return {
    nodes: entries.map((e) => e.node).sort((a, b) => b.size - a.size),
    edges: lijnenTussen(entries, new Map()),
  };
}

/** Gemiddelde embedding per document uit de RagChunk-index (sourceRef "corpus:<passage-id>"). */
async function documentVectoren(): Promise<Map<string, number[]>> {
  const uit = new Map<string, number[]>();
  try {
    const rows = await prisma.ragChunk.findMany({
      where: { sourceRef: { startsWith: "corpus:" } },
      select: { sourceRef: true, embedding: true },
    });
    const som = new Map<string, { v: number[]; n: number }>();
    const passageDoc = new Map<string, string>();
    for (const [docId, d] of documenten()) for (const p of d.passages) passageDoc.set(p.id, docId);
    for (const r of rows) {
      const docId = passageDoc.get(r.sourceRef.slice("corpus:".length));
      if (!docId || r.embedding.length === 0) continue;
      const s = som.get(docId);
      if (!s) som.set(docId, { v: [...r.embedding], n: 1 });
      else if (s.v.length === r.embedding.length) {
        for (let i = 0; i < s.v.length; i++) s.v[i] = (s.v[i] ?? 0) + (r.embedding[i] ?? 0);
        s.n += 1;
      }
    }
    for (const [docId, s] of som) uit.set(docId, s.v.map((x) => x / s.n));
  } catch (e) {
    logger.warn("kennisgraaf: geen semantische laag", { error: (e as Error).message });
  }
  return uit;
}

async function geheugenStats(): Promise<Record<string, number>> {
  try {
    const g = await prisma.ragChunk.groupBy({ by: ["sourceType"], _count: { _all: true } });
    return Object.fromEntries(g.map((x) => [x.sourceType, x._count._all]));
  } catch {
    return {};
  }
}

interface Geheugen {
  graaf?: { op: number; data: Kennisgraaf };
}
const g = globalThis as typeof globalThis & { __zfKennisgraaf?: Geheugen };
const geheugen: Geheugen = (g.__zfKennisgraaf ??= {});
const CACHE_MS = 10 * 60_000;

/** De volledige Kennisgraaf (documenten + begrippen + semantische laag + analyse); tien minuten in het geheugen. */
export async function kennisgraaf(vers = false): Promise<Kennisgraaf> {
  const c = geheugen.graaf;
  if (!vers && c && Date.now() - c.op < CACHE_MS) return c.data;

  const docs = documenten();
  const entries = [...docs.values()];
  const [vectoren, geheugenPerBron] = await Promise.all([documentVectoren(), geheugenStats()]);
  const docLijnen = lijnenTussen(entries, vectoren);

  const begrippen = conceptenUit(entries.map((e) => ({ id: e.node.id, text: e.text })), 40, 8);
  const begripKnopen: GraphNode[] = begrippen.map((b) => ({ id: b.id, label: b.label, group: "begrip", size: b.docs.length }));
  const begripLijnen: GraphEdge[] = begrippen.flatMap((b) => b.docs.map((d) => ({ source: b.id, target: d.docId, weight: Math.min(1, d.gewicht * 10), soort: "begrip" as const })));

  const docIds = entries.map((e) => e.node.id);
  const pr = pagerank(docIds, docLijnen);
  const labelVan = (id: string) => docs.get(id)?.node.label ?? id;
  const clusters: Cluster[] = verbondenDelen(docIds, docLijnen).map((deel, i) => {
    const groepen: Record<string, number> = {};
    for (const id of deel) {
      const gr = docs.get(id)?.node.group ?? "overig";
      groepen[gr] = (groepen[gr] ?? 0) + 1;
    }
    const kern = [...deel].sort((a, b) => (pr.get(b) ?? 0) - (pr.get(a) ?? 0)).slice(0, 3).map((id) => ({ id, label: labelVan(id) }));
    return { id: i + 1, grootte: deel.length, kern, groepen };
  });
  const centraal = [...pr]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, s]) => ({ id, label: labelVan(id), group: docs.get(id)?.node.group ?? "overig", score: Math.round(s * 1000) }));

  const publiek: Record<string, number> = {};
  for (const p of corpus()) for (const a of p.audience) publiek[a] = (publiek[a] ?? 0) + 1;

  const nodes = [...entries.map((e) => e.node).sort((a, b) => b.size - a.size), ...begripKnopen];
  const edges = [...docLijnen, ...begripLijnen];
  const data: Kennisgraaf = {
    nodes,
    edges,
    begrippen,
    clusters,
    centraal,
    hiaten: hiaten(nodes, edges, begrippen),
    publiek,
    geheugen: geheugenPerBron,
    semantisch: vectoren.size,
    op: new Date().toISOString(),
  };
  geheugen.graaf = { op: Date.now(), data };
  return data;
}

export interface KnoopDetail {
  node: GraphNode;
  /** passages van een document (ingekort), of de documenten van een begrip */
  passages: { id: string; title: string; tekst: string; href?: string }[];
  buren: { id: string; label: string; group: string; weight: number; soort: GraphEdge["soort"] }[];
  begrippen: string[];
  publiek: string[];
}

/** Alles over één knoop: passages, buren en begrippen. */
export async function knoopDetail(id: string): Promise<KnoopDetail | null> {
  const graaf = await kennisgraaf();
  const node = graaf.nodes.find((n) => n.id === id);
  if (!node) return null;
  const byId = new Map(graaf.nodes.map((n) => [n.id, n]));
  const buren = graaf.edges
    .filter((e) => e.source === id || e.target === id)
    .map((e) => {
      const ander = byId.get(e.source === id ? e.target : e.source);
      return ander ? { id: ander.id, label: ander.label, group: ander.group, weight: e.weight, soort: e.soort } : null;
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12);
  const kort = (t: string) => (t.length > 320 ? `${t.slice(0, 320).trimEnd()}…` : t);
  if (node.group === "begrip") {
    const begrip = graaf.begrippen.find((b) => b.id === id);
    const docs = documenten();
    return {
      node,
      passages: (begrip?.docs ?? []).map((d) => {
        const doc = docs.get(d.docId);
        return { id: d.docId, title: doc?.node.label ?? d.docId, tekst: kort(doc?.passages[0]?.text ?? ""), ...(doc?.node.href ? { href: doc.node.href } : {}) };
      }),
      buren,
      begrippen: [],
      publiek: [],
    };
  }
  const doc = documenten().get(id);
  return {
    node,
    passages: (doc?.passages ?? []).slice(0, 12).map((p) => ({ id: p.id, title: p.title, tekst: kort(p.text), ...(p.href ? { href: p.href } : {}) })),
    buren,
    begrippen: graaf.begrippen.filter((b) => b.docs.some((d) => d.docId === id)).map((b) => b.label),
    publiek: [...(doc?.audience ?? [])],
  };
}

export interface Denkpad {
  vraag: string;
  confident: boolean;
  retrievers: string[];
  /** documenten die het brein pakt, met de sterkste passage en via welke zoekers */
  stappen: { id: string; label: string; group: string; score: number; via: string[]; passage: string }[];
}

/** Welke knopen het brein pakt voor een vraag: hetzelfde pad als de website-chat en Jarvis, als beheerder. */
export async function denkpad(vraag: string): Promise<Denkpad> {
  const r = await recall(vraag, { role: "admin", k: 10 });
  const perDoc = new Map<string, Denkpad["stappen"][number]>();
  for (const h of r.hits) {
    const d = docOf(h);
    const bestaand = perDoc.get(d.docId);
    if (bestaand) {
      bestaand.score += h.score;
      for (const v of h.via) if (!bestaand.via.includes(v)) bestaand.via.push(v);
    } else {
      perDoc.set(d.docId, { id: d.docId, label: d.label, group: d.group, score: h.score, via: [...h.via], passage: h.title });
    }
  }
  return {
    vraag,
    confident: r.confident,
    retrievers: r.retrievers,
    stappen: [...perDoc.values()].sort((a, b) => b.score - a.score).map((s) => ({ ...s, score: Math.round(s.score * 1000) / 1000 })),
  };
}

export async function kennisgraafGraphML(): Promise<string> {
  const g2 = await kennisgraaf();
  return naarGraphML(g2.nodes, g2.edges);
}
