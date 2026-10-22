// ---------------------------------------------------------------------------
// Reciprocal Rank Fusion: merge any number of ranked lists into one.
// score(d) = Σ_lists weight / (k + rank_in_list(d)), rank starting at 1.
// Rank-based, so lists with incomparable scores (BM25, cosine of two
// different vector spaces) combine fairly; a document found by several
// retrievers rises to the top.
// ---------------------------------------------------------------------------

export const RRF_K = 60;

export interface RankedList<T> {
  name: string;
  items: T[];
  weight?: number;
}

export interface Fused<T> {
  item: T;
  score: number;
  via: string[];
}

export function reciprocalRankFusion<T>(lists: RankedList<T>[], key: (item: T) => string, k = RRF_K): Fused<T>[] {
  const acc = new Map<string, Fused<T>>();
  for (const list of lists) {
    const w = list.weight ?? 1;
    list.items.forEach((item, idx) => {
      const id = key(item);
      const add = w / (k + idx + 1);
      const cur = acc.get(id);
      if (cur) {
        cur.score += add;
        if (!cur.via.includes(list.name)) cur.via.push(list.name);
      } else {
        acc.set(id, { item, score: add, via: [list.name] });
      }
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score);
}
