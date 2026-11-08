import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";

// Import all MRM subsystems
import * as campaigns from "@/lib/mrm/campaigns";
import * as assets from "@/lib/mrm/assets";
import * as resources from "@/lib/mrm/resources";
import * as budgets from "@/lib/mrm/budgets";
import * as automation from "@/lib/mrm/automation";
import * as attribution from "@/lib/mrm/attribution";

export const dynamic = "force-dynamic";

/**
 * MRM API endpoints — handles all 6 subsystems
 * POST /api/mrm { action, payload }
 * GET /api/mrm?action=...&...
 */

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action, payload } = body;

    if (!action) {
      throw AppError.validation("Actie is verplicht");
    }

    // ========================================================================
    // 1. CAMPAIGNS
    // ========================================================================

    if (action === "campaign.create") {
      const campaign = await campaigns.createCampaign(principal.tenantId, payload);
      return NextResponse.json({ campaign }, { status: 201 });
    }

    if (action === "campaign.update") {
      const campaign = await campaigns.updateCampaign(
        payload.id,
        principal.tenantId,
        payload.input,
      );
      return NextResponse.json({ campaign });
    }

    if (action === "campaign.updateStatus") {
      const campaign = await campaigns.updateCampaignStatus(
        payload.id,
        principal.tenantId,
        payload.status,
      );
      return NextResponse.json({ campaign });
    }

    if (action === "campaign.track") {
      const campaign = await campaigns.trackCampaignPerformance(
        payload.id,
        principal.tenantId,
        payload.metrics,
      );
      return NextResponse.json({ campaign });
    }

    if (action === "campaign.delete") {
      const campaign = await campaigns.deleteCampaign(payload.id, principal.tenantId);
      return NextResponse.json({ campaign });
    }

    // ========================================================================
    // 2. ASSETS
    // ========================================================================

    if (action === "asset.create") {
      const asset = await assets.createDigitalAsset(payload);
      return NextResponse.json({ asset }, { status: 201 });
    }

    if (action === "asset.update") {
      const asset = await assets.updateDigitalAsset(payload.id, payload.input);
      return NextResponse.json({ asset });
    }

    if (action === "asset.approve") {
      const asset = await assets.approveAsset(payload.id, principal.userId, payload.notes);
      return NextResponse.json({ asset });
    }

    if (action === "asset.reject") {
      const asset = await assets.rejectAsset(payload.id, principal.userId, payload.reason);
      return NextResponse.json({ asset });
    }

    if (action === "asset.createVersion") {
      const asset = await assets.createAssetVersion(payload.parentAssetId, payload.input);
      return NextResponse.json({ asset }, { status: 201 });
    }

    if (action === "asset.track") {
      const asset = await assets.trackAssetUsage(payload.id);
      return NextResponse.json({ asset });
    }

    // ========================================================================
    // 3. RESOURCES
    // ========================================================================

    if (action === "resource.allocate") {
      const allocation = await resources.createResourceAllocation(
        principal.tenantId,
        payload,
      );
      return NextResponse.json({ allocation }, { status: 201 });
    }

    if (action === "resource.update") {
      const allocation = await resources.updateResourceAllocation(
        payload.id,
        principal.tenantId,
        payload.input,
      );
      return NextResponse.json({ allocation });
    }

    if (action === "resource.trackUtilization") {
      const allocation = await resources.trackResourceUtilization(
        payload.id,
        principal.tenantId,
        payload.hoursUsed,
      );
      return NextResponse.json({ allocation });
    }

    if (action === "resource.updateStatus") {
      const allocation = await resources.updateResourceAllocationStatus(
        payload.id,
        principal.tenantId,
        payload.status,
      );
      return NextResponse.json({ allocation });
    }

    // ========================================================================
    // 4. BUDGETS
    // ========================================================================

    if (action === "budget.createLine") {
      const line = await budgets.createBudgetLine(payload);
      return NextResponse.json({ line }, { status: 201 });
    }

    if (action === "budget.updateLine") {
      const line = await budgets.updateBudgetLine(payload.id, payload.input);
      return NextResponse.json({ line });
    }

    if (action === "budget.trackSpend") {
      const line = await budgets.trackSpend(payload.id, payload.amount);
      return NextResponse.json({ line });
    }

    if (action === "budget.trackReturn") {
      const line = await budgets.trackReturn(payload.id, payload.amount);
      return NextResponse.json({ line });
    }

    if (action === "budget.forecast") {
      const forecast = await budgets.forecastBudgetNeed(
        payload.id,
        payload.currentRate,
        payload.daysRemaining,
      );
      return NextResponse.json({ forecast });
    }

    // ========================================================================
    // 5. AUTOMATION
    // ========================================================================

    if (action === "automation.createWorkflow") {
      const workflow = await automation.createAutomationWorkflow(
        principal.tenantId,
        payload,
      );
      return NextResponse.json({ workflow }, { status: 201 });
    }

    if (action === "automation.addStep") {
      const step = await automation.addWorkflowStep(
        payload.workflowId,
        principal.tenantId,
        payload.input,
      );
      return NextResponse.json({ step }, { status: 201 });
    }

    if (action === "automation.updateStep") {
      const step = await automation.updateWorkflowStep(payload.id, payload.input);
      return NextResponse.json({ step });
    }

    if (action === "automation.deleteStep") {
      const step = await automation.deleteWorkflowStep(payload.id);
      return NextResponse.json({ step });
    }

    if (action === "automation.updateStatus") {
      const workflow = await automation.updateWorkflowStatus(
        payload.id,
        principal.tenantId,
        payload.status,
      );
      return NextResponse.json({ workflow });
    }

    if (action === "automation.setLeadScoring") {
      const workflow = await automation.setLeadScoringRules(
        payload.id,
        principal.tenantId,
        payload.rules,
      );
      return NextResponse.json({ workflow });
    }

    if (action === "automation.track") {
      const workflow = await automation.trackWorkflowPerformance(
        payload.id,
        principal.tenantId,
        payload.metrics,
      );
      return NextResponse.json({ workflow });
    }

    if (action === "automation.duplicate") {
      const workflow = await automation.duplicateWorkflow(payload.id, principal.tenantId);
      return NextResponse.json({ workflow }, { status: 201 });
    }

    // ========================================================================
    // 6. ATTRIBUTION
    // ========================================================================

    if (action === "attribution.track") {
      const attr = await attribution.trackAttribution(payload);
      return NextResponse.json({ attribution: attr }, { status: 201 });
    }

    if (action === "attribution.createAnalysis") {
      const analysis = await attribution.createAttributionAnalysis(
        principal.tenantId,
        payload.period,
        payload.analysisType,
      );
      return NextResponse.json({ analysis }, { status: 201 });
    }

    throw AppError.validation(`Onbekende actie: ${action}`);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");

    if (!action) {
      throw AppError.validation("Actie is verplicht");
    }

    // ========================================================================
    // 1. CAMPAIGNS - GET
    // ========================================================================

    if (action === "campaign.list") {
      const { campaigns: campaignList, total, limit, offset } = await campaigns.getCampaigns(
        principal.tenantId,
        {
          status: searchParams.get("status") || undefined,
          type: searchParams.get("type") || undefined,
          limit: parseInt(searchParams.get("limit") || "50"),
          offset: parseInt(searchParams.get("offset") || "0"),
        },
      );
      return NextResponse.json({ campaigns: campaignList, total, limit, offset });
    }

    if (action === "campaign.get") {
      const campaign = await campaigns.getCampaignById(
        searchParams.get("id")!,
        principal.tenantId,
      );
      return NextResponse.json({ campaign });
    }

    // ========================================================================
    // 2. ASSETS - GET
    // ========================================================================

    if (action === "asset.list") {
      const { assets: assetList, total, limit, offset } = await assets.getAssetsByCampaign(
        searchParams.get("campaignId")!,
        {
          type: searchParams.get("type") || undefined,
          approvalStatus: searchParams.get("approvalStatus") || undefined,
          limit: parseInt(searchParams.get("limit") || "50"),
          offset: parseInt(searchParams.get("offset") || "0"),
        },
      );
      return NextResponse.json({ assets: assetList, total, limit, offset });
    }

    if (action === "asset.get") {
      const asset = await assets.getAssetById(searchParams.get("id")!);
      return NextResponse.json({ asset });
    }

    if (action === "asset.versions") {
      const versions = await assets.getAssetVersions(searchParams.get("assetId")!);
      return NextResponse.json({ versions });
    }

    if (action === "asset.pending") {
      const pending = await assets.getPendingApprovalAssets(
        parseInt(searchParams.get("limit") || "50"),
      );
      return NextResponse.json({ assets: pending });
    }

    // ========================================================================
    // 3. RESOURCES - GET
    // ========================================================================

    if (action === "resource.list") {
      const { allocations, total, limit, offset } = await resources.getResourceAllocations(
        principal.tenantId,
        {
          campaignId: searchParams.get("campaignId") || undefined,
          resourceType: searchParams.get("resourceType") || undefined,
          status: searchParams.get("status") || undefined,
          limit: parseInt(searchParams.get("limit") || "50"),
          offset: parseInt(searchParams.get("offset") || "0"),
        },
      );
      return NextResponse.json({ allocations, total, limit, offset });
    }

    if (action === "resource.get") {
      const allocation = await resources.getResourceAllocationById(
        searchParams.get("id")!,
        principal.tenantId,
      );
      return NextResponse.json({ allocation });
    }

    if (action === "resource.capacity") {
      const capacity = await resources.getTeamCapacityStatus(principal.tenantId);
      return NextResponse.json({ capacity });
    }

    if (action === "resource.available") {
      const available = await resources.getAvailableResources(
        principal.tenantId,
        searchParams.get("startDate")!,
        searchParams.get("endDate")!,
      );
      return NextResponse.json({ resources: available });
    }

    // ========================================================================
    // 4. BUDGETS - GET
    // ========================================================================

    if (action === "budget.list") {
      const lines = await budgets.getBudgetLinesByCampaign(searchParams.get("campaignId")!);
      return NextResponse.json({ lines });
    }

    if (action === "budget.get") {
      const line = await budgets.getBudgetLineById(searchParams.get("id")!);
      return NextResponse.json({ line });
    }

    if (action === "budget.summary") {
      const summary = await budgets.getCampaignBudgetSummary(searchParams.get("campaignId")!);
      return NextResponse.json({ summary });
    }

    if (action === "budget.alerts") {
      const alerts = await budgets.getBudgetAlerts(searchParams.get("campaignId")!);
      return NextResponse.json({ alerts });
    }

    // ========================================================================
    // 5. AUTOMATION - GET
    // ========================================================================

    if (action === "automation.list") {
      const { workflows, total, limit, offset } = await automation.getAutomationWorkflows(
        principal.tenantId,
        {
          status: searchParams.get("status") || undefined,
          type: searchParams.get("type") || undefined,
          limit: parseInt(searchParams.get("limit") || "50"),
          offset: parseInt(searchParams.get("offset") || "0"),
        },
      );
      return NextResponse.json({ workflows, total, limit, offset });
    }

    if (action === "automation.get") {
      const workflow = await automation.getAutomationWorkflowById(
        searchParams.get("id")!,
        principal.tenantId,
      );
      return NextResponse.json({ workflow });
    }

    if (action === "automation.metrics") {
      const metrics = await automation.getWorkflowMetrics(
        searchParams.get("id")!,
        principal.tenantId,
      );
      return NextResponse.json({ metrics });
    }

    if (action === "automation.active") {
      const active = await automation.getActiveWorkflows(principal.tenantId);
      return NextResponse.json({ workflows: active });
    }

    // ========================================================================
    // 6. ATTRIBUTION - GET
    // ========================================================================

    if (action === "attribution.campaign") {
      const data = await attribution.getAttributionByCampaign(searchParams.get("campaignId")!);
      return NextResponse.json({ attribution: data });
    }

    if (action === "attribution.roi") {
      const roi = await attribution.getRoiAnalysis(searchParams.get("campaignId")!);
      return NextResponse.json({ roi });
    }

    if (action === "attribution.multiTouch") {
      const analysis = await attribution.getMultiTouchAnalysis(searchParams.get("campaignId")!);
      return NextResponse.json({ analysis });
    }

    if (action === "attribution.channelMix") {
      const mix = await attribution.getChannelMixAnalysis(
        principal.tenantId,
        searchParams.get("period")!,
      );
      return NextResponse.json({ channelMix: mix });
    }

    if (action === "attribution.forecast") {
      const forecast = await attribution.forecastRevenue(
        principal.tenantId,
        parseInt(searchParams.get("daysAhead") || "30"),
        parseInt(searchParams.get("historicalDays") || "30"),
      );
      return NextResponse.json({ forecast });
    }

    throw AppError.validation(`Onbekende actie: ${action}`);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
