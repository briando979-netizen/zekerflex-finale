import { NextResponse } from "next/server";
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
} from "@/lib/messaging/store";
import { isPlatformAdmin, resolveShiftContact, userDirectory } from "@/lib/messaging/contacts";
import { getPresence, touchPresence } from "@/lib/messaging/presence";
import { getUserAvatars } from "@/lib/profile/store";
import { listContacts } from "@/lib/messaging/contact-book";
import { maybeAutoReply } from "@/lib/messaging/auto-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inbox — the signed-in user's threads, unread counts + a name directory.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await touchPresence(p.userId);
    const admin = await isPlatformAdmin(p.userId);
    const threads = await listThreadsForUser(p.userId, admin);

    const dirIds = new Set<string>();
    const rows = await Promise.all(
      threads.map(async (t) => {
        const msgs = await getMessages(t.id, 300);
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
          lastMessage: t.lastMessage,
          lastMessageAt: t.lastMessageAt,
          unread,
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
      totalUnread: rows.reduce((s, r) => s + r.unread, 0),
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
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = startSchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );

    let threadId: string;
    let otherUserId: string | null = null;

    if ("support" in input) {
      const t = await ensureSupportThread(p.userId);
      threadId = t.id;
    } else if ("shiftId" in input) {
      const contact = await resolveShiftContact(input.shiftId);
      if (!contact) throw AppError.notFound("Geen contactpersoon gevonden voor deze klus.");
      if (contact.userId === p.userId) throw AppError.validation("Je bent zelf de contactpersoon.");
      const t = await ensureDirectThread(p.userId, contact.userId, {
        contextKey: `shift:${input.shiftId}`,
        shiftId: input.shiftId,
        shiftTitle: contact.shiftTitle,
        branch: contact.branch,
        subject: contact.shiftTitle,
      });
      threadId = t.id;
      otherUserId = contact.userId;
    } else {
      if (input.toUserId === p.userId) throw AppError.validation("Je kunt jezelf geen bericht sturen.");
      const t = await ensureDirectThread(p.userId, input.toUserId, {
        ...(input.contextKey ? { contextKey: input.contextKey } : {}),
        ...(input.subject ? { subject: input.subject } : {}),
      });
      threadId = t.id;
      otherUserId = input.toUserId;
    }

    await postMessage(threadId, p.userId, input.text);
    if (otherUserId) void maybeAutoReply(threadId, otherUserId, p.userId);
    return NextResponse.json({ threadId }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
