import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, getMessageById, getThread, postMessage, type MessageExtra } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  fromThreadId: z.string().min(1).max(64),
  messageId: z.string().min(1).max(40),
  toThreadId: z.string().min(1).max(64),
});

const FORWARDABLE = ["text", "image", "file", "voice", "location"];

// POST /api/inbox/forward — stuur een bericht door naar een ander gesprek.
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const body = schema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldig verzoek" } }, { status: 400 });
    const { fromThreadId, messageId, toThreadId } = body.data;
    const admin = await isPlatformAdmin(p.userId);
    const [from, to] = await Promise.all([getThread(fromThreadId), getThread(toThreadId)]);
    if (!from || !canAccess(from, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bron-gesprek niet gevonden" } }, { status: 404 });
    }
    if (!to || !canAccess(to, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Doel-gesprek niet gevonden" } }, { status: 404 });
    }
    const src = await getMessageById(fromThreadId, messageId);
    if (!src || src.deleted) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bericht niet gevonden" } }, { status: 404 });
    }
    if (!FORWARDABLE.includes(src.kind)) throw AppError.validation("Dit bericht kan niet worden doorgestuurd");
    const extra: MessageExtra = { forwarded: true };
    if (src.attachment) extra.attachment = src.attachment;
    if (src.location) extra.location = src.location;
    const msg = await postMessage(toThreadId, p.userId, src.text, src.kind, extra);
    return NextResponse.json({ ok: true, threadId: toThreadId, messageId: msg.id });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
