import { chatJson, fastModel, llmConfigProblem } from "@/lib/ai/client";
import { tokenize } from "@/lib/rag/lexical";
import { dot, embedLocal, type VectorIndex } from "@/lib/rag/vector-local";
import type { Passage } from "@/lib/rag/corpus";

// ---------------------------------------------------------------------------
// Reranking — second stage over the fused candidates.
//   1. cross-scorer (always): looks at query AND passage together — term
//      coverage, title match, word-pair (bigram) matches, proximity of the
//      matched words, dense similarity and the first-stage rank;
//   2. model reranker (when a model is connected): the fast model orders the
//      candidates listwise; blended 50/50 with the cross-score;
//   3. MMR diversity: near-duplicate chunks don't take two of the top slots.
// ---------------------------------------------------------------------------

export interface Rerankable extends Passage {
  score: number;
}

export interface Reranked<T extends Rerankable> {
  item: T;
  rerank: number;
  features: Record<string, number>;
}

function bigrams(toks: string[]): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i + 1 < toks.length; i++) s.add(`${toks[i]}_${toks[i + 1]}`);
  return s;
}

/** Smallest window (in tokens) containing every matched query term. */
function proximity(q: string[], doc: string[]): number {
  const want = new Set(q.filter((t) => doc.includes(t)));
  if (want.size <= 1) return want.size ? 1 : 0;
  let best = Infinity;
  const count = new Map<string, number>();
  let have = 0;
  let left = 0;
  for (let right = 0; right < doc.length; right++) {
    const t = doc[right]!;
    if (want.has(t)) {
      count.set(t, (count.get(t) ?? 0) + 1);
      if (count.get(t) === 1) have++;
    }
    while (have === want.size) {
      best = Math.min(best, right - left + 1);
      const l = doc[left]!;
      if (want.has(l)) {
        count.set(l, count.get(l)! - 1);
        if (count.get(l) === 0) have--;
      }
      left++;
    }
  }
  return best === Infinity ? 0 : Math.min(1, want.size / best) ** 0.5;
}

const has = (toks: string[], t: string) => toks.includes(t) || (t.length >= 5 && toks.some((x) => x.length >= 5 && (x.includes(t) || t.includes(x))));

export function crossScore(query: string, p: Passage, rankPrior: number, vIdx?: VectorIndex): Record<string, number> {
  const q = [...new Set(tokenize(query))];
  const title = tokenize(p.title);
  const body = tokenize(p.text);
  const all = [...title, ...body];
  const coverage = q.length ? q.filter((t) => has(all, t)).length / q.length : 0;
  const titleCoverage = q.length ? q.filter((t) => has(title, t)).length / q.length : 0;
  const qb = bigrams(q.length > 1 ? tokenize(query) : []);
  const db = bigrams(all);
  const bigram = qb.size ? [...qb].filter((b) => db.has(b)).length / qb.size : 0;
  const prox = proximity(q, all);
  const dense = vIdx ? Math.max(0, dot(embedLocal(vIdx, query), embedLocal(vIdx, `${p.title}\n${p.text}`))) : 0;
  const total = 0.3 * coverage + 0.15 * titleCoverage + 0.15 * bigram + 0.1 * prox + 0.2 * dense + 0.1 * rankPrior;
  return { coverage, titleCoverage, bigram, proximity: prox, dense, prior: rankPrior, total };
}

async function modelOrder(query: string, items: Passage[]): Promise<Map<string, number> | null> {
  if (llmConfigProblem() || items.length < 2) return null;
  try {
    const out = await chatJson<{ order?: number[] }>({
      purpose: "rag-rerank",
      model: fastModel(),
      temperature: 0,
      maxTokens: 80,
      retry: false,
      timeoutMs: 8_000,
      messages: [
        { role: "system", content: 'Rangschik de fragmenten op hoe goed ze de vraag beantwoorden, beste eerst. Laat irrelevante fragmenten weg. Antwoord als JSON {"order": [nummers]}.' },
        { role: "user", content: `VRAAG: ${query}\n\n${items.map((p, i) => `[${i + 1}] ${p.title}: ${p.text.slice(0, 280)}`).join("\n")}` },
      ],
    });
    const m = new Map<string, number>();
    (out.order ?? []).forEach((n, rank) => {
      const p = items[n - 1];
      if (p && !m.has(p.id)) m.set(p.id, 1 - rank / items.length);
    });
    return m.size ? m : null;
  } catch {
    return null;
  }
}

export interface RerankOptions {
  k?: number;
  vIdx?: VectorIndex;
  useModel?: boolean;
  /** MMR trade-off: 1 = pure relevance, lower = more diverse */
  lambda?: number;
}

export async function rerank<T extends Rerankable>(query: string, items: T[], opts: RerankOptions = {}): Promise<Reranked<T>[]> {
  const k = opts.k ?? 5;
  if (!items.length) return [];
  let scored: Reranked<T>[] = items.map((item, i) => {
    const features = crossScore(query, item, 1 - i / items.length, opts.vIdx);
    return { item, rerank: features.total!, features };
  });

  if (opts.useModel ?? true) {
    const order = await modelOrder(query, items.slice(0, 10));
    if (order) {
      scored = scored.map((s) => {
        const m = order.get(s.item.id) ?? 0;
        return { ...s, rerank: 0.5 * s.rerank + 0.5 * m, features: { ...s.features, model: m } };
      });
    }
  }

  // MMR over the brain-vector space
  const lambda = opts.lambda ?? 0.8;
  const vecs = opts.vIdx ? scored.map((s) => embedLocal(opts.vIdx!, `${s.item.title}\n${s.item.text}`)) : null;
  const pool = scored.map((s, i) => ({ s, i })).sort((a, b) => b.s.rerank - a.s.rerank);
  const picked: { s: Reranked<T>; i: number }[] = [];
  while (picked.length < k && pool.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    pool.forEach((c, idx) => {
      const sim = vecs && picked.length ? Math.max(...picked.map((p) => dot(vecs[c.i]!, vecs[p.i]!))) : 0;
      const val = lambda * c.s.rerank - (1 - lambda) * sim;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = idx;
      }
    });
    picked.push(pool.splice(bestIdx, 1)[0]!);
  }
  return picked.map((p) => p.s);
}
