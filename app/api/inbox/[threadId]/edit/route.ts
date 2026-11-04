import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, editMessage, EDIT_WINDOW_MS, getMessageById, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ messageId: z.string().min(1).max(40), text: z.string().trim().min(1).max(4000) });

// POST /api/inbox/:id/edit — bewerk je eigen tekstbericht (tot 24 uur na versturen).
// Het bericht krijgt editedAt; de bubbel toont "bewerkt" met die tijd. Geen push.
export async function POST(req: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }
    const body = schema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Schrijf eerst een bericht" } }, { status: 400 });
    const existing = await getMessageById(params.threadId, body.data.messageId);
    if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bericht niet gevonden" } }, { status: 404 });
    // only the sender — also no admin: someone else's words are never rewritten
    if (existing.from !== p.userId) throw AppError.forbidden("Je kunt alleen je eigen berichten bewerken");
    if (existing.kind !== "text" || existing.deleted) throw AppError.validation("Alleen een tekstbericht kun je bewerken");
    if (Date.now() - new Date(existing.at).getTime() > EDIT_WINDOW_MS) throw AppError.validation("Een bericht kun je tot 24 uur na het versturen bewerken");
    const message = await editMessage(params.threadId, body.data.messageId, body.data.text);
    if (!message) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bericht niet gevonden" } }, { status: 404 });
    return NextResponse.json({ message });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
