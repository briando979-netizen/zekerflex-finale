import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { canAccess, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { opensInline, readChatMedia } from "@/lib/messaging/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inbox/:threadId/media/:mediaId — stream a chat attachment to a participant.
// Only an attachment this thread's messages show (lib/messaging/media.ts).
export async function GET(
  req: Request,
  props: { params: Promise<{ threadId: string; mediaId: string }> }
): Promise<Response> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Niet gevonden" } }, { status: 404 });
    }
    const file = await readChatMedia(thread.id, params.mediaId, p.userId);
    if (!file) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Bestand ontbreekt" } }, { status: 404 });

    // Opened in its own tab, the middleware gives this path a sandboxed CSP
    // (CHAT_MEDIA_CSP in lib/security/csp.ts); anything not plainly safe downloads.
    const inline = new URL(req.url).searchParams.get("dl") !== "1" && opensInline(file.mimeType);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.filename.replace(/[^\x20-\x7E]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        // elk type mag in de chat: de browser mag nooit zelf raden wat het is
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
