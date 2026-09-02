import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getUserProfileExtra } from "@/lib/profile/store";
import { readProfileImage } from "@/lib/profile/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/profile/:userId/avatar — a user's photo (visible to any signed-in user).
export async function GET(
  _req: Request,
  { params }: { params: { userId: string } },
): Promise<Response> {
  try {
    await requirePrincipal();
    const extra = await getUserProfileExtra(params.userId);
    if (!extra.avatarUploadId) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Geen foto" } }, { status: 404 });
    }
    const img = await readProfileImage(extra.avatarUploadId);
    if (!img) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Geen foto" } }, { status: 404 });
    return new Response(new Uint8Array(img.bytes), {
      headers: { "Content-Type": img.mimeType, "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
