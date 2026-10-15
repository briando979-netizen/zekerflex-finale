import { createHash, randomUUID } from "node:crypto";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// A user's agenda: appointments found automatically in their mail, chat and
// WhatsApp imports, invitations (.ics) and ones they add themselves.
//   key "agenda:<userId>:<id>"         — one item
//   key "agenda-ref:<userId>:<hash>"   — "this source already produced this
//                                        appointment", so re-scanning never
//                                        duplicates it and a deleted one
//                                        doesn't come back
// ---------------------------------------------------------------------------

export type AgendaSource = "mail" | "ics" | "chat" | "whatsapp" | "manual";

export interface AgendaItem {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  source: AgendaSource;
  /** "Mail van Jan de Vries", "Chat met Bakkerij Bol", … */
  sourceLabel: string;
  sourceRef: string;
  /** the sentence the appointment was read from */
  phrase: string | null;
  createdAt: string;
}

export type NewAgendaItem = Omit<AgendaItem, "id" | "createdAt">;

const itemKey = (userId: string, id: string) => `agenda:${userId}:${id}`;
const refKey = (userId: string, ref: string) => `agenda-ref:${userId}:${createHash("sha256").update(ref).digest("hex").slice(0, 32)}`;

export async function hasSourceRef(userId: string, sourceRef: string): Promise<boolean> {
  return (await kvGet<string>(refKey(userId, sourceRef))) !== null;
}

/** Adds an automatically found appointment unless this source already produced it. */
export async function addFoundItem(userId: string, input: NewAgendaItem): Promise<AgendaItem | null> {
  if (await hasSourceRef(userId, input.sourceRef)) return null;
  const item: AgendaItem = { ...input, id: randomUUID().slice(0, 12), createdAt: new Date().toISOString() };
  await kvSet(refKey(userId, input.sourceRef), item.id);
  await kvSet(itemKey(userId, item.id), item);
  return item;
}

export async function addManualItem(
  userId: string,
  input: Pick<AgendaItem, "title" | "start" | "end" | "allDay" | "location">,
): Promise<AgendaItem> {
  const item: AgendaItem = {
    ...input,
    id: randomUUID().slice(0, 12),
    source: "manual",
    sourceLabel: "Zelf toegevoegd",
    sourceRef: `manual:${randomUUID()}`,
    phrase: null,
    createdAt: new Date().toISOString(),
  };
  await kvSet(itemKey(userId, item.id), item);
  return item;
}

export async function listAgendaItems(userId: string, from?: Date, to?: Date): Promise<AgendaItem[]> {
  const rows = await kvListValues<AgendaItem>(`agenda:${userId}:`, 5000);
  return rows
    .filter((i) => {
      const t = new Date(i.end ?? i.start).getTime();
      return (!from || t >= from.getTime()) && (!to || new Date(i.start).getTime() < to.getTime());
    })
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

export async function deleteAgendaItem(userId: string, id: string): Promise<boolean> {
  const item = await kvGet<AgendaItem>(itemKey(userId, id));
  if (!item) return false;
  await kvDelete(itemKey(userId, id));
  return true;
}

export const mailScanStateKey = (userId: string) => `agenda-mail-state:${userId}`;

/** Message numbers are per mailbox: forget where the mail scan was when the connection changes. */
export async function resetMailScanState(userId: string): Promise<void> {
  await kvDelete(mailScanStateKey(userId));
}

/** Drops items whose sourceRef starts with a prefix — an invitation that was cancelled. */
export async function removeBySourcePrefix(userId: string, prefix: string): Promise<number> {
  const rows = await kvListValues<AgendaItem>(`agenda:${userId}:`, 5000);
  const doomed = rows.filter((i) => i.sourceRef.startsWith(prefix));
  await Promise.all(doomed.map((i) => kvDelete(itemKey(userId, i.id))));
  return doomed.length;
}
