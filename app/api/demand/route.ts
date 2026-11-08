import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { predictDemandByDate, getDemandTrend } from "@/lib/demand/prediction";
import { recommendShifts, suggestOptimalShiftTiming } from "@/lib/demand/shift-recommendation";
import { forecastWorkerAvailability } from "@/lib/demand/availability-forecast";
import { calculateSurgePricing } from "@/lib/demand/surge-pricing";
import { optimizeShiftAssignments, autoScheduleOptimal } from "@/lib/demand/optimization";
import { planCapacity, getCapacityGaps, suggestStaffingActions } from "@/lib/demand/capacity-planning";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const action = request.nextUrl.searchParams.get("action") || "predict";
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const dateStr = request.nextUrl.searchParams.get("date");

    if (!tenantId || !dateStr) {
      throw AppError.validation("tenantId and date required");
    }

    const date = new Date(dateStr);

    if (action === "predict") {
      const forecasts = await predictDemandByDate(date, tenantId);
      return NextResponse.json({ forecasts });
    }

    if (action === "trend") {
      const days = parseInt(request.nextUrl.searchParams.get("days") || "30");
      const trend = await getDemandTrend(tenantId, days);
      return NextResponse.json({ trend });
    }

    if (action === "recommend") {
      const basePrice = parseInt(request.nextUrl.searchParams.get("basePrice") || "1500");
      const recommendations = await recommendShifts(tenantId, date, basePrice);
      return NextResponse.json({ recommendations });
    }

    if (action === "timing") {
      const timing = await suggestOptimalShiftTiming(tenantId);
      return NextResponse.json({ timing });
    }

    if (action === "capacity") {
      const plan = await planCapacity(tenantId, date);
      return NextResponse.json({ plan });
    }

    if (action === "gaps") {
      const days = parseInt(request.nextUrl.searchParams.get("days") || "7");
      const gaps = await getCapacityGaps(tenantId, days);
      return NextResponse.json({ gaps });
    }

    if (action === "actions") {
      const actions = await suggestStaffingActions(tenantId, date);
      return NextResponse.json({ actions });
    }

    throw AppError.validation(`Unknown action: ${action}`);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action, tenantId, shiftId, hour, basePrice, requiredSkills } = z
      .object({
        action: z.enum(["availability", "surge", "optimize", "auto-schedule"]),
        tenantId: z.string(),
        shiftId: z.string().optional(),
        hour: z.number().optional(),
        basePrice: z.number().optional(),
        requiredSkills: z.array(z.string()).optional(),
      })
      .parse(body);

    if (action === "availability") {
      const forecasts = await forecastWorkerAvailability(tenantId, new Date(), requiredSkills || []);
      return NextResponse.json({ forecasts });
    }

    if (action === "surge") {
      if (!hour || !basePrice) throw AppError.validation("hour and basePrice required");
      const pricing = await calculateSurgePricing(tenantId, new Date(), hour, basePrice);
      return NextResponse.json({ pricing });
    }

    if (action === "optimize") {
      if (!shiftId) throw AppError.validation("shiftId required");
      const assignments = await optimizeShiftAssignments(tenantId, shiftId, 10);
      return NextResponse.json({ assignments });
    }

    if (action === "auto-schedule") {
      if (!shiftId) throw AppError.validation("shiftId required");
      const result = await autoScheduleOptimal(tenantId, shiftId);
      return NextResponse.json({ result });
    }

    throw AppError.validation(`Unknown action: ${action}`);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
