import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { deliverIcpOpgave } from "@/lib/billing/icp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAdminAccess<{ period: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  const { period } = params;
  if (!/^\d{4}-Q[1-4]$/.test(period)) return NextResponse.json({ error: { code: "VALIDATION", message: "Ongeldig tijdvak" } }, { status: 400 });
  const result = await deliverIcpOpgave(period);
  await recordAudit({ category: "BILLING", action: result.ok ? "icp.delivered" : "icp.delivery_failed", severity: result.ok ? "info" : "warning", actorUserId: principal.userId, actorLabel: "user", summary: `ICP-opgave ${period}: ${result.detail}`, targetType: "icp", targetId: period }).catch(() => undefined);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
});
