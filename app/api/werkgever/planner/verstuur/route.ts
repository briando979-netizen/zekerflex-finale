import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { eisBedrijfGecontroleerd } from "@/lib/company/verified";
import { verstuurVoorstel } from "@/lib/planner/plan";
import { planWeek } from "@/lib/planner/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  week: z.string().trim(),
  keuze: z.array(z.object({ dienstId: z.string().min(1), krachtId: z.string().min(1) })).max(500).optional(),
});

// POST /api/werkgever/planner/verstuur — van het voorstel echte aanbiedingen maken.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN");
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
    // een bedrijf dat nog niet is gecontroleerd mag geen krachten inplannen: 423 met een eigen code (lib/company/verified.ts)
    await eisBedrijfGecontroleerd(tenantId);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success || !planWeek(parsed.data.week)) throw AppError.validation("Onbekende week of keuze");
    const uit = await verstuurVoorstel({ tenantId, week: planWeek(parsed.data.week)!.sleutel, door: principal.userId, ...(parsed.data.keuze ? { keuze: parsed.data.keuze } : {}) });
    return NextResponse.json(uit);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
