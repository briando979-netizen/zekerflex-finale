// ---------------------------------------------------------------------------
// BM25 keyword search — the half of the RAG brain that needs no model at all.
// Dutch-aware tokenizer (stopwords + light suffix stemming) so "uitbetaling",
// "uitbetalingen" and "uitbetaald" meet. Pure and in-memory: the corpus is a
// few hundred passages, so building the index takes milliseconds.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "de het een en van is in op voor je jij ik dat dit hoe wat wanneer waar waarom wie kan kun kunnen met als niet ook of aan zijn er bij naar dan zo " +
    "maar deze die worden word wordt om te tot heb hebt heeft nog wel geen mijn jouw uw hun me mij we wij ze zij hij u moet moeten mag mogen wil " +
    "the a an and of to is in on for how what when where why can i my you your do does"
  ).split(" "),
);

/** Light Dutch stemmer: strips the most common inflection endings. */
export function stem(w: string): string {
  if (w.length <= 4) return w;
  let out = w;
  for (const suf of ["ingen", "ing", "heden", "heid", "tjes", "tje", "en", "es", "er", "e", "s", "d", "t"]) {
    if (out.endsWith(suf) && out.length - suf.length >= 4) {
      out = out.slice(0, -suf.length);
      break;
    }
  }
  // betaald / betaling / betalen → "betal"; bestellen → "bestel"
  return out.replace(/([aeou])\1/g, "$1").replace(/([bdfgklmnprst])\1$/, "$1");
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

export interface LexDoc {
  id: string;
  title: string;
  text: string;
}

export interface LexIndex<D extends LexDoc> {
  docs: D[];
  tf: Map<string, number>[];
  len: number[];
  df: Map<string, number>;
  avgLen: number;
}

export function buildIndex<D extends LexDoc>(docs: D[]): LexIndex<D> {
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  for (const d of docs) {
    // the title counts double: a question that matches the heading is the best hit
    const toks = [...tokenize(d.title), ...tokenize(d.title), ...tokenize(d.text)];
    const m = new Map<string, number>();
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(m);
    len.push(toks.length);
  }
  const avgLen = len.reduce((a, b) => a + b, 0) / Math.max(1, len.length);
  return { docs, tf, len, df, avgLen };
}

export interface LexHit<D> {
  doc: D;
  score: number;
  /** share of the query terms this doc contains (0..1) */
  coverage: number;
}

export function bm25<D extends LexDoc>(index: LexIndex<D>, query: string, k = 6, filter?: (d: D) => boolean): LexHit<D>[] {
  const q = [...new Set(tokenize(query))];
  if (q.length === 0) return [];
  const N = index.docs.length;
  const k1 = 1.2;
  const b = 0.75;
  const out: LexHit<D>[] = [];
  for (let i = 0; i < N; i++) {
    const doc = index.docs[i]!;
    if (filter && !filter(doc)) continue;
    const tf = index.tf[i]!;
    let score = 0;
    let matched = 0;
    for (const t of q) {
      let f = tf.get(t) ?? 0;
      let weight = 1;
      if (f === 0 && t.length >= 5) {
        // compound words: "veiligheidsschoenen" should still meet "schoenen"
        for (const [term, n] of tf) {
          if (term.length >= 5 && (term.includes(t) || t.includes(term))) {
            f += n;
            weight = 0.5;
          }
        }
      }
      if (f === 0) continue;
      matched += weight;
      const df = index.df.get(t) ?? 1;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += weight * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * index.len[i]!) / index.avgLen)));
    }
    if (score > 0) out.push({ doc, score, coverage: matched / q.length });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}
