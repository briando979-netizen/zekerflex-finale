import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { canAccess, getThread } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { opensInline, readChatMedia } from "@/lib/messaging/media";
import { kleineChatFoto } from "@/lib/messaging/foto-klein";
import { leesBereik } from "@/lib/http/bereik";

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
    const zoek = new URL(req.url).searchParams;
    const inline = zoek.get("dl") !== "1" && opensInline(file.mimeType);
    // ?klein=1: de foto in de bubbel (lib/messaging/foto-klein.ts), na dezelfde toegangscontrole; lukt dat niet, het origineel
    const kleintje = inline && zoek.get("klein") === "1" ? await kleineChatFoto(file.bytes, file.mimeType) : null;
    const naam = kleintje ? `${file.filename.replace(/\.[A-Za-z0-9]{1,5}$/, "")}.jpg` : file.filename;
    // Range: een video speelt in Safari (iPhone) alleen af als we stukken kunnen geven (206); lib/http/bereik.ts
    const bereik = kleintje ? null : leesBereik(req.headers.get("range"), file.bytes.length);
    if (bereik === "ongeldig") {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.bytes.length}`, "Cache-Control": "private, no-store" } });
    }
    const inhoud = kleintje ?? (bereik ? file.bytes.subarray(bereik.start, bereik.eind + 1) : file.bytes);
    return new Response(new Uint8Array(inhoud), {
      status: bereik ? 206 : 200,
      headers: {
        "Content-Type": kleintje ? "image/jpeg" : file.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${naam.replace(/[^\x20-\x7E]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(naam)}`,
        // elk type mag in de chat: de browser mag nooit zelf raden wat het is
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
        ...(kleintje ? {} : { "Accept-Ranges": "bytes" }),
        ...(bereik ? { "Content-Range": `bytes ${bereik.start}-${bereik.eind}/${file.bytes.length}` } : {}),
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
