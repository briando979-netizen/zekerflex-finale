import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/webhooks — visibility into the B2B webhook subscriptions
// partners register via POST /api/public/v1/webhooks, and whether deliveries
// actually land. Before this, dispatchWebhook() had no admin UI at all: a
// delivery could fail silently forever with nobody able to tell.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const subscriptions = await prisma.webhookSubscription.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      url: true,
      eventTypes: true,
      active: true,
      createdAt: true,
      tenant: { select: { id: true, name: true } },
    },
  });

  const deliveries = await prisma.webhookDelivery.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      subscriptionId: true,
      eventType: true,
      statusCode: true,
      attempts: true,
      deliveredAt: true,
      nextAttemptAt: true,
      lastError: true,
      createdAt: true,
      subscription: { select: { url: true, tenant: { select: { name: true } } } },
    },
  });

  return NextResponse.json({ subscriptions, deliveries });
});
