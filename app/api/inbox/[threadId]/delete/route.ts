import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, deleteMessage, getMessageById, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ messageId: z.string().min(1).max(40) });

// POST /api/inbox/:id/delete — trek je eigen bericht in ("verwijderd voor iedereen").
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
    if (!body.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldig verzoek" } }, { status: 400 });
    const existing = await getMessageById(params.threadId, body.data.messageId);
    if (!existing) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bericht niet gevonden" } }, { status: 404 });
    if (existing.from !== p.userId && !admin) throw AppError.forbidden("Je kunt alleen je eigen berichten verwijderen");
    await deleteMessage(params.threadId, body.data.messageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
