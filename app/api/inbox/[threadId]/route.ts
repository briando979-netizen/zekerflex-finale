import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  canAccess,
  getMessageById,
  getMessages,
  getThread,
  isReadByOthers,
  markThreadRead,
  postMessage,
  previewText,
  type MessageExtra,
} from "@/lib/messaging/store";
import { anyPlatformAdmin, isPlatformAdmin, userDirectory } from "@/lib/messaging/contacts";
import { getPresence, touchPresence } from "@/lib/messaging/presence";
import { getUserAvatars } from "@/lib/profile/store";
import { getChatSettings } from "@/lib/messaging/settings";
import { maybeAutoReply } from "@/lib/messaging/auto-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inbox/:id — full conversation; marks it read for the caller.
export async function GET(
  _req: Request,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await touchPresence(p.userId);
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }

    const messages = await getMessages(thread.id, 400);
    await markThreadRead(thread.id, p.userId);

    const ids = new Set<string>(thread.participants);
    messages.forEach((m) => ids.add(m.from));
    const [directory, presence, avatars, settings] = await Promise.all([
      userDirectory([...ids]).then((m) => Object.fromEntries(m)),
      getPresence([...ids]),
      getUserAvatars([...ids]),
      getChatSettings(p.userId),
    ]);

    return NextResponse.json({
      thread: {
        id: thread.id,
        kind: thread.kind,
        subject: thread.meta.subject ?? null,
        title: thread.meta.title ?? null,
        communityId: thread.meta.communityId ?? null,
        ownerId: thread.meta.ownerId ?? null,
        shiftId: thread.meta.shiftId ?? null,
        shiftTitle: thread.meta.shiftTitle ?? null,
        branch: thread.meta.branch ?? null,
        participants: thread.participants,
      },
      me: { userId: p.userId, isAdmin: admin },
      directory,
      presence,
      avatars,
      settings: { quickReplies: settings.quickReplies },
      messages: messages.map((m) => ({
        ...m,
        readByOthers: isReadByOthers(thread, m),
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const sendSchema = z.object({
  text: z.string().trim().max(4000).optional().default(""),
  kind: z.enum(["text", "voice", "file", "image", "location", "call"]).optional().default("text"),
  attachment: z
    .object({
      mediaId: z.string().min(1).max(64),
      filename: z.string().min(1).max(200),
      mimeType: z.string().min(1).max(120),
      sizeBytes: z.number().int().nonnegative(),
      durationSec: z.number().nonnegative().optional(),
    })
    .optional(),
  location: z
    .object({
      lat: z.number().gte(-90).lte(90),
      lng: z.number().gte(-180).lte(180),
      label: z.string().max(160).optional(),
    })
    .optional(),
  call: z
    .object({
      mode: z.enum(["audio", "video", "screen"]),
      status: z.enum(["started", "ended", "missed", "declined"]),
      durationSec: z.number().int().nonnegative().optional(),
    })
    .optional(),
  replyToId: z.string().min(1).max(64).optional(),
});

// POST /api/inbox/:id — send a message (text, voice, file, image, location, call log).
export async function POST(
  request: Request,
  { params }: { params: { threadId: string } },
): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }
    const input = sendSchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );

    if (input.kind === "text" && !input.text.trim()) {
      throw AppError.validation("Leeg bericht");
    }
    if (input.kind === "voice" || input.kind === "file" || input.kind === "image") {
      if (!input.attachment) throw AppError.validation("Bijlage ontbreekt");
    }
    if (input.kind === "location" && !input.location) throw AppError.validation("Locatie ontbreekt");
    if (input.kind === "call" && !input.call) throw AppError.validation("Gespreksinfo ontbreekt");

    const extra: MessageExtra = {};
    if (input.attachment) {
      extra.attachment = {
        mediaId: input.attachment.mediaId,
        filename: input.attachment.filename,
        mimeType: input.attachment.mimeType,
        sizeBytes: input.attachment.sizeBytes,
        ...(input.attachment.durationSec != null ? { durationSec: input.attachment.durationSec } : {}),
      };
    }
    if (input.location) {
      extra.location = {
        lat: input.location.lat,
        lng: input.location.lng,
        ...(input.location.label ? { label: input.location.label } : {}),
      };
    }
    if (input.call) {
      extra.call = {
        mode: input.call.mode,
        status: input.call.status,
        ...(input.call.durationSec != null ? { durationSec: input.call.durationSec } : {}),
      };
    }
    if (input.replyToId) {
      const target = await getMessageById(thread.id, input.replyToId);
      if (target) {
        extra.replyTo = {
          id: target.id,
          from: target.from,
          excerpt: previewText(target).slice(0, 120),
          kind: target.kind,
        };
      }
    }

    // An admin replying on a support thread posts as "ZekerFlex Support".
    const from =
      thread.kind === "support" && admin && !thread.participants.includes(p.userId)
        ? (await anyPlatformAdmin()) ?? p.userId
        : p.userId;

    const msg = await postMessage(thread.id, from, input.text, input.kind, extra);

    // auto-reply for 1-on-1 threads (skipped for call logs)
    if (thread.kind === "direct" && input.kind !== "call") {
      const other = thread.participants.find((id) => id !== from);
      if (other) void maybeAutoReply(thread.id, other, from);
    }

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
