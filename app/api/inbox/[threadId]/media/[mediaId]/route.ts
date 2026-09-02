import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { canAccess, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { readChatMedia } from "@/lib/messaging/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inbox/:threadId/media/:mediaId — stream a chat attachment to a participant.
export async function GET(
  req: Request,
  { params }: { params: { threadId: string; mediaId: string } },
): Promise<Response> {
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Niet gevonden" } }, { status: 404 });
    }
    const file = await readChatMedia(thread.id, params.mediaId);
    if (!file) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bestand ontbreekt" } }, { status: 404 });

    const download = new URL(req.url).searchParams.get("dl") === "1";
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(file.filename)}"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
