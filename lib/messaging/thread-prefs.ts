import { createHash, timingSafeEqual } from "node:crypto";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Per-user chat settings, WhatsApp-style — what one person does to a
// conversation only affects their own view:
//   archived   — out of the main list, under "Gearchiveerd"
//   muted      — no push notifications (until a time, or for ever)
//   locked     — hidden behind the chat PIN ("Vergrendelde chats")
//   favorites  — the "Favorieten" filter
//   lists      — own lists ("Werk", "Familie", …) used as filters
//   clearedAt  — "Wis chat": messages up to then are hidden
//   deletedAt  — "Verwijder chat": gone from the list until a new message
//   blocked    — userIds that can't message this user (and vice versa)
//   hiddenMsgs — "Verwijderen voor mij": per thread the message ids only this user no longer sees
//   unreadMark — "Markeer als ongelezen": threads shown as unread until this user opens them
// KV key "chat-prefs:<userId>".
// ---------------------------------------------------------------------------

export interface ChatPrefs {
  archived: string[];
  muted: Record<string, string>; // threadId -> until ISO ("9999-…" = always)
  locked: string[];
  favorites: string[];
  lists: Record<string, string[]>; // list name -> threadIds
  clearedAt: Record<string, string>;
  deletedAt: Record<string, string>;
  blocked: string[];
  hiddenMsgs: Record<string, string[]>; // threadId -> messageIds
  unreadMark: string[];
  pinHash?: string;
}

/** Per thread at most this many "Verwijderen voor mij" ids (the oldest go first). */
export const HIDDEN_MAX = 500;

// A fresh object every time: the actions below change muted/lists/clearedAt/… in place, and a shared empty object
// would carry one user's change over to the next user without a record (13 nov: "Wis chat" leaked that way).
const leeg = (): ChatPrefs => ({
  archived: [],
  muted: {},
  locked: [],
  favorites: [],
  lists: {},
  clearedAt: {},
  deletedAt: {},
  blocked: [],
  hiddenMsgs: {},
  unreadMark: [],
});
const key = (userId: string) => `chat-prefs:${userId}`;

export async function getChatPrefs(userId: string): Promise<ChatPrefs> {
  const p = await kvGet<Partial<ChatPrefs>>(key(userId)).catch(() => null);
  return { ...leeg(), ...(p ?? {}) };
}

async function save(userId: string, p: ChatPrefs): Promise<ChatPrefs> {
  await kvSet(key(userId), p);
  return p;
}

const add = (xs: string[], x: string) => (xs.includes(x) ? xs : [...xs, x]);
const del = (xs: string[], x: string) => xs.filter((y) => y !== x);

export type ThreadAction =
  | { action: "archive" | "unarchive" | "lock" | "unlock" | "favorite" | "unfavorite" | "unmute" | "clear" | "delete" | "mark-unread" | "mark-read" }
  | { action: "mute"; hours: number | null }
  | { action: "list-add" | "list-remove"; list: string }
  | { action: "hide-message"; messageId: string }
  | { action: "hide-messages"; messageIds: string[] };

export async function applyThreadAction(userId: string, threadId: string, a: ThreadAction): Promise<ChatPrefs> {
  const p = await getChatPrefs(userId);
  const now = new Date().toISOString();
  switch (a.action) {
    case "archive":
      p.archived = add(p.archived, threadId);
      break;
    case "unarchive":
      p.archived = del(p.archived, threadId);
      break;
    case "lock":
      if (!p.pinHash) throw new Error("Stel eerst een chat-pincode in.");
      p.locked = add(p.locked, threadId);
      p.archived = del(p.archived, threadId);
      break;
    case "unlock":
      p.locked = del(p.locked, threadId);
      break;
    case "favorite":
      p.favorites = add(p.favorites, threadId);
      break;
    case "unfavorite":
      p.favorites = del(p.favorites, threadId);
      break;
    case "mute":
      p.muted[threadId] = a.hours === null ? "9999-12-31T00:00:00.000Z" : new Date(Date.now() + a.hours * 3_600_000).toISOString();
      break;
    case "unmute":
      delete p.muted[threadId];
      break;
    case "clear":
      p.clearedAt[threadId] = now;
      delete p.hiddenMsgs[threadId]; // alles tot nu is toch weg
      break;
    case "delete":
      p.deletedAt[threadId] = now;
      p.clearedAt[threadId] = now;
      p.archived = del(p.archived, threadId);
      p.favorites = del(p.favorites, threadId);
      p.unreadMark = del(p.unreadMark, threadId);
      delete p.hiddenMsgs[threadId];
      break;
    case "mark-unread":
      p.unreadMark = add(p.unreadMark, threadId);
      break;
    case "mark-read":
      p.unreadMark = del(p.unreadMark, threadId);
      break;
    case "hide-message":
      p.hiddenMsgs[threadId] = add(p.hiddenMsgs[threadId] ?? [], a.messageId).slice(-HIDDEN_MAX);
      break;
    case "hide-messages":
      p.hiddenMsgs[threadId] = [...new Set([...(p.hiddenMsgs[threadId] ?? []), ...a.messageIds])].slice(-HIDDEN_MAX);
      break;
    case "list-add": {
      const name = a.list.trim().slice(0, 30);
      if (!name) throw new Error("Geef de lijst een naam.");
      if (!p.lists[name] && Object.keys(p.lists).length >= 12) throw new Error("Maximaal 12 lijsten.");
      p.lists[name] = add(p.lists[name] ?? [], threadId);
      break;
    }
    case "list-remove": {
      const rest = del(p.lists[a.list] ?? [], threadId);
      if (rest.length) p.lists[a.list] = rest;
      else delete p.lists[a.list];
      break;
    }
  }
  return save(userId, p);
}

