import { randomUUID } from "node:crypto";
import { kvAppend, kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// In-platform messaging ("de chat") — Postgres-backed (KeyValueStore) — was
// local disk, unreliable on Vercel's serverless functions. Every account sees
// only its own threads. WhatsApp-style: 1-on-1 direct threads + a "support"
// thread that every PLATFORM_ADMIN can answer.
//   key "chat-thread:<id>"     — one entry per thread (metadata + reads)
//   key "chat-messages:<id>"   — message array for that thread
// ---------------------------------------------------------------------------

export type ThreadKind = "direct" | "support" | "group";

export type MessageKind =
  | "text"
  | "system"
  | "voice"
  | "file"
  | "image"
  | "location"
  | "call";

export interface MessageAttachment {
  /** id in the per-thread chat media store (lib/messaging/media.ts) */
  mediaId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** voice note length, seconds */
  durationSec?: number;
}

export interface MessageLocation {
  lat: number;
  lng: number;
  label?: string;
}

export interface CallInfo {
  mode: "audio" | "video" | "screen";
  status: "started" | "ended" | "missed" | "declined";
  durationSec?: number;
}

export interface ReplyRef {
  id: string;
  from: string;
  excerpt: string;
  kind: MessageKind;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  from: string; // userId, or "system"
  at: string;
  text: string;
  kind: MessageKind;
  attachment?: MessageAttachment;
  location?: MessageLocation;
  call?: CallInfo;
  replyTo?: ReplyRef;
  /** posted by the recipient's automatic-reply rule, not typed by a human */
  auto?: boolean;
  /** emoji → userIds die die reactie gaven (max één emoji per gebruiker) */
  reactions?: Record<string, string[]>;
  /** door de afzender ingetrokken ("verwijderd voor iedereen"); inhoud is gewist */
  deleted?: boolean;
  /** doorgestuurd vanuit een ander gesprek */
  forwarded?: boolean;
}

export type MessageExtra = Partial<
  Pick<ChatMessage, "attachment" | "location" | "call" | "replyTo" | "auto" | "forwarded">
>;

export interface ChatThread {
  id: string;
  kind: ThreadKind;
  participants: string[]; // userIds. support threads: [initiatorUserId]
  createdAt: string;
  lastMessageAt: string;
  lastMessage: { from: string; text: string; at: string } | null;
  meta: {
    subject?: string;
    shiftId?: string;
    shiftTitle?: string;
    branch?: string;
    contextKey?: string;
    /** group threads: the community that owns this thread */
    communityId?: string;
    /** group threads: display name + who may post */
    title?: string;
    ownerId?: string;
    /** verdwijnende berichten: messages older than this many days are hidden for everyone */
    disappearDays?: number;
  };
  /** per-user last-read timestamp (ISO) */
  reads: Record<string, string>;
}

/** Short preview text for a thread list / notification, per message kind. */
export function previewText(m: {
  kind: MessageKind;
  text: string;
  call?: CallInfo | undefined;
}): string {
  switch (m.kind) {
    case "voice":
      return "🎤 Spraakbericht";
    case "image":
      return "📷 Foto";
    case "file":
      return "📎 Bestand";
    case "location":
      return "📍 Locatie";
    case "call":
      return m.call?.mode === "video"
        ? "📹 Videogesprek"
        : m.call?.mode === "screen"
          ? "🖥️ Scherm delen"
          : "📞 Gesprek";
    default:
      return m.text;
  }
}

const threadKey = (id: string) => `chat-thread:${id}`;
const messagesKey = (id: string) => `chat-messages:${id}`;

async function writeThread(t: ChatThread): Promise<void> {
  await kvSet(threadKey(t.id), t);
}

const mergedKey = (id: string) => `chat-thread-merged:${id}`;

/** A merged duplicate's id resolves to its main thread's id (see mergeDuplicateDirectThreads). */
async function resolveThreadId(id: string): Promise<string> {
  if (await kvGet<ChatThread>(threadKey(id))) return id;
  return (await kvGet<string>(mergedKey(id))) ?? id;
}

export async function getThread(id: string): Promise<ChatThread | null> {
  const t = await kvGet<ChatThread>(threadKey(id));
  if (t) return t;
  // A duplicate merged into its pair's main thread — old links keep working.
  const mainId = await kvGet<string>(mergedKey(id));
  return mainId ? kvGet<ChatThread>(threadKey(mainId)) : null;
}

async function allThreads(): Promise<ChatThread[]> {
  return kvListValues<ChatThread>("chat-thread:", 20_000);
}

/** Context keys that keep their own thread; everything else shares the pair's one thread. */
const SEPARATE_CONTEXTS = new Set(["admin-broadcast"]);

function separateContext(contextKey?: string): string | null {
  return contextKey && SEPARATE_CONTEXTS.has(contextKey) ? contextKey : null;
}

function pairKey(a: string, b: string, contextKey?: string): string {
  const own = separateContext(contextKey);
  return [a, b].sort().join("~") + (own ? `~${own}` : "");
}

/**
 * Find or create THE 1-on-1 thread between two users. One thread per pair,
 * like WhatsApp — a new klus doesn't start a new conversation, it only
 * updates the thread's subject to the latest klus.
 */
export async function ensureDirectThread(
  userA: string,
  userB: string,
  meta: ChatThread["meta"] = {},
): Promise<ChatThread> {
  if (userA === userB) throw new Error("cannot start a thread with yourself");
  const dedupeKey = pairKey(userA, userB, meta.contextKey);
  const existing = (await allThreads())
    .filter(
      (t) =>
        t.kind === "direct" &&
        pairKey(t.participants[0] ?? "", t.participants[1] ?? "", t.meta.contextKey) === dedupeKey,
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
  if (existing) {
    if (meta.shiftId && meta.shiftId !== existing.meta.shiftId) {
      existing.meta = { ...existing.meta, ...meta };
      await writeThread(existing);
    }
    return existing;
  }

  const now = new Date().toISOString();
  const t: ChatThread = {
    id: randomUUID().slice(0, 12),
    kind: "direct",
    participants: [userA, userB],
    createdAt: now,
    lastMessageAt: now,
    lastMessage: null,
    meta,
    reads: {},
  };
  await writeThread(t);
  return t;
}

/** The single support thread for a user (all PLATFORM_ADMINs can answer it). */
export async function ensureSupportThread(userId: string): Promise<ChatThread> {
  const existing = (await allThreads()).find((t) => t.kind === "support" && t.participants[0] === userId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const t: ChatThread = {
    id: randomUUID().slice(0, 12),
    kind: "support",
    participants: [userId],
    createdAt: now,
    lastMessageAt: now,
    lastMessage: null,
    meta: { subject: "ZekerFlex Support" },
    reads: {},
  };
  await writeThread(t);
  await postMessage(
    t.id,
    "system",
    "Je chat met ZekerFlex Support. Stel je vraag — we reageren zo snel mogelijk.",
    "system",
  );
  return t;
}

/** Threads visible to a user. Admins additionally see every support thread. */
export async function listThreadsForUser(
  userId: string,
  isAdmin: boolean,
): Promise<ChatThread[]> {
  const all = await allThreads();
  const mine = all.filter(
    (t) =>
      t.participants.includes(userId) ||
      (isAdmin && t.kind === "support") ||
      (isAdmin && t.meta.contextKey === "admin-broadcast"),
  );
  return mine.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

export function canAccess(thread: ChatThread, userId: string, isAdmin: boolean): boolean {
  return thread.participants.includes(userId) || (isAdmin && thread.kind === "support");
}

/** Create (once) the group chat behind a community. */
export async function ensureGroupThread(
  communityId: string,
  title: string,
  ownerId: string,
  memberIds: string[],
): Promise<ChatThread> {
  const existing = (await allThreads()).find(
    (t) => t.kind === "group" && t.meta.communityId === communityId,
  );
  const now = new Date().toISOString();
  if (existing) {
    // keep the participant list in sync with the community roster
    const next = [...new Set([ownerId, ...memberIds])];
    if (next.join(",") !== existing.participants.join(",") || existing.meta.title !== title) {
      existing.participants = next;
      existing.meta.title = title;
      existing.meta.ownerId = ownerId;
      await writeThread(existing);
    }
    return existing;
  }
  const t: ChatThread = {
    id: randomUUID().slice(0, 12),
    kind: "group",
    participants: [...new Set([ownerId, ...memberIds])],
    createdAt: now,
    lastMessageAt: now,
    lastMessage: null,
    meta: { communityId, title, ownerId, subject: title },
    reads: {},
  };
  await writeThread(t);
  await postMessage(t.id, "system", `Community “${title}” is aangemaakt.`, "system");
  return t;
}

export async function getGroupThreadByCommunity(communityId: string): Promise<ChatThread | null> {
  return (await allThreads()).find(
    (t) => t.kind === "group" && t.meta.communityId === communityId,
  ) ?? null;
}

/** One stored message by id (for building a reply excerpt). */
export async function getMessageById(threadId: string, messageId: string): Promise<ChatMessage | null> {
  const all = await getMessages(threadId, 1000);
  return all.find((m) => m.id === messageId) ?? null;
}

export async function getMessages(threadId: string, limit = 200): Promise<ChatMessage[]> {
  threadId = await resolveThreadId(threadId);
  const rows = (await kvGet<ChatMessage[]>(messagesKey(threadId))) ?? [];
  return rows.slice(-limit);
}

/** Toggle één emoji-reactie van een gebruiker op een bericht (één emoji per persoon). */
export async function reactToMessage(
  threadId: string,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<ChatMessage | null> {
  const key = messagesKey(await resolveThreadId(threadId));
  const list = (await kvGet<ChatMessage[]>(key)) ?? [];
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx === -1) return null;
  const m = list[idx]!;
  const reactions: Record<string, string[]> = {};
  for (const [e, users] of Object.entries(m.reactions ?? {})) reactions[e] = [...users];
  const had = (reactions[emoji] ?? []).includes(userId);
  // verwijder de gebruiker overal (max één reactie per persoon)
  for (const e of Object.keys(reactions)) reactions[e] = (reactions[e] ?? []).filter((u) => u !== userId);
  if (!had) reactions[emoji] = [...(reactions[emoji] ?? []), userId];
  for (const e of Object.keys(reactions)) if ((reactions[e] ?? []).length === 0) delete reactions[e];
  const updated: ChatMessage = { ...m };
  if (Object.keys(reactions).length) updated.reactions = reactions;
  else delete updated.reactions;
  list[idx] = updated;
  await kvSet(key, list.slice(-5000));
  return updated;
}

/** Trek een bericht in: wis de inhoud en markeer als verwijderd (de afzender-check doet de route). */
export async function deleteMessage(threadId: string, messageId: string): Promise<ChatMessage | null> {
  const key = messagesKey(await resolveThreadId(threadId));
  const list = (await kvGet<ChatMessage[]>(key)) ?? [];
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx === -1) return null;
  const m = list[idx]!;
  const updated: ChatMessage = { id: m.id, threadId: m.threadId, from: m.from, at: m.at, text: "", kind: m.kind, deleted: true };
  list[idx] = updated;
  await kvSet(key, list.slice(-5000));
  return updated;
}

export async function postMessage(
  threadId: string,
  from: string,
  text: string,
  kind: MessageKind = "text",
  extra: MessageExtra = {},
): Promise<ChatMessage> {
  threadId = await resolveThreadId(threadId);
  const clean = text.trim().slice(0, 4000);
  // text/system need words; attachment/location/call kinds may carry no text
  const needsText = kind === "text" || kind === "system";
  if (needsText && !clean) throw new Error("empty message");
  const msg: ChatMessage = {
    id: randomUUID().slice(0, 12),
    threadId,
    from,
    at: new Date().toISOString(),
    text: clean,
    kind,
    ...(extra.attachment ? { attachment: extra.attachment } : {}),
    ...(extra.location ? { location: extra.location } : {}),
    ...(extra.call ? { call: extra.call } : {}),
    ...(extra.replyTo ? { replyTo: extra.replyTo } : {}),
    ...(extra.auto ? { auto: true } : {}),
    ...(extra.forwarded ? { forwarded: true } : {}),
  };
  await kvAppend(messagesKey(threadId), msg, 5000);

  const t = await getThread(threadId);
  if (t) {
    t.lastMessageAt = msg.at;
    t.lastMessage = { from, text: previewText(msg), at: msg.at };
    if (from !== "system") t.reads[from] = msg.at; // sender has read their own
    await writeThread(t);
  }
  return msg;
}

/**
 * One-off clean-up: merge duplicate direct threads (same two people, from the
 * old one-thread-per-klus behaviour) into one main thread per pair. The main
 * thread is the one with the most messages (oldest on a tie); the others'
 * messages are moved into it in time order, then the duplicates are deleted
 * and remembered as aliases so old links still open the main thread.
 */
export async function mergeDuplicateDirectThreads(): Promise<{ pairs: number; merged: number; messagesMoved: number }> {
  const groups = new Map<string, ChatThread[]>();
  for (const t of await allThreads()) {
    if (t.kind !== "direct" || t.participants.length !== 2) continue;
    const k = pairKey(t.participants[0]!, t.participants[1]!, t.meta.contextKey);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  let pairs = 0;
  let merged = 0;
  let messagesMoved = 0;
  for (const threads of groups.values()) {
    if (threads.length < 2) continue;
    pairs += 1;
    const withMsgs = await Promise.all(
      threads.map(async (t) => ({ t, msgs: (await kvGet<ChatMessage[]>(messagesKey(t.id))) ?? [] })),
    );
    withMsgs.sort((a, b) => b.msgs.length - a.msgs.length || (a.t.createdAt < b.t.createdAt ? -1 : 1));
    const main = withMsgs[0]!;
    const all = [...main.msgs];
    const seen = new Set(all.map((m) => m.id));
    for (const dup of withMsgs.slice(1)) {
      for (const m of dup.msgs) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        all.push({ ...m, threadId: main.t.id });
        messagesMoved += 1;
      }
      for (const [u, at] of Object.entries(dup.t.reads)) {
        if (!main.t.reads[u] || main.t.reads[u]! < at) main.t.reads[u] = at;
      }
    }
    all.sort((a, b) => (a.at < b.at ? -1 : 1));
    await kvSet(messagesKey(main.t.id), all.slice(-5000));
    const last = all.at(-1);
    if (last) {
      main.t.lastMessageAt = last.at;
      main.t.lastMessage = { from: last.from, text: previewText(last), at: last.at };
    }
    // keep the most recent klus as the thread's subject
    const newest = [...threads].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1))[0]!;
    main.t.meta = { ...main.t.meta, ...newest.meta };
    main.t.createdAt = [...threads].map((t) => t.createdAt).sort()[0]!;
    await writeThread(main.t);
    for (const dup of withMsgs.slice(1)) {
      await kvSet(mergedKey(dup.t.id), main.t.id);
      await kvDelete(messagesKey(dup.t.id));
      await kvDelete(threadKey(dup.t.id));
      merged += 1;
    }
  }
  return { pairs, merged, messagesMoved };
}

/** Update a thread's metadata (e.g. verdwijnende berichten). */
export async function setThreadMeta(threadId: string, patch: ChatThread["meta"]): Promise<ChatThread | null> {
  const t = await getThread(threadId);
  if (!t) return null;
  t.meta = { ...t.meta, ...patch };
  await writeThread(t);
  return t;
}

/** Cut-off for verdwijnende berichten (ISO) or null. */
export function disappearCutoff(thread: ChatThread, now = Date.now()): string | null {
  const d = thread.meta.disappearDays;
  return d && d > 0 ? new Date(now - d * 86_400_000).toISOString() : null;
}

export async function markThreadRead(threadId: string, userId: string): Promise<void> {
  const t = await getThread(threadId);
  // (getThread resolves a merged duplicate to its main thread)
  if (!t) return;
  t.reads[userId] = new Date().toISOString();
  await writeThread(t);
}

export function unreadForUser(
  thread: ChatThread,
  messages: ChatMessage[],
  userId: string,
): number {
  const lastRead = thread.reads[userId] ? new Date(thread.reads[userId]!).getTime() : 0;
  return messages.filter((m) => m.from !== userId && m.from !== "system" && new Date(m.at).getTime() > lastRead)
    .length;
}

/**
 * True once someone other than the sender has read up to this message. Checks
 * every recorded reader (support threads have admins who aren't "participants").
 */
export function isReadByOthers(thread: ChatThread, message: ChatMessage): boolean {
  const at = new Date(message.at).getTime();
  return Object.entries(thread.reads).some(
    ([uid, ts]) => uid !== message.from && new Date(ts).getTime() >= at,
  );
}
