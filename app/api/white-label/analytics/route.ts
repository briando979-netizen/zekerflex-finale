import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import * as analytics from "@/lib/white-label/analytics";

/**
 * White-Label Tenant Analytics API
 *
 * GET /api/white-label/analytics?tenantId=xxx&startDate=2024-01-01&endDate=2024-01-31
 *   - Get analytics for date range
 *
 * GET /api/white-label/analytics/metrics?tenantId=xxx
 *   - Get current metrics (MRR, health score, etc.)
 *
 * POST /api/white-label/analytics/track
 *   - Track API call or feature usage
 */

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const trackingSchema = z.object({
  tenantId: z.string().min(1),
  type: z.enum(["api_call", "feature_usage"]),
  featureName: z.string().optional(),
  count: z.number().int().nonnegative().optional().default(1),
});

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    const metric = request.nextUrl.searchParams.get("metric");
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId parameter vereist" },
        { status: 400 }
      );
    }

    // Get specific metric
    if (metric === "mrr") {
      const mrr = await analytics.calculateMrr(tenantId);
      return NextResponse.json({ data: { mrr } });
    }

    if (metric === "health-score") {
      const healthScore = await analytics.calculateTenantHealthScore(tenantId);
      return NextResponse.json({ data: { healthScore } });
    }

    if (metric === "top-features") {
      const limit = request.nextUrl.searchParams.get("limit");
      const features = await analytics.getTopFeaturesUsed(
        tenantId,
        limit ? parseInt(limit, 10) : 10
      );

      return NextResponse.json({ data: { features } });
    }

    if (metric === "error-rate") {
      const errorRate = await analytics.getErrorRate(tenantId);
      return NextResponse.json({ data: { errorRate } });
    }

    if (metric === "avg-response-time") {
      const avgResponseTime = await analytics.getAverageResponseTime(tenantId);
      return NextResponse.json({ data: { avgResponseTime } });
    }

    // Default: get analytics for date range
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate parameters vereist" },
        { status: 400 }
      );
    }

    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: "Datum moet YYYY-MM-DD formaat zijn" },
        { status: 400 }
      );
    }

    const data = await analytics.getTenantAnalytics(tenantId, startDate, endDate);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = trackingSchema.parse(body);

    if (validated.type === "api_call") {
      await analytics.trackApiCall(validated.tenantId);
      return NextResponse.json({ data: { tracked: true } });
    }

    if (validated.type === "feature_usage") {
      if (!validated.featureName) {
        return NextResponse.json(
          { error: "featureName vereist voor feature_usage" },
          { status: 400 }
        );
      }

      await analytics.trackFeatureUsage(
        validated.tenantId,
        validated.featureName,
        validated.count
      );

      return NextResponse.json({ data: { tracked: true } });
    }

    return NextResponse.json(
      { error: "Ongeldig tracking type" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validatiefout", details: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: "Interne serverfout" },
      { status: 500 }
    );
  }
}