export async function setBlocked(userId: string, otherUserId: string, blocked: boolean): Promise<ChatPrefs> {
  const p = await getChatPrefs(userId);
  p.blocked = blocked ? add(p.blocked, otherUserId) : del(p.blocked, otherUserId);
  return save(userId, p);
}

/** Either side blocked the other → no messages between them. */
export async function blockedBetween(a: string, b: string): Promise<"me" | "them" | null> {
  const [pa, pb] = await Promise.all([getChatPrefs(a), getChatPrefs(b)]);
  if (pa.blocked.includes(b)) return "me";
  if (pb.blocked.includes(a)) return "them";
  return null;
}

export function isMuted(p: ChatPrefs, threadId: string, at = Date.now()): boolean {
  const until = p.muted[threadId];
  return Boolean(until && new Date(until).getTime() > at);
}

/* ─────────────── chat PIN (for locked chats) ─────────────── */

const hashPin = (userId: string, pin: string) => createHash("sha256").update(`chat-pin:${userId}:${pin}`).digest("hex");

export async function setChatPin(userId: string, pin: string, currentPin?: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error("Kies een pincode van 4 tot 6 cijfers.");
  const p = await getChatPrefs(userId);
  if (p.pinHash && !(currentPin && verifyPinHash(p.pinHash, hashPin(userId, currentPin)))) {
    throw new Error("Je huidige pincode klopt niet.");
  }
  p.pinHash = hashPin(userId, pin);
  await save(userId, p);
}

function verifyPinHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function checkChatPin(userId: string, pin: string | null | undefined): Promise<boolean> {
  if (!pin) return false;
  const p = await getChatPrefs(userId);
  return Boolean(p.pinHash && verifyPinHash(p.pinHash, hashPin(userId, pin)));
}

/** Messages hidden by "Wis chat" / "Verwijder chat" for this user. */
export function visibleFrom(p: ChatPrefs, threadId: string): string | null {
  const a = p.clearedAt[threadId];
  const b = p.deletedAt[threadId];
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

/** "Verwijderen voor mij": the message ids this user no longer sees in this thread. */
export function hiddenIn(p: ChatPrefs, threadId: string): Set<string> {
  return new Set(p.hiddenMsgs[threadId] ?? []);
}

/** Opening a thread ends "Markeer als ongelezen"; only writes when the mark is there. */
export async function clearUnreadMark(userId: string, threadId: string): Promise<void> {
  const p = await getChatPrefs(userId);
  if (!p.unreadMark.includes(threadId)) return;
  p.unreadMark = del(p.unreadMark, threadId);
  await save(userId, p);
}

/* ─────────────── bulk + label management (Instellingen) ─────────────── */

export async function bulkChatAction(
  userId: string,
  threadIds: string[],
  a: { action: "archive-all" | "clear-all" | "unmute-all" } | { action: "list-rename"; from: string; to: string } | { action: "list-delete"; list: string },
): Promise<ChatPrefs> {
  const p = await getChatPrefs(userId);
  const now = new Date().toISOString();
  switch (a.action) {
    case "archive-all":
      for (const id of threadIds) if (!p.locked.includes(id)) p.archived = add(p.archived, id);
      break;
    case "clear-all":
      for (const id of threadIds) {
        p.clearedAt[id] = now;
        delete p.hiddenMsgs[id];
      }
      break;
    case "unmute-all":
      p.muted = {};
      break;
    case "list-rename": {
      const to = a.to.trim().slice(0, 30);
      if (!to) throw new Error("Geef het label een naam.");
      if (!p.lists[a.from]) throw new Error("Label niet gevonden.");
      p.lists[to] = [...new Set([...(p.lists[to] ?? []), ...p.lists[a.from]!])];
      if (to !== a.from) delete p.lists[a.from];
      break;
    }
    case "list-delete":
      delete p.lists[a.list];
      break;
  }
  return save(userId, p);
}
