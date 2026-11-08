import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const period = request.nextUrl.searchParams.get("period") || "monthly";
    const type = request.nextUrl.searchParams.get("type") || "earnings";

    let startDate = new Date();
    if (period === "weekly") startDate.setDate(startDate.getDate() - 7);
    else if (period === "monthly") startDate.setDate(startDate.getDate() - 30);
    else if (period === "yearly") startDate.setFullYear(startDate.getFullYear() - 1);

    let leaderboard = [];

    if (type === "earnings") {
      // Top earners
      leaderboard = await prisma.shiftAssignment.groupBy({
        by: ["freelancerId"],
        where: { status: "COMPLETED", completedAt: { gte: startDate } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      });
    } else if (type === "shifts") {
      // Most shifts completed
      leaderboard = await prisma.shiftAssignment.groupBy({
        by: ["freelancerId"],
        where: { status: "COMPLETED", completedAt: { gte: startDate } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      });
    } else if (type === "rating") {
      // Highest rated
      const topRated = await prisma.review.groupBy({
        by: ["subjectId"],
        where: { createdAt: { gte: startDate } },
        _avg: { rating: true },
        _count: { id: true },
        orderBy: { _avg: { rating: "desc" } },
        take: 10,
      });
      leaderboard = topRated;
    }

    return NextResponse.json({
      leaderboard,
      period,
      type,
      metadata: {
        generated: new Date().toISOString(),
        since: startDate.toISOString(),
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
