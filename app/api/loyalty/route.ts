import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const points = await prisma.loyaltyPoints.findFirst({
      where: { userId: principal.userId },
    });

    if (!points) {
      return NextResponse.json({
        balance: 0,
        tier: "BRONZE",
        rewards: [],
      });
    }

    const tier = calculateTier(points.balance);
    const redeemableRewards = await getAvailableRewards(tier);

    return NextResponse.json({
      balance: points.balance,
      tier,
      rewards: redeemableRewards,
      history: await getPointsHistory(principal.userId),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { action, amount, rewardId } = await request.json();

    if (action === "redeem") {
      const points = await prisma.loyaltyPoints.findUnique({
        where: { userId: principal.userId },
      });

      if (!points || points.balance < amount) {
        throw AppError.validation("Insufficient points");
      }

      await prisma.loyaltyPoints.update({
        where: { userId: principal.userId },
        data: { balance: points.balance - amount },
      });

      await prisma.redemption.create({
        data: {
          userId: principal.userId,
          rewardId,
          pointsUsed: amount,
          status: "COMPLETED",
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

function calculateTier(points: number): string {
  if (points >= 10000) return "PLATINUM";
  if (points >= 5000) return "GOLD";
  if (points >= 1000) return "SILVER";
  return "BRONZE";
}

async function getAvailableRewards(tier: string) {
  const rewards: Record<string, any[]> = {
    BRONZE: [
      { id: 1, name: "5% discount", points: 100 },
      { id: 2, name: "Free booking", points: 500 },
    ],
    SILVER: [
      { id: 1, name: "5% discount", points: 100 },
      { id: 2, name: "Free booking", points: 500 },
      { id: 3, name: "Premium access month", points: 1000 },
    ],
    GOLD: [
      { id: 3, name: "Premium access month", points: 1000 },
      { id: 4, name: "Personal manager session", points: 2000 },
      { id: 5, name: "20% discount package", points: 3000 },
    ],
    PLATINUM: [
      { id: 4, name: "Personal manager session", points: 2000 },
      { id: 5, name: "20% discount package", points: 3000 },
      { id: 6, name: "VIP event access", points: 5000 },
    ],
  };

  return rewards[tier] || rewards.BRONZE;
}

async function getPointsHistory(userId: string) {
  const transactions = await prisma.loyaltyTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return transactions.map((t) => ({
    type: t.type,
    points: t.points,
    reason: t.reason,
    date: t.createdAt,
  }));
}
