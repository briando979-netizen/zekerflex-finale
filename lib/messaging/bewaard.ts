import { kvGet, kvSet } from "@/lib/storage/kv";
import { previewText, type ChatMessage, type MessageKind } from "@/lib/messaging/store";

// ---------------------------------------------------------------------------
// Berichten bewaren met een ster: per gebruiker een eigen lijst (een adres, een
// instructie, een afspraak terugvinden). KV "chat-bewaard:<userId>" (in
// ERASABLE_KV_PREFIXES: mee bij AVG-export en wissen). De lijst houdt een
// verwijzing + een kort uittreksel; bij het ophalen valt weg wat niet meer
// bestaat (verwijderd voor iedereen, verdwenen, geen toegang meer) en volgt het
// uittreksel een bewerking. UI: components/chat (sessie c9).
// ---------------------------------------------------------------------------

export interface BewaardBericht {
  threadId: string;
  messageId: string;
  /** previewText van het bericht, ingekort */
  excerpt: string;
  kind: MessageKind;
  /** userId van de afzender */
  from: string;
  /** wanneer het bericht verstuurd is */
  at: string;
  /** wanneer jij het bewaarde */
  savedAt: string;
}

export const MAX_BEWAARD = 500;
const EXCERPT = 160;
const key = (userId: string) => `chat-bewaard:${userId}`;

export const uittreksel = (m: Pick<ChatMessage, "text" | "kind" | "attachment" | "location" | "call" | "deleted">): string =>
  previewText(m as ChatMessage).slice(0, EXCERPT);

/** Pure: aan zet het bericht (opnieuw) bovenaan, uit haalt het weg; nooit dubbel, nooit meer dan MAX_BEWAARD. */
export function toggleBewaard(list: BewaardBericht[], item: Omit<BewaardBericht, "savedAt">, aan: boolean, now = new Date()): BewaardBericht[] {
  const zonder = list.filter((b) => !(b.threadId === item.threadId && b.messageId === item.messageId));
  return aan ? [{ ...item, savedAt: now.toISOString() }, ...zonder].slice(0, MAX_BEWAARD) : zonder;
}

/**
 * Pure: alleen wat er nog is. `berichten` per thread: null = geen toegang (meer) of
 * het gesprek bestaat niet; anders de berichten op id. Een bewerkt bericht krijgt zijn
 * nieuwe uittreksel; nieuwste bewaard bovenaan.
 */
export function geldigeBewaard(list: BewaardBericht[], berichten: Map<string, Map<string, ChatMessage> | null>): BewaardBericht[] {
  const out: BewaardBericht[] = [];
  for (const b of list) {
    const m = berichten.get(b.threadId)?.get(b.messageId);
    if (!m || m.deleted) continue;
    out.push({ ...b, excerpt: uittreksel(m), kind: m.kind });
  }
  return out.sort((a, z) => z.savedAt.localeCompare(a.savedAt));
}

/** Per gesprek de ids van de bewaarde berichten (de ster bij de tijd). */
export function bewaardPerThread(list: BewaardBericht[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const b of list) (out[b.threadId] ??= []).push(b.messageId);
  return out;
}

export async function leesBewaard(userId: string): Promise<BewaardBericht[]> {
  return (await kvGet<BewaardBericht[]>(key(userId))) ?? [];
}

export async function zetBewaard(userId: string, item: Omit<BewaardBericht, "savedAt">, aan: boolean, now = new Date()): Promise<BewaardBericht[]> {
  const next = toggleBewaard(await leesBewaard(userId), item, aan, now);
  await kvSet(key(userId), next);
  return next;
}
