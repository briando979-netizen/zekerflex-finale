import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import * as availability from "@/lib/scheduling/availability";
import * as optimization from "@/lib/scheduling/optimization";
import * as conflicts from "@/lib/scheduling/conflict-prevention";
import * as preferences from "@/lib/scheduling/preferences";
import * as autoSchedule from "@/lib/scheduling/auto-schedule";
import * as analytics from "@/lib/scheduling/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const action = request.nextUrl.searchParams.get("action");

    if (action === "availability") {
      const avail = await availability.getAvailability(principal.userId);
      return NextResponse.json({ availability: avail });
    }

    if (action === "analytics") {
      const startDate = new Date(request.nextUrl.searchParams.get("start") || Date.now());
      const endDate = new Date(request.nextUrl.searchParams.get("end") || Date.now());
      const data = await analytics.getScheduleAnalytics(startDate, endDate);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { action, data } = body;

    if (action === "set-availability") {
      const result = await availability.setAvailability({ ...data, freelancerId: principal.userId });
      return NextResponse.json(result, { status: 201 });
    }

    if (action === "set-preferences") {
      const result = await preferences.setPreferences({ ...data, freelancerId: principal.userId });
      return NextResponse.json(result, { status: 201 });
    }

    if (action === "check-conflicts") {
      const result = await conflicts.detectOverlappingShifts(
        principal.userId,
        new Date(data.startTime),
        new Date(data.endTime)
      );
      return NextResponse.json(result);
    }

    if (action === "optimize-assignment") {
      const result = await optimization.optimizeAssignment(data);
      return NextResponse.json(result);
    }

    if (action === "suggest-assignments") {
      const result = await autoSchedule.suggestAssignments(data.shiftIds);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
