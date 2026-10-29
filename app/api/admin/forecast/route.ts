import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { prisma } from "@/lib/prisma";
import { forecastDemand } from "@/lib/forecast/demand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/forecast — vraag-vooruitblik voor de komende week op basis van
// de shift-historie van de afgelopen 8 weken (read-only).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const now = new Date();
  const since = new Date(now.getTime() - 8 * 7 * 86_400_000);

  const shifts = await prisma.shift.findMany({
    where: { startsAt: { gte: since, lte: now }, status: { not: "DRAFT" } },
    select: { startsAt: true, positions: true },
    take: 5000,
  });

  return NextResponse.json(forecastDemand(shifts, { from: now, windowWeeks: 8 }));
});
