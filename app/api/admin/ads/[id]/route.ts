import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { getAd, deleteAd } from "@/lib/ads/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/admin/ads/<id> — discard a generated ad draft.
export const DELETE = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  const ad = await getAd(params.id);
  if (!ad) throw AppError.notFound("Advertentie niet gevonden");

  await deleteAd(params.id);

  await recordAudit({
    category: "ADMIN",
    action: "ads.deleted",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Advertentie "${ad.headline}" verwijderd`,
    targetType: "ad",
    targetId: params.id,
  });

  return NextResponse.json({ ok: true });
});
