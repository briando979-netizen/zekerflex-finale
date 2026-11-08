import { NextRequest, NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { submitNps, getNpsStats, getNpsTrend, getDetractorComments } from "@/lib/nps/tracker";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { tenantId, score, email, userId, comment } = body;

    if (!tenantId || score === undefined) {
      throw AppError.validation("tenantId and score required");
    }

    const nps = await submitNps(tenantId, {
      score,
      email,
      userId,
      comment,
    });

    return NextResponse.json({ nps }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const view = request.nextUrl.searchParams.get("view");

    if (!tenantId) {
      throw AppError.validation("tenantId required");
    }

    let data;

    if (view === "trend") {
      const days = Number(request.nextUrl.searchParams.get("days") || "30");
      data = await getNpsTrend(tenantId, days);
    } else if (view === "detractors") {
      const limit = Number(request.nextUrl.searchParams.get("limit") || "10");
      data = await getDetractorComments(tenantId, limit);
    } else {
      data = await getNpsStats(tenantId);
    }

    return NextResponse.json({ data });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
