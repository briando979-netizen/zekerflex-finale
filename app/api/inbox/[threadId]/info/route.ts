import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, getMessageById, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin, userDirectory } from "@/lib/messaging/contacts";
import { chatPrivacy } from "@/lib/messaging/settings";
import { berichtInfo } from "@/lib/messaging/bericht-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inbox/:id/info?messageId= — berichtinfo van je EIGEN bericht (zoals WhatsApp): wie het gelezen heeft en wie
// nog niet, met dezelfde leesbevestigingsregels als de vinkjes (lib/messaging/bericht-info.ts). Alleen-lezen.
export async function GET(req: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }
    const messageId = new URL(req.url).searchParams.get("messageId") ?? "";
    const m = messageId ? await getMessageById(thread.id, messageId) : null;
    // andermans bericht: geen info (en geen 403, zie AGENTS.md), gewoon niet gevonden
    if (!m || m.from !== p.userId || m.deleted) throw AppError.notFound("Bericht niet gevonden");
    const privacy = await chatPrivacy([...thread.participants, p.userId]);
    const info = berichtInfo(thread, m, p.userId, privacy.noReceipts);
    const namen = Object.fromEntries([...(await userDirectory([...info.gelezen, ...info.nogNiet]))].map(([id, u]) => [id, u.name]));
    return NextResponse.json({ ...info, namen });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
