import { FULL_FAQ, GUIDES } from "@/lib/kennis/content";
import { dbaFaqFlat } from "@/lib/kennis/dba";
import { werkgeverHelpFlat } from "@/lib/kennis/werkgevers-help";
import { WHITEPAPERS } from "@/lib/kennis/whitepapers";

// ---------------------------------------------------------------------------
// Knowledge base for the public chat assistant. Pulls straight from the
// Kennis pages (FAQ, Wet DBA-kenniscentrum, Helpcentrum werkgevers,
// kennisbank-gidsen, whitepapers) — one source of truth, no duplicated
// answers to drift out of sync. `searchKnowledge` does a lightweight
// keyword-overlap retrieval (no embeddings, no external calls) so the chat
// route can ground its answer in the same facts the website shows.
// ---------------------------------------------------------------------------

export interface KnowledgeItem {
  q: string;
  a: string;
  source: string;
}

let cache: KnowledgeItem[] | null = null;

export function allPublicKnowledge(): KnowledgeItem[] {
  if (cache) return cache;
  const items: KnowledgeItem[] = [];

  for (const group of FULL_FAQ) {
    for (const it of group.items) items.push({ q: it.q, a: it.a, source: `FAQ · ${group.category}` });
  }
  for (const it of dbaFaqFlat()) items.push({ q: it.q, a: it.a, source: "Wet DBA-kenniscentrum" });
  for (const it of werkgeverHelpFlat()) items.push({ q: it.q, a: it.a, source: "Helpcentrum werkgevers" });
  for (const g of GUIDES) items.push({ q: g.title, a: g.excerpt, source: `Kennisbank · ${g.category}` });
  for (const w of WHITEPAPERS) items.push({ q: `Whitepaper: ${w.title}`, a: w.intro, source: "Whitepaper" });

  cache = items;
  return items;
}

const STOPWORDS = new Set(
  "de het een en van is in op voor je jij ik dat dit hoe wat wanneer kan kun met als niet ook of aan zijn er bij naar dan zo maar deze die worden word wordt om te tot heb hebt heeft nog wel geen mijn jouw uw zijn hun".split(
    " ",
  ),
);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Top-k knowledge items whose question/answer share the most keywords with `query`. */
export function searchKnowledge(query: string, k = 4): KnowledgeItem[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];

  const scored = allPublicKnowledge().map((item) => {
    const hay = tokenize(`${item.q} ${item.a}`);
    let score = 0;
    for (const t of qTokens) {
      if (hay.includes(t)) score += 2;
      else if (hay.some((h) => h.length > 3 && (h.startsWith(t) || t.startsWith(h)))) score += 1;
    }
    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.item);
}
