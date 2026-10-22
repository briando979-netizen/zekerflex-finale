import { tokenize } from "@/lib/rag/lexical";

// ---------------------------------------------------------------------------
// Brain vector — a dense vector per passage that needs NO embedding model.
// Feature hashing of word unigrams, word bigrams and character trigrams into
// a fixed space, TF-IDF weighted and L2-normalised, compared with cosine.
// It catches what BM25 misses: typos ("verifcatie"), split/joined compounds
// ("veiligheids schoenen") and word order. Runs in-process on every deploy;
// the model embeddings (when connected) are a third list fused on top.
// ---------------------------------------------------------------------------

export const DIM = 1024;

function hash(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The hashed features of a text: words, word pairs and character trigrams. */
export function features(text: string): string[] {
  const words = tokenize(text);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    out.push(`w:${w}`);
    if (i + 1 < words.length) out.push(`b:${w}_${words[i + 1]}`);
    const padded = `#${w}#`;
    for (let j = 0; j + 3 <= padded.length; j++) out.push(`c:${padded.slice(j, j + 3)}`);
  }
  return out;
}

export interface VectorIndex {
  vectors: Float32Array[];
  idf: Map<number, number>;
}

function rawCounts(text: string): Map<number, number> {
  const m = new Map<number, number>();
  for (const f of features(text)) {
    const slot = hash(f) % DIM;
    m.set(slot, (m.get(slot) ?? 0) + 1);
  }
  return m;
}

function toVector(counts: Map<number, number>, idf: Map<number, number>): Float32Array {
  const v = new Float32Array(DIM);
  let norm = 0;
  for (const [slot, n] of counts) {
    const w = (1 + Math.log(n)) * (idf.get(slot) ?? 1);
    v[slot] = w;
    norm += w * w;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < DIM; i++) v[i] = v[i]! / norm;
  return v;
}

export function buildVectorIndex(texts: string[]): VectorIndex {
  const counts = texts.map(rawCounts);
  const df = new Map<number, number>();
  for (const c of counts) for (const slot of c.keys()) df.set(slot, (df.get(slot) ?? 0) + 1);
  const N = texts.length;
  const idf = new Map<number, number>();
  for (const [slot, d] of df) idf.set(slot, Math.log(1 + N / d));
  return { vectors: counts.map((c) => toVector(c, idf)), idf };
}

export function embedLocal(index: VectorIndex, text: string): Float32Array {
  return toVector(rawCounts(text), index.idf);
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < DIM; i++) s += a[i]! * b[i]!;
  return s;
}

/** Top-k indices by cosine (vectors are normalised, so dot = cosine). */
export function nearest(index: VectorIndex, query: Float32Array, k: number, allow?: (i: number) => boolean, minScore = 0.12): { i: number; score: number }[] {
  const out: { i: number; score: number }[] = [];
  for (let i = 0; i < index.vectors.length; i++) {
    if (allow && !allow(i)) continue;
    const s = dot(index.vectors[i]!, query);
    if (s >= minScore) out.push({ i, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}
