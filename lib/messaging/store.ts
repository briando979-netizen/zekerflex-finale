import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// In-platform messaging ("de chat") — filesystem only, non-destructive.
// Every account sees only its own threads. WhatsApp-style: 1-on-1 direct
// threads + a "support" thread that every PLATFORM_ADMIN can answer.
//   storage/chat/threads/<id>.json   — one file per thread (metadata + reads)
//   storage/chat/msg/<id>.jsonl      — append-only messages for that thread
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
}

export type MessageExtra = Partial<
  Pick<ChatMessage, "attachment" | "location" | "call" | "replyTo" | "auto">
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

function root(): string {
  return join(process.cwd(), "storage", "chat");
}
const threadsDir = () => join(root(), "threads");
const msgPath = (id: string) => join(root(), "msg", `${id.replace(/[^a-z0-9-]/gi, "")}.jsonl`);
const threadPath = (id: string) => join(threadsDir(), `${id.replace(/[^a-z0-9-]/gi, "")}.json`);

async function writeThread(t: ChatThread): Promise<void> {
  await mkdir(threadsDir(), { recursive: true });
  await writeFile(threadPath(t.id), JSON.stringify(t, null, 2), "utf8");
}

export async function getThread(id: string): Promise<ChatThread | null> {
  const p = threadPath(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await readFile(p, "utf8")) as ChatThread;
  } catch {
    return null;
  }
}

async function allThreads(): Promise<ChatThread[]> {
  if (!existsSync(threadsDir())) return [];
  const files = (await readdir(threadsDir())).filter((f) => f.endsWith(".json"));
  const out: ChatThread[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(threadsDir(), f), "utf8")) as ChatThread);
    } catch {
      /* skip */
    }
  }
  return out;
}

function pairKey(a: string, b: string, contextKey?: string): string {
  return [a, b].sort().join("~") + (contextKey ? `~${contextKey}` : "");
}

/** Find or create a 1-on-1 thread between two users (deduped by pair + context). */
export async function ensureDirectThread(
  userA: string,
  userB: string,
  meta: ChatThread["meta"] = {},
): Promise<ChatThread> {
  if (userA === userB) throw new Error("cannot start a thread with yourself");
  const key = pairKey(userA, userB, meta.contextKey);
  const existing = (await allThreads()).find(
    (t) =>
      t.kind === "direct" &&
      pairKey(t.participants[0] ?? "", t.participants[1] ?? "", t.meta.contextKey) === key,
  );
  if (existing) return existing;

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
  const p = msgPath(threadId);
  if (!existsSync(p)) return [];
  const lines = (await readFile(p, "utf8")).split("\n").filter(Boolean);
  const out: ChatMessage[] = [];
  for (const l of lines.slice(-limit)) {
    try {
      out.push(JSON.parse(l) as ChatMessage);
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function postMessage(
  threadId: string,
  from: string,
  text: string,
  kind: MessageKind = "text",
  extra: MessageExtra = {},
): Promise<ChatMessage> {
  const clean = text.trim().slice(0, 4000);
  // text/system need words; attachment/location/call kinds may carry no text
  const needsText = kind === "text" || kind === "system";
  if (needsText && !clean) throw new Error("empty message");
  await mkdir(join(root(), "msg"), { recursive: true });
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
  };
  await appendFile(msgPath(threadId), JSON.stringify(msg) + "\n", "utf8");

  const t = await getThread(threadId);
  if (t) {
    t.lastMessageAt = msg.at;
    t.lastMessage = { from, text: previewText(msg), at: msg.at };
    if (from !== "system") t.reads[from] = msg.at; // sender has read their own
    await writeThread(t);
  }
  return msg;
}

export async function markThreadRead(threadId: string, userId: string): Promise<void> {
  const t = await getThread(threadId);
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
