import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { getMatchHistory, getPendingMatches, getMatchStats } from "@/lib/realtime/matching";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal();
    const view = req.nextUrl.searchParams.get("view") || "history";

    let data;

    if (view === "pending") {
      data = getPendingMatches(principal.userId);
    } else if (view === "stats") {
      data = getMatchStats(principal.userId);
    } else {
      data = getMatchHistory(principal.userId, 50);
    }

    return NextResponse.json({
      view,
      data,
    });
  } catch (err) {
    console.error("Matching fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch matching data" }, { status: 500 });
  }
}
