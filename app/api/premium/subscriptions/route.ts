import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { getTierConfig } from "@/lib/premium/tiers";
import { createSubscription } from "@/lib/payments/advanced";
import { z } from "zod";

export const dynamic = "force-dynamic";

const subscriptionRequestSchema = z.object({
  tier: z.enum(["pro", "business", "enterprise"]),
  billingPeriod: z.enum(["monthly", "yearly"]).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const subscription = await prisma.subscription.findFirst({
      where: { userId: principal.userId },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) {
      return NextResponse.json({ tier: "free", active: false });
    }

    return NextResponse.json({
      tier: subscription.tier,
      status: subscription.status,
      active: subscription.status === "active",
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();
    const { tier, billingPeriod = "monthly" } = subscriptionRequestSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
    });

    if (!user || !user.email) {
      throw AppError.validation("User email not found");
    }

    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await createSubscription(stripeCustomerId || "", `${tier}_${billingPeriod}`);
      if (customer.latest_invoice && typeof customer.latest_invoice !== "string") {
        const paymentIntent = customer.latest_invoice.payment_intent;
        if (paymentIntent && typeof paymentIntent === "string") {
          return NextResponse.json(
            {
              clientSecret: paymentIntent,
              message: "Payment required",
            },
            { status: 402 },
          );
        }
      }
    }

    const tierConfig = getTierConfig(tier);

    const subscription = await prisma.subscription.upsert({
      where: { userId: principal.userId },
      update: {
        tier,
        status: "active",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      create: {
        userId: principal.userId,
        tier,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      subscription,
      features: tierConfig.features,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
