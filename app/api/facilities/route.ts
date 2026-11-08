import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import * as spaceManagement from "@/lib/facilities/space-management";
import * as maintenance from "@/lib/facilities/maintenance";
import * as workplaceExperience from "@/lib/facilities/workplace-experience";
import * as energyManagement from "@/lib/facilities/energy-management";
import * as assetManagement from "@/lib/facilities/asset-management";
import * as analytics from "@/lib/facilities/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "dashboard";

    if (type === "utilization") {
      const report = await analytics.getUtilizationReport(30);
      return NextResponse.json({ utilization: report });
    }

    if (type === "costs") {
      const costs = await analytics.getCostAnalysis(30);
      return NextResponse.json({ costs });
    }

    if (type === "health") {
      const health = await analytics.getFacilityHealthScore();
      return NextResponse.json({ health });
    }

    if (type === "optimization") {
      const optimization = await analytics.getSpaceOptimizationAnalytics();
      return NextResponse.json({ optimization });
    }

    throw AppError.validation("Invalid type parameter");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole("PLATFORM_ADMIN");
    const body = await request.json();
    const { action } = body;

    if (action === "create_space") {
      const space = await spaceManagement.createSpace(body.data);
      return NextResponse.json({ space }, { status: 201 });
    }

    if (action === "book_space") {
      const booking = await spaceManagement.bookSpace(
        body.spaceId,
        new Date(body.startTime),
        new Date(body.endTime),
        body.bookedBy
      );
      return NextResponse.json({ booking }, { status: 201 });
    }

    if (action === "create_maintenance") {
      const task = await maintenance.createMaintenanceTask(body.data);
      return NextResponse.json({ task }, { status: 201 });
    }

    if (action === "submit_feedback") {
      const feedback = await workplaceExperience.submitWorkplaceFeedback(body.data);
      return NextResponse.json({ feedback }, { status: 201 });
    }

    if (action === "record_energy") {
      const record = await energyManagement.recordEnergyConsumption(body.spaceId, body.consumption);
      return NextResponse.json({ record }, { status: 201 });
    }

    if (action === "register_asset") {
      const asset = await assetManagement.registerAsset(body.data);
      return NextResponse.json({ asset }, { status: 201 });
    }

    throw AppError.validation("Invalid action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
