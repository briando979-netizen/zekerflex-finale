// Text chunking for the RAG index. Paragraph-aware, with a hard character cap
// and a small overlap so retrieval doesn't lose context at chunk boundaries.

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

export function chunkText(input: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = Math.min(opts.overlap ?? 150, Math.floor(maxChars / 3));

  const text = input.replace(/\r\n/g, "\n").trim();
  if (text.length === 0) return [];
  if (text.length <= maxChars) return [text];

  // Split on blank lines first, then hard-wrap oversized blocks.
  const blocks: string[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= maxChars) {
      blocks.push(p);
    } else {
      for (let i = 0; i < p.length; i += maxChars - overlap) {
        blocks.push(p.slice(i, i + maxChars));
      }
    }
  }

  // Greedily pack blocks into chunks up to maxChars.
  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > maxChars) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      current = `${tail}\n\n${block}`;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Rough token estimate (~4 chars/token) for budgeting context windows. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
