import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { markeerUitbetaald, partnerBestellingen } from "@/lib/shop/partner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ tenantId: z.string().min(1).max(60) });

// POST /api/admin/shop-partners { tenantId } — Beheer → Partnerprogramma: alle
// vergoedingen van dit bedrijf die vaststaan ("uit te betalen") als uitbetaald
// markeren, nadat de beheerder het bedrag heeft overgemaakt.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { tenantId } = schema.parse(await request.json().catch(() => ({})));
  const vast = (await partnerBestellingen(tenantId)).filter((r) => r.status === "vast");
  const n = await markeerUitbetaald(tenantId, vast.map((r) => r.orderId));
  const cents = vast.reduce((s, r) => s + r.vergoedingCents, 0);
  await recordAudit({
    category: "BILLING",
    action: "shop.partner.uitbetaald",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Partnervergoeding uitbetaald: ${n} bestelling(en), € ${(cents / 100).toFixed(2).replace(".", ",")}`,
    targetType: "tenant",
    targetId: tenantId,
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, aantal: n, cents });
});
