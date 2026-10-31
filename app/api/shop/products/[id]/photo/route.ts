import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { generateAndAttachConceptPhoto } from "@/lib/shop/concept-photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Een CPU-render op de eigen beeld-server kan lang duren; ruim timeout.
export const maxDuration = 180;

// POST /api/shop/products/:id/photo — genereert een productfoto via de eigen
// beeld-generator en koppelt die aan het product. Zet `active` NIET aan: de
// eigenaar controleert en activeert zelf. 412/502 (nette melding) als de
// generator uit staat of niet bereikbaar is.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params, principal }) => {
  const { imageUrl } = await generateAndAttachConceptPhoto(params.id, principal.userId);
  await recordAudit({
    category: "ADMIN",
    action: "shop.product.photo.generated",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Conceptfoto gegenereerd voor shopproduct ${params.id}`,
    targetType: "shop-product",
    targetId: params.id,
  });
  return NextResponse.json({ ok: true, imageUrl });
});
