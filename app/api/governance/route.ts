import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import * as catalog from "@/lib/data-governance/catalog";
import * as quality from "@/lib/data-governance/quality";
import * as mdm from "@/lib/data-governance/mdm";
import * as privacy from "@/lib/data-governance/privacy";
import * as governance from "@/lib/data-governance/governance";
import * as analytics from "@/lib/data-governance/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const type = request.nextUrl.searchParams.get("type");
    const assetId = request.nextUrl.searchParams.get("assetId");

    if (!type) throw new Error("type parameter required");

    if (type === "dashboard") {
      const dashboard = await analytics.getGovernanceDashboard();
      return NextResponse.json(dashboard);
    }

    if (type === "trends" && assetId) {
      const trends = await analytics.trackQualityTrends(assetId);
      return NextResponse.json(trends);
    }

    if (type === "impact" && assetId) {
      const impact = await analytics.analyzeImpactOfDataQualityIssues(assetId);
      return NextResponse.json(impact);
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const body = await request.json();
    const { action, assetId } = body;

    if (!action) throw new Error("action required");

    switch (action) {
      case "classify":
        return NextResponse.json(await privacy.classifyData(body.classification));
      case "audit_access":
        return NextResponse.json(await privacy.audilPrivacyAccess(body.userId, body.assetId, body.action));
      case "create_policy":
        return NextResponse.json(await governance.createGovernancePolicy(body.policy));
      case "check_quality":
        return NextResponse.json(await quality.validateDataQuality(body.assetId));
      case "generate_report":
        return NextResponse.json(await governance.generateGovernanceReport(body.assetId));
      case "get_improvement_plan":
        return NextResponse.json(await analytics.generateImprovementPlan(body.assetId));
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
