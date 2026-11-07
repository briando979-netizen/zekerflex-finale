import { NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkerSummary } from "@/lib/dashboard/worker-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const p = await getPrincipal();
    if (!p || !hasRole(p, "FREELANCER")) {
      return NextResponse.json({ error: "Niet ingelogd als flexwerker" }, { status: 401 });
    }

    // Get freelancer profile
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: p.userId },
      select: { id: true },
    });

    if (!freelancer) {
      return NextResponse.json({ error: "Profiel niet gevonden" }, { status: 404 });
    }

    const summary = await getWorkerSummary(freelancer.id);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
