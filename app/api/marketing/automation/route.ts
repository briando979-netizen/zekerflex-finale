import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import * as emailCampaigns from "@/lib/marketing/email-campaigns";
import * as segmentation from "@/lib/marketing/segmentation";
import * as automationWorkflows from "@/lib/marketing/automation-workflows";
import * as abTesting from "@/lib/marketing/ab-testing";
import * as campaignAnalytics from "@/lib/marketing/campaign-analytics";
import * as integrations from "@/lib/marketing/integrations";

// GET /api/marketing/automation
// Haal alle automationen op
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Niet geverifieerd" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const tenantId = searchParams.get("tenantId");
    const campaignId = searchParams.get("campaignId");

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId vereist" },
        { status: 400 }
      );
    }

    switch (action) {
      case "campaigns":
        const campaigns = await emailCampaigns.getCampaigns(tenantId, {
          includeMetrics: true,
        });
        return NextResponse.json(campaigns);

      case "segments":
        const segments = await segmentation.getSegments(tenantId);
        return NextResponse.json(segments);

      case "workflows":
        const workflows = await automationWorkflows.getAutomationWorkflows(tenantId);
        return NextResponse.json(workflows);

      case "ab-tests":
        const tests = await abTesting.getABTests(tenantId, campaignId ?? undefined);
        return NextResponse.json(tests);

      case "campaign-metrics":
        if (!campaignId) {
          return NextResponse.json(
            { error: "campaignId vereist" },
            { status: 400 }
          );
        }
        const metrics = await campaignAnalytics.getCampaignMetrics(campaignId);
        return NextResponse.json(metrics);

      case "tenant-metrics":
        const tenantMetrics = await campaignAnalytics.getTenantCampaignMetrics(tenantId);
        return NextResponse.json(tenantMetrics);

      case "top-leads":
        const leads = await integrations.getTopLeads(tenantId, campaignId ?? undefined);
        return NextResponse.json(leads);

      default:
        return NextResponse.json(
          { error: "Onbekende actie" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Marketing API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof AppError ? error.message : "Server fout",
      },
      { status: error instanceof AppError ? 400 : 500 }
    );
  }
}

// POST /api/marketing/automation
// Maak campagne/segment/workflow aan
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Niet geverifieerd" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, tenantId, ...data } = body;

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId vereist" },
        { status: 400 }
      );
    }

    switch (action) {
      case "create-campaign":
        const campaign = await emailCampaigns.createCampaign(tenantId, data);
        return NextResponse.json(campaign, { status: 201 });

      case "create-segment":
        const segment = await segmentation.createSegment(tenantId, data);
        return NextResponse.json(segment, { status: 201 });

      case "create-workflow":
        const workflow = await automationWorkflows.createAutomationWorkflow(
          tenantId,
          data
        );
        return NextResponse.json(workflow, { status: 201 });

      case "create-ab-test":
        const test = await abTesting.createABTest(tenantId, data);
        return NextResponse.json(test, { status: 201 });

      case "schedule-campaign":
        const scheduled = await emailCampaigns.scheduleCampaign(
          tenantId,
          data.campaignId,
          new Date(data.scheduledAt)
        );
        return NextResponse.json(scheduled);

      case "start-ab-test":
        const startedTest = await abTesting.startABTest(
          tenantId,
          data.testId
        );
        return NextResponse.json(startedTest);

      case "track-open":
        await campaignAnalytics.trackEmailOpen(
          data.campaignId,
          data.subscriberId
        );
        return NextResponse.json({ tracked: true });

      case "track-click":
        await campaignAnalytics.trackEmailClick(
          data.campaignId,
          data.subscriberId,
          data.linkUrl
        );
        return NextResponse.json({ tracked: true });

      case "track-conversion":
        await campaignAnalytics.trackEmailConversion(
          data.campaignId,
          data.subscriberId,
          data.value
        );
        return NextResponse.json({ tracked: true });

      default:
        return NextResponse.json(
          { error: "Onbekende actie" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Marketing API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof AppError ? error.message : "Server fout",
      },
      { status: error instanceof AppError ? 400 : 500 }
    );
  }
}

// PUT /api/marketing/automation
// Werk campagne/segment/workflow bij
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Niet geverifieerd" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, tenantId, id, ...data } = body;

    if (!tenantId || !id) {
      return NextResponse.json(
        { error: "tenantId en id vereist" },
        { status: 400 }
      );
    }

    switch (action) {
      case "update-campaign":
        const campaign = await emailCampaigns.updateCampaign(
          tenantId,
          id,
          data
        );
        return NextResponse.json(campaign);

      case "update-segment":
        const segment = await segmentation.updateSegment(
          tenantId,
          id,
          data
        );
        return NextResponse.json(segment);

      case "update-workflow":
        const workflow = await automationWorkflows.updateAutomationWorkflow(
          tenantId,
          id,
          data
        );
        return NextResponse.json(workflow);

      case "pause-campaign":
        const paused = await emailCampaigns.updateCampaignStatus(
          tenantId,
          id,
          "PAUSED"
        );
        return NextResponse.json(paused);

      case "resume-campaign":
        const resumed = await emailCampaigns.resumeCampaign(tenantId, id);
        return NextResponse.json(resumed);

      case "complete-ab-test":
        const completed = await abTesting.determineWinner(tenantId, id);
        return NextResponse.json(completed);

      case "toggle-workflow":
        const toggled = await automationWorkflows.toggleAutomationWorkflow(
          tenantId,
          id
        );
        return NextResponse.json(toggled);

      default:
        return NextResponse.json(
          { error: "Onbekende actie" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Marketing API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof AppError ? error.message : "Server fout",
      },
      { status: error instanceof AppError ? 400 : 500 }
    );
  }
}

// DELETE /api/marketing/automation
// Verwijder campagne/segment/workflow
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Niet geverifieerd" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const tenantId = searchParams.get("tenantId");
    const id = searchParams.get("id");

    if (!tenantId || !id) {
      return NextResponse.json(
        { error: "tenantId en id vereist" },
        { status: 400 }
      );
    }

    switch (action) {
      case "delete-campaign":
        await emailCampaigns.deleteCampaign(tenantId, id);
        return NextResponse.json({ deleted: true });

      case "delete-segment":
        await segmentation.deleteSegment(tenantId, id);
        return NextResponse.json({ deleted: true });

      case "delete-workflow":
        await automationWorkflows.deleteAutomationWorkflow(tenantId, id);
        return NextResponse.json({ deleted: true });

      case "delete-ab-test":
        await abTesting.deleteABTest(tenantId, id);
        return NextResponse.json({ deleted: true });

      default:
        return NextResponse.json(
          { error: "Onbekende actie" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Marketing API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof AppError ? error.message : "Server fout",
      },
      { status: error instanceof AppError ? 400 : 500 }
    );
  }
}
