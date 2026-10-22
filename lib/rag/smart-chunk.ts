// ---------------------------------------------------------------------------
// Smarter chunking for the RAG brain.
//   - structure-aware: splits on markdown headings and keeps the heading path
//     ("Wet DBA › Gezagsverhouding") as a header on every chunk, so a passage
//     still says what it is about once it's cut loose (contextual headers);
//   - sentence-aware: never cuts mid-sentence; oversized sections are packed
//     sentence by sentence;
//   - overlap by whole sentences, not characters;
//   - tiny sections are merged with their neighbour instead of becoming
//     useless 1-line chunks.
// chunkText (lib/rag/chunk.ts) stays for source code, where lines matter.
// ---------------------------------------------------------------------------

export interface SmartChunk {
  /** heading path, e.g. "Uitbetaling › Voorschot" ("" for text before any heading) */
  heading: string;
  /** the chunk body, WITHOUT the header */
  body: string;
  /** what gets indexed/embedded: header + body */
  text: string;
}

export interface SmartChunkOptions {
  maxChars?: number;
  minChars?: number;
  overlapSentences?: number;
  /** prefix for every heading path, e.g. the document title */
  title?: string;
}

/** Split into sentences, keeping list items and line-based blocks intact. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const l = line.trim();
    if (!l) continue;
    if (/^([-*•]|\d+[.)])\s/.test(l)) {
      out.push(l); // a list item is one unit
      continue;
    }
    // split after . ! ? followed by space + capital/digit/quote; keep abbreviations like "bijv." and "o.a." together
    const parts = l.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9"'“(€])/);
    for (const p of parts) if (p.trim()) out.push(p.trim());
  }
  return out;
}

interface Section {
  path: string[];
  lines: string[];
}

function sections(text: string): Section[] {
  const out: Section[] = [];
  const path: string[] = [];
  let cur: Section = { path: [], lines: [] };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const h = raw.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/) ?? (/^[A-Z0-9][A-Z0-9 &,'’\-–:]{5,80}$/.test(raw.trim()) ? ["", "##", raw.trim()] : null);
    if (h) {
      if (cur.lines.some((l) => l.trim())) out.push(cur);
      const level = h[1]!.length;
      path.splice(level - 1);
      path[level - 1] = h[2]!.replace(/[*_`]/g, "").trim();
      cur = { path: path.filter(Boolean), lines: [] };
    } else {
      cur.lines.push(raw);
    }
  }
  if (cur.lines.some((l) => l.trim())) out.push(cur);
  return out;
}

const header = (title: string | undefined, path: string[]) => [title, ...path].filter(Boolean).join(" › ");

export function smartChunk(text: string, opts: SmartChunkOptions = {}): SmartChunk[] {
  const maxChars = opts.maxChars ?? 1000;
  const minChars = opts.minChars ?? 200;
  const overlap = opts.overlapSentences ?? 1;
  const out: SmartChunk[] = [];

  for (const sec of sections(text)) {
    const heading = header(opts.title, sec.path);
    const sents = sentences(sec.lines.join("\n"));
    let buf: string[] = [];
    let len = 0;
    const flush = () => {
      if (!buf.length) return;
      const body = buf.join(" ");
      out.push({ heading, body, text: heading ? `${heading}\n${body}` : body });
    };
    for (const s of sents) {
      // a single sentence longer than the budget is hard-wrapped on spaces
      const pieces = s.length > maxChars ? s.match(new RegExp(`.{1,${maxChars}}(\\s|$)`, "g")) ?? [s] : [s];
      for (const piece of pieces) {
        if (len + piece.length + 1 > maxChars && buf.length) {
          flush();
          buf = overlap > 0 ? buf.slice(-overlap) : [];
          len = buf.reduce((a, b) => a + b.length + 1, 0);
        }
        buf.push(piece.trim());
        len += piece.length + 1;
      }
    }
    flush();
  }

  // merge tiny chunks into the previous chunk of the same section
  const merged: SmartChunk[] = [];
  for (const c of out) {
    const prev = merged[merged.length - 1];
    if (prev && c.body.length < minChars && prev.heading === c.heading && prev.body.length + c.body.length + 1 <= maxChars * 1.2) {
      prev.body = `${prev.body} ${c.body}`;
      prev.text = prev.heading ? `${prev.heading}\n${prev.body}` : prev.body;
    } else {
      merged.push({ ...c });
    }
  }
  return merged;
}
