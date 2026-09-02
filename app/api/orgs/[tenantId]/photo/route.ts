import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { getOrgProfileExtra } from "@/lib/profile/store";
import { readProfileImage } from "@/lib/profile/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/orgs/:tenantId/photo — public company photo (used on marketing pages).
export async function GET(
  _req: Request,
  { params }: { params: { tenantId: string } },
): Promise<Response> {
  try {
    const extra = await getOrgProfileExtra(params.tenantId);
    if (!extra.photoUploadId) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Geen foto" } }, { status: 404 });
    }
    const img = await readProfileImage(extra.photoUploadId);
    if (!img) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Geen foto" } }, { status: 404 });
    return new Response(new Uint8Array(img.bytes), {
      headers: { "Content-Type": img.mimeType, "Cache-Control": "public, max-age=600" },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
