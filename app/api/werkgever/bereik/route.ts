import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { haversineMeters } from "@/lib/geo/geofencing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Zo ver reist een werker doorgaans nog voor een klus; past bij maxTravelMinutes 60 in de matching. */
export const BEREIK_METERS = 40_000;

// GET /api/werkgever/bereik?branchId=… — "Deze klus bereikt ±N werkers" (naar YoungOnes) vóór het plaatsen: het aantal
// geverifieerde, niet geblokkeerde werkers dat binnen 40 km van de vestiging woont. Alleen een getal, nooit wie.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const branchId = z.string().min(1).max(128).parse(new URL(request.url).searchParams.get("branchId") ?? "");
    const scope = await resolveEmployerScope(principal);
    const scopeWhere = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
    const branch = await prisma.branch.findFirst({ where: { AND: [{ id: branchId }, scopeWhere] }, select: { latitude: true, longitude: true } });
    if (!branch) throw AppError.forbidden("Je hebt geen toegang tot deze vestiging.");
    const werkers = await prisma.freelancerProfile.findMany({
      where: { isBlacklisted: false, user: { kycStatus: "VERIFIED" } },
      select: { homeLatitude: true, homeLongitude: true },
    });
    const bereik = werkers.filter((w) => Number.isFinite(w.homeLatitude) && haversineMeters({ latitude: w.homeLatitude, longitude: w.homeLongitude }, branch) <= BEREIK_METERS).length;
    return NextResponse.json({ bereik });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
