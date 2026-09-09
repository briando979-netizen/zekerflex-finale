import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getCertificate } from "@/lib/certificates/store";
import { readUpload } from "@/lib/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/certificates/<id>/file — de eigen certificaat-upload.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }): Promise<Response> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    const cert = await getCertificate(p.userId, params.id);
    if (!cert?.uploadId) return new NextResponse("Geen bestand", { status: 404 });
    const f = await readUpload(cert.uploadId);
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "Content-Type": f.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(f.filename)}"`,
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
