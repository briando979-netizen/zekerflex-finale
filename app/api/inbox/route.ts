import { withUsage } from "@/lib/ops/usage";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  ensureDirectThread,
  ensureSupportThread,
  getMessages,
  listThreadsForUser,
  postMessage,
  unreadForUser,
  type ChatThread,
} from "@/lib/messaging/store";
import { isPlatformAdmin, resolveShiftContact, userDirectory } from "@/lib/messaging/contacts";
import { getPresence, touchPresence, touchVisible } from "@/lib/messaging/presence";
import { getUserAvatars } from "@/lib/profile/store";
import { listContacts } from "@/lib/messaging/contact-book";
import { maybeAutoReply } from "@/lib/messaging/auto-reply";
import { notifyNewMessage } from "@/lib/messaging/notify";
import { checkChatPin, getChatPrefs, isMuted, visibleFrom } from "@/lib/messaging/thread-prefs";
import { scanChatMessage } from "@/lib/agenda/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inbox — the signed-in user's threads, unread counts + a name directory.
// ?visible=1 is sent while the polling tab is in view (suppresses chat pushes).
async function handleGET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await touchPresence(p.userId);
    if (new URL(request.url).searchParams.get("visible") === "1") await touchVisible(p.userId);
    const admin = await isPlatformAdmin(p.userId);
    const allThreads = await listThreadsForUser(p.userId, admin);
    // per-user chat settings (lib/messaging/thread-prefs.ts)
    const prefs = await getChatPrefs(p.userId);
    const pinOk = await checkChatPin(p.userId, request.headers.get("x-chat-pin"));
    const threads = allThreads.filter((t) => {
      const gone = prefs.deletedAt[t.id];
      if (gone && t.lastMessageAt <= gone) return false; // deleted, nothing new since
      if (prefs.locked.includes(t.id) && !pinOk) return false;
      return true;
    });
    const lockedCount = allThreads.filter((t) => prefs.locked.includes(t.id)).length;

    const dirIds = new Set<string>();
    const rows = await Promise.all(
      threads.map(async (t) => {
        const from = visibleFrom(prefs, t.id);
        const msgs = (await getMessages(t.id, 300)).filter((m) => !from || m.at > from);
        const unread = unreadForUser(t, msgs, p.userId);
        t.participants.forEach((id) => dirIds.add(id));
        if (t.lastMessage) dirIds.add(t.lastMessage.from);
        return {
          id: t.id,
          kind: t.kind,
          participants: t.participants,
          subject: t.meta.subject ?? null,
          title: t.meta.title ?? null,
          communityId: t.meta.communityId ?? null,
          shiftId: t.meta.shiftId ?? null,
          shiftTitle: t.meta.shiftTitle ?? null,
          branch: t.meta.branch ?? null,
          lastMessage: t.lastMessage && (!from || t.lastMessage.at > from) ? t.lastMessage : null,
          lastMessageAt: t.lastMessageAt,
          unread,
          archived: prefs.archived.includes(t.id),
          muted: isMuted(prefs, t.id),
          locked: prefs.locked.includes(t.id),
          favorite: prefs.favorites.includes(t.id),
          lists: Object.entries(prefs.lists).filter(([, ids]) => ids.includes(t.id)).map(([n]) => n),
        };
      }),
    );

    const contacts = await listContacts(p.userId);
    contacts.forEach((c) => dirIds.add(c.userId));

    const ids = [...dirIds];
    const [directory, presence, avatars] = await Promise.all([
      userDirectory(ids).then((m) => Object.fromEntries(m)),
      getPresence(ids),
      getUserAvatars(ids),
    ]);

    return NextResponse.json({
      me: { userId: p.userId, name: p.fullName, isAdmin: admin },
      threads: rows,
      directory,
      presence,
      avatars,
      contacts,
      chatPrefs: { lists: Object.keys(prefs.lists), hasPin: Boolean(prefs.pinHash), lockedCount, pinOk, blocked: prefs.blocked },
      // muted and archived chats don't count towards the badge
      totalUnread: rows.filter((r) => !r.muted && !r.archived).reduce((s, r) => s + r.unread, 0),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const startSchema = z.union([
  z.object({ shiftId: z.string().min(1), text: z.string().trim().min(1).max(4000) }),
  z.object({
    toUserId: z.string().min(1),
    text: z.string().trim().min(1).max(4000),
    contextKey: z.string().max(80).optional(),
    subject: z.string().max(120).optional(),
  }),
  z.object({ support: z.literal(true), text: z.string().trim().min(1).max(4000) }),
]);

// POST /api/inbox — start (or continue) a conversation and send the first message.
async function handlePOST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = startSchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );

    let thread: ChatThread;
    let otherUserId: string | null = null;

    if ("support" in input) {
      thread = await ensureSupportThread(p.userId);
    } else if ("shiftId" in input) {
      const contact = await resolveShiftContact(input.shiftId);
      if (!contact) throw AppError.notFound("Geen contactpersoon gevonden voor deze klus.");
      if (contact.userId === p.userId) throw AppError.validation("Je bent zelf de contactpersoon.");
      thread = await ensureDirectThread(p.userId, contact.userId, {
        contextKey: `shift:${input.shiftId}`,
        shiftId: input.shiftId,
        shiftTitle: contact.shiftTitle,
        branch: contact.branch,
        subject: contact.shiftTitle,
      });
      otherUserId = contact.userId;
    } else {
      if (input.toUserId === p.userId) throw AppError.validation("Je kunt jezelf geen bericht sturen.");
      thread = await ensureDirectThread(p.userId, input.toUserId, {
        ...(input.contextKey ? { contextKey: input.contextKey } : {}),
        ...(input.subject ? { subject: input.subject } : {}),
      });
      otherUserId = input.toUserId;
    }

    const msg = await postMessage(thread.id, p.userId, input.text);
    if (otherUserId) void maybeAutoReply(thread.id, otherUserId, p.userId);
    after(() => notifyNewMessage(thread, msg));
    after(() => scanChatMessage(thread, msg));
    return NextResponse.json({ threadId: thread.id }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export const GET = withUsage("inbox-lijst (polling)", handleGET);

export const POST = withUsage("inbox-bericht", handlePOST);
