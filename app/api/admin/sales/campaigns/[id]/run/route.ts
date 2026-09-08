import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getCampaign } from "@/lib/sales/campaign";
import { runSalesEngineTick } from "@/lib/sales/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });

/** Manually run one engine tick for this campaign now (bypasses the master
 *  switch + pause, but still respects AUTOPILOT gating). */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
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
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
