import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { storeProfileImage } from "@/lib/profile/media";
import { removeUserAvatar, saveUserProfileExtra } from "@/lib/profile/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/profile/avatar (multipart: file) — set your own profile photo.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw AppError.validation("Veld 'file' ontbreekt");
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      const img = await storeProfileImage({
        filename: file.name || "avatar",
        mimeType: file.type || "image/jpeg",
        bytes,
      });
      await saveUserProfileExtra(p.userId, { avatarUploadId: img.id });
      return NextResponse.json({ ok: true, avatarUrl: `/api/profile/${p.userId}/avatar` }, { status: 201 });
    } catch (e) {
      throw AppError.validation((e as Error).message);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/profile/avatar — remove your photo.
export async function DELETE(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await removeUserAvatar(p.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
