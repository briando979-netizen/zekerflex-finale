import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { planRoute } from "@/lib/geo/route";
import { binnenRouteGebied, isRouteModus } from "@/lib/geo/route-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/klus-route?klus=<shiftId>&modus=auto|fiets|lopen
 *
 * De route van je eigen thuisbasis naar een klus, voor de kaart op de kluspagina
 * (components/app/KlusRoute.tsx). Alleen voor jezelf: de thuisbasis lezen we hier
 * uit je profiel, hij staat dus nooit in een adresregel of bij iemand anders.
 * Geen thuisbasis, buiten Nederland, of de routeplanner is er even niet:
 * { route: null }, en de pagina houdt de schatting die er al stond.
 * → { route: { meters, seconds, lijn } | null }
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const url = new URL(request.url);
    const klusId = (url.searchParams.get("klus") ?? "").trim().slice(0, 64);
    const modus = url.searchParams.get("modus") ?? "auto";
    if (!klusId || !isRouteModus(modus)) throw AppError.validation("Kies een klus en auto, fiets of lopen.");
    await enforceRateLimit({ name: "klus-route", identifier: principal.userId, limit: 60, windowSeconds: 600 });

    const [profiel, klus] = await Promise.all([
      prisma.freelancerProfile.findUnique({ where: { userId: principal.userId }, select: { homeLatitude: true, homeLongitude: true } }),
      prisma.shift.findUnique({ where: { id: klusId }, select: { branch: { select: { latitude: true, longitude: true } } } }),
    ]);
    const thuis = profiel ? { lat: profiel.homeLatitude, lon: profiel.homeLongitude } : null;
    const werk = klus ? { lat: klus.branch.latitude, lon: klus.branch.longitude } : null;
    const geenCache = { "Cache-Control": "private, no-store" };
    if (!thuis || !werk || !binnenRouteGebied(thuis) || !binnenRouteGebied(werk)) {
      return NextResponse.json({ route: null }, { headers: geenCache });
    }

    const route = await planRoute(thuis, werk, modus, { stappen: false });
    return NextResponse.json(
      { route: route ? { meters: route.meters, seconds: route.seconds, lijn: route.lijn } : null },
      { headers: geenCache },
    );
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
