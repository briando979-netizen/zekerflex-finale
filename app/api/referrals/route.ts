import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const referrals = await prisma.referral.findMany({
      where: { referrerId: principal.userId },
      include: { referredUser: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const bonusTotal = referrals.reduce((sum, r) => sum + (r.bonusAmountCents || 0), 0);

    return NextResponse.json({
      referrals: referrals.map((r) => ({
        id: r.id,
        referredEmail: r.referredUser?.email,
        referredName: r.referredUser?.name,
        status: r.status,
        bonusAmount: Math.round((r.bonusAmountCents || 0) / 100),
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      })),
      stats: {
        totalReferrals: referrals.length,
        successfulReferrals: referrals.filter((r) => r.status === "COMPLETED").length,
        totalBonus: Math.round(bonusTotal / 100),
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
    const { referredEmail } = body;

    if (!referredEmail) {
      throw AppError.validation("Email required");
    }

    let referredUser = await prisma.user.findUnique({
      where: { email: referredEmail },
    });

    if (!referredUser) {
      referredUser = await prisma.user.create({
        data: { email: referredEmail, name: referredEmail.split("@")[0] },
      });
    }

    const referral = await prisma.referral.create({
      data: {
        referrerId: principal.userId,
        referredUserId: referredUser.id,
        status: "PENDING",
      },
    });

    return NextResponse.json({ referral }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
