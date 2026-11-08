import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getDashboardMetrics, getSalesMetrics, getConversionMetrics, getProductPerformance, getRefundMetrics } from "@/lib/ecommerce";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  metric: z.enum(["dashboard", "sales", "conversion", "products", "refunds"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requirePrincipal();

    const url = new URL(request.url);
    const query = querySchema.parse({
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
      metric: url.searchParams.get("metric") || undefined,
    });

    const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    let data;

    if (query.metric === "sales") {
      data = await getSalesMetrics(startDate, endDate);
    } else if (query.metric === "conversion") {
      data = await getConversionMetrics(startDate, endDate);
    } else if (query.metric === "products") {
      data = await getProductPerformance(10);
    } else if (query.metric === "refunds") {
      data = await getRefundMetrics(startDate, endDate);
    } else {
      data = await getDashboardMetrics(startDate, endDate);
    }

    return NextResponse.json({ data });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
