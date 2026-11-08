import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    // Get referral data (placeholder implementation)
    return NextResponse.json({
      referralCode: `REF-${freelancer.id.slice(0, 8).toUpperCase()}`,
      referralLink: `https://zekerflex.nl/join?ref=${freelancer.id}`,
      stats: {
        referralsUsed: 0,
        successfulReferrals: 0,
        totalEarningsFromReferrals: 0,
      },
      rewardTiers: [
        { referrals: 1, bonus: "€15" },
        { referrals: 5, bonus: "€100" },
        { referrals: 10, bonus: "€300" },
        { referrals: 25, bonus: "€1000" },
      ],
      nextMilestone: {
        target: 1,
        current: 0,
        reward: "€15 bonus",
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
    const { referredEmail } = body as { referredEmail: string };

    if (!referredEmail || !referredEmail.includes("@")) {
      throw AppError.validation("Invalid email");
    }

    // Log referral invitation
    // In production, would send invitation email
    return NextResponse.json({
      message: "Referral invitation sent",
      email: referredEmail,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
