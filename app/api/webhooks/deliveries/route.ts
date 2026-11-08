import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWebhookStats, getDeliveryDetails } from "@/lib/webhooks/manager";
import { replayEvent } from "@/lib/webhooks/delivery";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const webhookId = request.nextUrl.searchParams.get("webhookId");
    const deliveryId = request.nextUrl.searchParams.get("deliveryId");

    if (deliveryId) {
      const delivery = await getDeliveryDetails(deliveryId);
      return NextResponse.json({ delivery });
    }

    if (!webhookId) throw AppError.validation("webhookId required");

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { subscriptionId: webhookId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        eventType: true,
        statusCode: true,
        attempts: true,
        deliveredAt: true,
        lastError: true,
        createdAt: true,
      },
    });

    const stats = await getWebhookStats(webhookId);

    return NextResponse.json({ deliveries, stats });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const action = request.nextUrl.searchParams.get("action");

    if (action === "replay") {
      const { deliveryId } = await request.json();
      if (!deliveryId) throw AppError.validation("deliveryId required");

      await replayEvent(deliveryId);
      return NextResponse.json({ success: true });
    }

    throw AppError.validation("Unknown action");
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
