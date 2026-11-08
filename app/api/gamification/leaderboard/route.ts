import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const category = request.nextUrl.searchParams.get("category") || "earnings";

    let leaderboard: any[] = [];

    if (category === "earnings") {
      leaderboard = await getEarningsLeaderboard();
    } else if (category === "bookings") {
      leaderboard = await getBookingsLeaderboard();
    } else if (category === "ratings") {
      leaderboard = await getRatingsLeaderboard();
    }

    return NextResponse.json({ leaderboard, category });
  } catch (err) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

async function getEarningsLeaderboard() {
  return [{ rank: 1, earnings: 5000 }];
}

async function getBookingsLeaderboard() {
  return [{ rank: 1, bookings: 250 }];
}

async function getRatingsLeaderboard() {
  return [{ rank: 1, rating: 4.9 }];
}
