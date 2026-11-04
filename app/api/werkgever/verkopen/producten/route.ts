import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { siteTenantOf } from "@/lib/sites/access";
import { maakVerkoperProduct, verkoperProductDto } from "@/lib/shop/verkoper";
import { nieuwProductSchema } from "@/lib/shop/verkoper-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/werkgever/verkopen/producten — een eigen product aanbieden in de
// ZekerFlex-shop. Het staat pas in de shop na goedkeuring door de beheerder.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "verkoper-product", identifier: p.userId, limit: 60, windowSeconds: 3600, message: "Even rustig aan met producten toevoegen; probeer het zo opnieuw." });
    const tenantId = await siteTenantOf(p);
    const parsed = nieuwProductSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Controleer de gegevens van het product.");
    const product = await maakVerkoperProduct(tenantId, parsed.data);
    await recordAudit({
      category: "ADMIN",
      action: "shop.verkoper.product",
      actorUserId: p.userId,
      summary: `Product aangeboden in de shop: ${product.name}`,
      targetType: "shop-product",
      targetId: product.id,
      metadata: { tenantId },
    });
    return NextResponse.json({ product: verkoperProductDto(product) }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
