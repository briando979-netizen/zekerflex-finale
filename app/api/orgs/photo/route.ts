import { NextResponse } from "next/server";
import { requirePrincipal, type Principal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { storeProfileImage } from "@/lib/profile/media";
import { saveOrgProfileExtra } from "@/lib/profile/store";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function myTenantId(p: Principal): Promise<string> {
  const scope = await resolveEmployerScope(p);
  const id = scope.tenantIds[0];
  if (!id) throw AppError.forbidden("Geen organisatie gekoppeld aan dit account.");
  return id;
}

// POST /api/orgs/photo (multipart: file) — set the company photo.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await myTenantId(p);
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw AppError.validation("Veld 'file' ontbreekt");
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      const img = await storeProfileImage({
        filename: file.name || "bedrijfsfoto",
        mimeType: file.type || "image/jpeg",
        bytes,
      });
      await saveOrgProfileExtra(tenantId, { photoUploadId: img.id });
      return NextResponse.json({ ok: true, photoUrl: `/api/orgs/${tenantId}/photo` }, { status: 201 });
    } catch (e) {
      if (e instanceof AppError) throw e;
      logger.error("org photo upload failed", { error: (e as Error).message });
      throw AppError.upstream("Uploaden is mislukt. Probeer het later opnieuw.");
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
