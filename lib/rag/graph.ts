import { corpus, type Passage } from "@/lib/rag/corpus";

// ---------------------------------------------------------------------------
// Obsidian-achtige grafiek van de kennisbank (het "brein"): elke node is een
// document (interne platformdoc, kennisbank-gids, blog, whitepaper, FAQ …),
// elke lijn een verwantschap afgeleid uit term-overlap tussen twee documenten.
// Puur uit de code-geshipte corpus (geen DB, geen embeddingmodel), dus het werkt
// op elke deploy. Edges worden gecapt (top-K per node) zodat het geen kluwen wordt.
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  size: number;
  href?: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}
export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
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
function docOf(p: Passage): { docId: string; label: string; group: string; href?: string } {
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

export function knowledgeGraph(): KnowledgeGraphData {
  // Aggregeer passages → documenten.
  const docs = new Map<string, { node: GraphNode; text: string }>();
  for (const p of corpus()) {
    const d = docOf(p);
    const existing = docs.get(d.docId);
    if (existing) {
      existing.node.size += 1;
      existing.text += " " + p.title + " " + p.text;
    } else {
      docs.set(d.docId, {
        node: { id: d.docId, label: d.label, group: d.group, size: 1, ...(d.href ? { href: d.href } : {}) },
        text: `${d.label} ${p.title} ${p.text}`,
      });
    }
  }

  const entries = [...docs.values()];
  const vecs = entries.map((e) => terms(e.text));

  // Per node de sterkste edges; union zodat een edge telt als één van beide 'm koos.
  const picked = new Map<string, GraphEdge>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let i = 0; i < entries.length; i++) {
    const scored: { j: number; w: number }[] = [];
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const w = jaccard(vecs[i]!, vecs[j]!);
      if (w >= MIN_WEIGHT) scored.push({ j, w });
    }
    scored.sort((a, b) => b.w - a.w);
    for (const { j, w } of scored.slice(0, TOP_PER_NODE)) {
      const a = entries[i]!.node.id;
      const b = entries[j]!.node.id;
      picked.set(key(a, b), { source: a, target: b, weight: Math.round(w * 100) / 100 });
    }
  }

  return {
    nodes: entries.map((e) => e.node).sort((a, b) => b.size - a.size),
    edges: [...picked.values()],
  };
}
