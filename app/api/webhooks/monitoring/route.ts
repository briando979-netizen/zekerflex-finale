import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    // Overall webhook health for the tenant
    const webhooks = await prisma.webhookSubscription.findMany({
      where: { tenantId: principal.tenantId },
      select: { id: true },
    });

    const webhookIds = webhooks.map((w) => w.id);

    // Get aggregated stats
    const stats = await prisma.webhookDelivery.groupBy({
      by: ["subscriptionId"],
      where: { subscriptionId: { in: webhookIds } },
      _count: true,
      _sum: { statusCode: true },
    });

    const successful = await prisma.webhookDelivery.count({
      where: {
        subscriptionId: { in: webhookIds },
        deliveredAt: { not: null },
      },
    });

    const failed = await prisma.webhookDelivery.count({
      where: {
        subscriptionId: { in: webhookIds },
        deliveredAt: null,
        nextAttemptAt: null,
      },
    });

    const pending = await prisma.webhookDelivery.count({
      where: {
        subscriptionId: { in: webhookIds },
        deliveredAt: null,
        nextAttemptAt: { not: null },
      },
    });

    const total = successful + failed + pending;

    // Get latency stats (avg delivery time)
    const latencyData = await prisma.webhookDelivery.findMany({
      where: {
        subscriptionId: { in: webhookIds },
        deliveredAt: { not: null },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { createdAt: true, deliveredAt: true },
      take: 100,
    });

    const avgLatency =
      latencyData.length > 0
        ? latencyData.reduce((sum, d) => {
            return sum + (d.deliveredAt!.getTime() - d.createdAt.getTime());
          }, 0) / latencyData.length
        : 0;

    return NextResponse.json({
      health: {
        totalWebhooks: webhookIds.length,
        totalDeliveries: total,
        successfulDeliveries: successful,
        failedDeliveries: failed,
        pendingDeliveries: pending,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
        avgLatencyMs: Math.round(avgLatency),
      },
      errors: failed > 0,
      alerts:
        failed > 10
          ? ["High number of failed deliveries"]
          : failed > 5
            ? ["Some deliveries failing"]
            : [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
