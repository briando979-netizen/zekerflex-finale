import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { calculateKPIs, suggestUpsell, analyzeCohorts } from "@/lib/analytics/insights";
import { z } from "zod";

export const dynamic = "force-dynamic";

const analyticsQuerySchema = z.object({
  period: z.enum(["day", "week", "month", "quarter", "year"]).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { period = "month" } = analyticsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const subscription = await prisma.subscription.findFirst({
      where: { userId: principal.userId },
    });

    if (!subscription) {
      throw AppError.notFound("No subscription found");
    }

    const metrics = await prisma.metric.findMany({
      where: {
        userId: principal.userId,
        timestamp: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { timestamp: "desc" },
      take: 1000,
    });

    const kpis = calculateKPIs(metrics as any);

    const upsellSuggestion = suggestUpsell(subscription.tier, {
      apiCalls: metrics.filter((m) => m.name === "api_calls").length,
      teamMembers: 5,
    });

    const cohorts = await analyzeCohorts(principal.userId);

    return NextResponse.json({
      period,
      kpis,
      metrics: metrics.slice(0, 100),
      upsellSuggestion,
      cohorts,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
