import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { chatJson, chat } from "@/lib/ai/client";
import { embedMany } from "@/lib/rag/embed";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Second Brain — Vault Agent
//
// A self-hosted AI agent that has full read/write access to an Obsidian vault.
// It can:
//   - Search the vault semantically (embedding-based)
//   - Answer questions by retrieving relevant notes
//   - Create and update notes on command
//   - Summarise a folder or the entire vault
//   - Build a knowledge graph of connections between notes
//   - Run a daily "brain sweep": surface stale notes, broken links, gaps
//
// The vault path is configurable via BRAIN_VAULT_PATH env variable.
// Falls back to C:/Users/pc/jarvis-memory.
// ---------------------------------------------------------------------------

export interface VaultNote {
  path: string;
  name: string;
  content: string;
  wordCount: number;
  lastModified: Date;
}

export interface VaultSearchResult {
  note: VaultNote;
  score: number;
  excerpt: string;
}

export interface BrainSweepResult {
  stalNotes: string[];
  emptyNotes: string[];
  unlinkedNotes: string[];
  brokenLinks: Array<{ from: string; link: string }>;
  suggestions: string[];
  summary: string;
}

function getVaultPath(): string {
  return process.env["BRAIN_VAULT_PATH"] ?? "C:/Users/pc/jarvis-memory";
}

export function loadVaultNotes(folder?: string): VaultNote[] {
  const base = folder ? join(getVaultPath(), folder) : getVaultPath();
  if (!existsSync(base)) return [];

  const notes: VaultNote[] = [];

  function walk(dir: string) {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (extname(entry) === ".md") {
        try {
          const content = readFileSync(full, "utf8");
          const stat = require("node:fs").statSync(full);
          notes.push({
            path: full,
            name: entry.replace(/\.md$/, ""),
            content,
            wordCount: content.split(/\s+/).length,
            lastModified: new Date(stat.mtime),
          });
        } catch { /* skip unreadable */ }
      } else {
        // recurse into subdirs
        try {
          const stat = require("node:fs").statSync(full);
          if (stat.isDirectory()) walk(full);
        } catch { /* skip */ }
      }
    }
  }

  walk(base);
  return notes;
}

export async function searchVault(query: string, topK = 10): Promise<VaultSearchResult[]> {
  const notes = loadVaultNotes();
  if (notes.length === 0) return [];

  // Chunk notes into ~500-word segments for embedding
  const chunks: Array<{ noteIdx: number; text: string }> = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const words = note.content.split(/\s+/);
    for (let j = 0; j < words.length; j += 400) {
      chunks.push({ noteIdx: i, text: words.slice(j, j + 400).join(" ") });
    }
  }

  // Embed query + all chunks
  const texts = [query, ...chunks.map((c) => c.text)];
  let vecs: number[][];
  try {
    vecs = await embedMany(texts);
  } catch {
    logger.warn("brain: embedding niet beschikbaar, val terug op keyword search");
    return keywordSearch(query, notes, topK);
  }

  const [queryVec, ...chunkVecs] = vecs;
  if (!queryVec) return [];

  function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d === 0 ? 0 : dot / d;
  }

  const scored = chunkVecs.map((vec, i) => ({
    noteIdx: chunks[i]!.noteIdx,
    score: cosine(queryVec, vec),
    text: chunks[i]!.text,
  }));

  // Per note: take highest chunk score
  const byNote = new Map<number, { score: number; text: string }>();
  for (const s of scored) {
    const existing = byNote.get(s.noteIdx);
    if (!existing || s.score > existing.score) byNote.set(s.noteIdx, { score: s.score, text: s.text });
  }

  return [...byNote.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, topK)
    .map(([idx, { score, text }]) => ({
      note: notes[idx]!,
      score,
      excerpt: text.slice(0, 300),
    }));
}

