import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShiftRecommendations, getPersonalizedMatches } from "@/lib/matching/recommendations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p || !hasRole(p, "FREELANCER")) {
      return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    }

    const type = request.nextUrl.searchParams.get("type") || "recommended";
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "10"), 50);

    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: p.userId },
      select: { id: true },
    });

    if (!freelancer) {
      return NextResponse.json({ error: "Profiel niet gevonden" }, { status: 404 });
    }

    let results;

    if (type === "personalized") {
      results = await getPersonalizedMatches(freelancer.id);
    } else {
      const recommendations = await getShiftRecommendations(freelancer.id, limit);
      results = { matches: recommendations, reason: "Gebaseerd op jouw skills en werkgeschiedenis" };
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
