import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getApplication } from "@/lib/jobs/store";
import { readUpload } from "@/lib/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/sollicitaties/<id>/<uploadId> — a job application's attachment
// (motivatiebrief / cv). Scoped: the uploadId must be one this application
// actually references, so an admin can't enumerate the whole Upload table here.
export async function GET(
  _req: Request,
  props: { params: Promise<{ id: string; uploadId: string }> },
): Promise<Response> {
  const { id, uploadId } = await props.params;
  try {
    const p = await requirePrincipal();
    requireRole(p, "PLATFORM_ADMIN", "HQ_ADMIN");

    const app = await getApplication(id);
    const file = app?.files.find((f) => f.uploadId === uploadId);
    if (!file) return new NextResponse("Bestand niet gevonden", { status: 404 });

    const f = await readUpload(uploadId);
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "Content-Type": f.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(f.filename)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
