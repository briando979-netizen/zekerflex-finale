import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { statusFoto } from "@/lib/messaging/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De foto van een status: GET ?van=<eigenaar>. Alleen voor wie de status mag zien (lib/messaging/status.ts magZien);
// voor ieder ander bestaat hij niet (404). Niet in een gedeelde cache: na 24 uur of na weghalen is hij weg.

export async function GET(req: Request, props: { params: Promise<{ statusId: string }> }): Promise<Response> {
  try {
    const p = await requirePrincipal();
    const { statusId } = await props.params;
    const van = new URL(req.url).searchParams.get("van") ?? "";
    const foto = /^[0-9a-f-]{36}$/.test(statusId) && van ? await statusFoto(p.userId, van, statusId) : null;
    if (!foto) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Deze foto is er niet (meer)." } }, { status: 404 });
    return new Response(new Uint8Array(foto.bytes), {
      headers: { "Content-Type": foto.mimeType, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
