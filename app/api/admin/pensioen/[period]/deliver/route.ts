import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { buildPensioenAangifte, savePensioenAangifte } from "@/lib/pensioen/aangifte";
import { deliverPensioenAangifte } from "@/lib/pensioen/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/pensioen/<period>/deliver — build the latest data, then try to transmit to StiPP.
export const POST = withAdminAccess<{ period: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  const { period } = params;
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldig tijdvak" } }, { status: 400 });
  await savePensioenAangifte(await buildPensioenAangifte(period));
  const result = await deliverPensioenAangifte(period);
  await recordAudit({
    category: "BILLING",
    action: result.ok ? "pensioen.aangifte.delivered" : "pensioen.aangifte.delivery_failed",
    severity: result.ok ? "info" : "warning",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `StiPP-aangifte ${period}: ${result.detail}`,
    targetType: "pensioen-aangifte",
    targetId: period,
  }).catch(() => undefined);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
});
