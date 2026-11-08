import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import * as smsAnalytics from "@/lib/sms/analytics";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireRole("PLATFORM_ADMIN");
    const principal = await requirePrincipal();
    const tenant = await (await import("@/lib/auth")).getTenant(principal);

    const campaignId = request.nextUrl.searchParams.get("campaignId");
    if (!campaignId) throw AppError.validation("campaignId required");

    const metrics = await smsAnalytics.getSMSMetrics(campaignId, tenant.id);
    const topMessages = await smsAnalytics.getTopPerformingMessages(tenant.id, 10);
    const topClicked = await smsAnalytics.getMostClickedMessages(tenant.id, 10);

    return NextResponse.json({
      metrics,
      topMessages,
      topClicked,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
