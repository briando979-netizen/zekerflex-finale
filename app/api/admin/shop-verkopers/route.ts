import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { beoordeelProduct, markeerVerkoperUitbetaald } from "@/lib/shop/verkoper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("goedkeuren"), productId: z.string().min(1).max(60) }),
  z.object({ actie: z.literal("afwijzen"), productId: z.string().min(1).max(60), reden: z.string().trim().max(400).default("") }),
  z.object({ actie: z.literal("uitbetaald"), tenantId: z.string().min(1).max(60) }),
]);

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

// POST /api/admin/shop-verkopers — Beheer → Verkopers: een product van een
// verkoper goedkeuren of afwijzen, of de verkopen die vaststaan als uitbetaald
// markeren nadat het bedrag is overgemaakt.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const d = schema.parse(await request.json().catch(() => ({})));
  if (d.actie === "uitbetaald") {
    const r = await markeerVerkoperUitbetaald(d.tenantId);
    await recordAudit({
      category: "BILLING",
      action: "shop.verkoper.uitbetaald",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Verkoper uitbetaald: ${r.aantal} verkoop/verkopen, ${euro(r.cents)}`,
      targetType: "tenant",
      targetId: d.tenantId,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, ...r });
  }
  const r = await beoordeelProduct(d.productId, d.actie, d.actie === "afwijzen" ? d.reden : null);
  await recordAudit({
    category: "ADMIN",
    action: d.actie === "goedkeuren" ? "shop.verkoper.goedgekeurd" : "shop.verkoper.afgewezen",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${d.actie === "goedkeuren" ? "Goedgekeurd" : "Afgewezen"}: ${r.naam}`,
    targetType: "shop-product",
    targetId: d.productId,
    metadata: { tenantId: r.tenantId },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
