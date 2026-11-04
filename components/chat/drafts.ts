// Concepten per gesprek: wat je typte en nog niet verstuurde, blijft staan als je even een
// ander gesprek opent (zoals WhatsApp). Alleen in dit tabblad (sessionStorage), nooit op de server.

const KEY = "zf-chat-drafts";
export const DRAFT_EVENT = "zf:chat-draft";

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;
  try {
    const raw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(KEY) : null;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    cache = parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function readDraft(threadId: string): string {
  return load()[threadId] ?? "";
}

export function allDrafts(): Record<string, string> {
  return { ...load() };
}

export function writeDraft(threadId: string, text: string): void {
  const all = load();
  const clean = text.trim() ? text.slice(0, 4000) : "";
  if ((all[threadId] ?? "") === clean) return;
  if (clean) all[threadId] = clean;
  else delete all[threadId];
  try {
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* privévenster of vol: het concept blijft dan alleen in het geheugen */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { threadId, text: clean } }));
}
