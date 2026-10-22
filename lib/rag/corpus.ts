import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FULL_FAQ, GUIDES, POSTS } from "@/lib/kennis/content";
import { dbaFaqFlat } from "@/lib/kennis/dba";
import { werkgeverHelpFlat } from "@/lib/kennis/werkgevers-help";
import { WHITEPAPERS, whitepaperPlainText } from "@/lib/kennis/whitepapers";
import { chunkText } from "@/lib/rag/chunk";
import { HOWTOS, type Audience } from "@/lib/rag/howto";

// ---------------------------------------------------------------------------
// The RAG brain's knowledge corpus: everything ZekerFlex itself has written
// down, as passages tagged with WHO may read them.
//   public       — website knowledge (FAQ, Wet DBA, guides, whitepapers, blog)
//   werknemer /  — in-app how-tos per role
//   opdrachtgever
//   admin        — internal platform docs (lib/rag/knowledge/*.md); never shown
//                  to workers, employers or visitors.
// Built once per server instance from code-shipped content: no database and
// no embedding model needed, so it works on every deploy.
// ---------------------------------------------------------------------------

export type { Audience };

export interface Passage {
  id: string;
  title: string;
  text: string;
  source: string;
  audience: Audience[];
  href?: string;
}

const KNOWLEDGE_DIR = join(process.cwd(), "lib", "rag", "knowledge");

function internalDocs(): Passage[] {
  const out: Passage[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return out; // not shipped with this deployment — public knowledge still works
  }
  for (const f of files) {
    let raw = "";
    try {
      raw = readFileSync(join(KNOWLEDGE_DIR, f), "utf8");
    } catch {
      continue;
    }
    const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f.replace(/\.md$/, "");
    // wet-dba.md is public law knowledge; the numbered docs are platform internals
    const audience: Audience[] = f === "wet-dba.md" ? ["public"] : ["admin"];
    chunkText(raw, { maxChars: 900 }).forEach((text, i) =>
      out.push({ id: `kb:${f}#${i}`, title, text, source: audience[0] === "admin" ? `Intern · ${f}` : "Wet DBA", audience }),
    );
  }
  return out;
}

let cache: Passage[] | null = null;

export function corpus(): Passage[] {
  if (cache) return cache;
  const out: Passage[] = [];

  HOWTOS.forEach((h, i) => out.push({ id: `howto:${i}`, title: h.q, text: h.a, source: "Hulp in de app", audience: h.audience, ...(h.href ? { href: h.href } : {}) }));

  for (const group of FULL_FAQ) {
    group.items.forEach((it, i) =>
      out.push({ id: `faq:${group.category}:${i}`, title: it.q, text: it.a, source: `FAQ · ${group.category}`, audience: ["public"], href: "/kennis/faq" }),
    );
  }
  dbaFaqFlat().forEach((it, i) => out.push({ id: `dba:${i}`, title: it.q, text: it.a, source: "Wet DBA-kenniscentrum", audience: ["public"], href: "/kennis/wet-dba" }));
  werkgeverHelpFlat().forEach((it, i) =>
    out.push({ id: `help:${i}`, title: it.q, text: it.a, source: "Helpcentrum werkgevers", audience: ["public"], href: "/kennis/werkgevers" }),
  );

  for (const g of GUIDES) {
    g.body.forEach((sec, i) =>
      out.push({ id: `guide:${g.slug}#${i}`, title: `${g.title} — ${sec.heading}`, text: sec.paragraphs.join("\n\n"), source: `Kennisbank · ${g.category}`, audience: ["public"], href: `/kennis/${g.slug}` }),
    );
  }
  for (const p of POSTS) {
    out.push({ id: `blog:${p.slug}`, title: p.title, text: [p.excerpt, ...p.body.flatMap((b) => b.paragraphs)].join("\n\n").slice(0, 1800), source: "Blog", audience: ["public"], href: `/kennis/blog/${p.slug}` });
  }
  for (const w of WHITEPAPERS) {
    chunkText(whitepaperPlainText(w), { maxChars: 1000 }).forEach((text, i) =>
      out.push({ id: `wp:${w.slug}#${i}`, title: `Whitepaper: ${w.title}`, text, source: "Whitepaper", audience: ["public"], href: `/kennis/whitepapers/${w.slug}` }),
    );
  }

  out.push(...internalDocs());
  cache = out;
  return out;
}

/** May someone in `role` read this passage? Admin reads everything; public passages are for everyone. */
export function canRead(p: Passage, role: Audience): boolean {
  return role === "admin" || p.audience.includes("public") || p.audience.includes(role);
}

export function corpusStats(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of corpus()) {
    const k = p.source.split(" · ")[0]!;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
