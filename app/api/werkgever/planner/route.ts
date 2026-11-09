import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { enforceRateLimit } from "@/lib/rate-limit";
import { berekenVoorstel, leesDrukte, leesInstellingen, leesVoorstel } from "@/lib/planner/plan";
import { planWeek, weekSleutelVan } from "@/lib/planner/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function context() {
  const principal = await requirePrincipal();
  requireRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN");
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
  return { principal, scope, tenantId };
}

function weekUit(raw: string | null | undefined): string {
  const w = raw ? planWeek(raw) : null;
  return w ? w.sleutel : weekSleutelVan(new Date());
}

// GET /api/werkgever/planner?week=2026-W46 — het laatste voorstel voor die week
// en de verwachte drukte (gemiddelde uit de eigen diensten van de weken ervoor).
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, scope } = await context();
    const week = weekUit(new URL(request.url).searchParams.get("week"));
    const [voorstel, drukte] = await Promise.all([leesVoorstel(tenantId, week), leesDrukte(scope, week)]);
    return NextResponse.json({ week, voorstel, drukte });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/werkgever/planner { week, instellingen } — rooster (opnieuw) uitrekenen.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { principal, scope, tenantId } = await context();
    await enforceRateLimit({ name: "planner", identifier: tenantId, limit: 30, windowSeconds: 600 });
    const body = (await request.json().catch(() => ({}))) as { week?: unknown; instellingen?: unknown };
    const week = weekUit(typeof body.week === "string" ? body.week : null);
    const voorstel = await berekenVoorstel({ tenantId, scope, week, instellingen: leesInstellingen(body.instellingen), door: principal.userId });
    return NextResponse.json({ week, voorstel });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
