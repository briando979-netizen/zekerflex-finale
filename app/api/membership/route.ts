import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const membershipSchema = z.object({
  type: z.enum(["BASIC", "PREMIUM", "ELITE"]),
  monthlyBudget: z.number().positive().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const membership = await prisma.membership.findFirst({
      where: { userId: principal.userId, active: true },
    });

    if (!membership) {
      return NextResponse.json({
        membership: null,
        benefits: [],
      });
    }

    const benefits = getBenefitsForTier(membership.type);

    return NextResponse.json({
      membership: {
        type: membership.type,
        startDate: membership.startDate,
        renewalDate: membership.renewalDate,
        benefits,
      },
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
    const { type } = membershipSchema.parse(body);

    const membership = await prisma.membership.create({
      data: {
        userId: principal.userId,
        type,
        startDate: new Date(),
        renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        active: true,
      },
    });

    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

function getBenefitsForTier(tier: string): string[] {
  const benefits: Record<string, string[]> = {
    BASIC: [
      "Access to all listings",
      "Basic profile",
      "Up to 5 applications per week",
    ],
    PREMIUM: [
      "Everything in BASIC",
      "Unlimited applications",
      "Premium badge",
      "Priority support",
      "10% discount on services",
    ],
    ELITE: [
      "Everything in PREMIUM",
      "Dedicated account manager",
      "Early access to new features",
      "20% discount on services",
      "VIP events access",
    ],
  };

  return benefits[tier] || benefits.BASIC;
}
