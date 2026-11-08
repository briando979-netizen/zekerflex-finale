import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getActivityFeed, aggregateActivity, getTeamActivity } from "@/lib/realtime/activity";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const view = req.nextUrl.searchParams.get("view") || "personal";
    const teamId = req.nextUrl.searchParams.get("teamId");

    let data;

    if (view === "team" && teamId) {
      data = getTeamActivity(teamId, 100);
    } else if (view === "aggregated") {
      const feed = getActivityFeed(principal.userId, 100);
      data = aggregateActivity(feed, 3600000); // 1 hour window
    } else {
      data = getActivityFeed(principal.userId, 50);
    }

    return NextResponse.json({
      view,
      data,
    });
  } catch (err) {
    console.error("Activity fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  }
}
