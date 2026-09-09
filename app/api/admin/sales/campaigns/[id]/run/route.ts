import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getCampaign } from "@/lib/sales/campaign";
import { runSalesEngineTick } from "@/lib/sales/engine";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

/** Manually run one engine tick for this campaign now (bypasses the master
 *  switch + pause, but still respects AUTOPILOT gating). */
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  const { id } = paramsSchema.parse(params);
  const campaign = await getCampaign(id);
  await recordAudit({
    category: "SALES",
    action: "sales.engine.manual-run",
    actorUserId: principal.userId,
    summary: `Sales-motor handmatig gedraaid voor campagne "${campaign.name}"`,
    targetType: "salesCampaign",
    targetId: id,
  });
  const result = await runSalesEngineTick({ campaignId: id, force: true });
  return NextResponse.json({ result });
});