function keywordSearch(query: string, notes: VaultNote[], topK: number): VaultSearchResult[] {
  const terms = query.toLowerCase().split(/\s+/);
  return notes
    .map((note) => {
      const lc = note.content.toLowerCase();
      const score = terms.reduce((s, t) => s + (lc.includes(t) ? 1 : 0), 0) / terms.length;
      return { note, score, excerpt: note.content.slice(0, 300) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function answerFromVault(question: string): Promise<string> {
  const results = await searchVault(question, 5);
  const context = results.map((r, i) => `[${i + 1}] **${r.note.name}**\n${r.excerpt}`).join("\n\n---\n\n");

  const { text } = await chat({
    messages: [
      {
        role: "system",
        content: `Je bent Jarvis, een AI-assistent met toegang tot een Obsidian-vault (second brain).
Beantwoord de vraag op basis van de meegeleverde vault-context.
Wees direct en concreet. Geen em-dashes. Citeer de notitie-naam als je ernaar verwijst.`,
      },
      {
        role: "user",
        content: context
          ? `Vraag: ${question}\n\nVault-context:\n${context}`
          : `Vraag: ${question}\n\n(Geen relevante vault-context gevonden)`,
      },
    ],
    maxTokens: 600,
    purpose: "brain-answer",
  });

  return text;
}

export async function writeVaultNote(name: string, content: string, folder = "00 - Inbox"): Promise<string> {
  const dir = join(getVaultPath(), folder);
  if (!existsSync(dir)) require("node:fs").mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.md`);
  writeFileSync(path, content, "utf8");
  logger.info("brain: notitie geschreven", { path });
  return path;
}

export async function runBrainSweep(): Promise<BrainSweepResult> {
  const notes = loadVaultNotes();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);

  const stalNotes: string[] = [];
  const emptyNotes: string[] = [];
  const allNames = new Set(notes.map((n) => n.name));
  const brokenLinks: Array<{ from: string; link: string }> = [];

  for (const note of notes) {
    if (note.wordCount < 10) emptyNotes.push(note.name);
    if (note.lastModified < thirtyDaysAgo && note.content.includes("status: active")) {
      stalNotes.push(note.name);
    }
    // Find broken [[wikilinks]]
    const links = [...note.content.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1]?.trim()).filter(Boolean) as string[];
    for (const link of links) {
      if (!allNames.has(link)) brokenLinks.push({ from: note.name, link });
    }
  }

  // Unlinked notes — notes that nothing else links to
  const linkedNames = new Set<string>();
  for (const note of notes) {
    const links = [...note.content.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1]?.trim()).filter(Boolean) as string[];
    for (const l of links) linkedNames.add(l);
  }
  const unlinkedNotes = notes
    .filter((n) => !linkedNames.has(n.name) && !n.name.includes("Index") && !n.name.includes("MEMORY"))
    .map((n) => n.name)
    .slice(0, 20);

  // LLM-generated suggestions
  let suggestions: string[] = [];
  let summary = "";
  try {
    const sweepCtx = JSON.stringify({ totalNotes: notes.length, stalNotes: stalNotes.slice(0, 5), emptyNotes: emptyNotes.slice(0, 5), brokenLinks: brokenLinks.slice(0, 5), unlinkedNotes: unlinkedNotes.slice(0, 5) });
    const result = await chatJson<{ suggestions: string[]; summary: string }>({
      messages: [
        { role: "system", content: `Je analyseert een Obsidian-vault (second brain) en geeft aanbevelingen om de gezondheid te verbeteren. Antwoord als JSON: {"suggestions": string[], "summary": string}. Max 5 suggestions. Geen em-dashes. NL.` },
        { role: "user", content: sweepCtx },
      ],
      maxTokens: 400,
      purpose: "brain-sweep",
    });
    suggestions = result.suggestions ?? [];
    summary = result.summary ?? "";
  } catch {
    summary = `Vault heeft ${notes.length} notities. ${brokenLinks.length} gebroken links, ${stalNotes.length} stale actieve notities.`;
  }

  return { stalNotes, emptyNotes, unlinkedNotes, brokenLinks, suggestions, summary };
}
