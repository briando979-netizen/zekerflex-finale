import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { thuisVan, WERKRUIMTES, WERKRUIMTE_INFO } from "@/lib/werkgever/werkruimte";
import { dashboardCookie, voegDashboardToe, werkruimteVan } from "@/lib/werkgever/werkruimte-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ soort: z.enum(WERKRUIMTES) });

// POST /api/werkgever/dashboard/wissel — wissel van dashboard (personeel, rijschool, horeca, website, webshop).
// Een dashboard dat het bedrijf al heeft: iedereen van het bedrijf kan erheen; dat geldt alleen voor deze
// browser (cookie). Een nieuw dashboard toevoegen: alleen de beheerder; het geldt voor het hele bedrijf.
// Antwoord: { ga } = waar het dashboard begint.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    if (!hasRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER", "PLATFORM_ADMIN")) {
      throw AppError.forbidden("Alleen een account van een bedrijf heeft dashboards.");
    }
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
    const { soort } = schema.parse(await request.json().catch(() => ({})));
    const beheerder = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");

    const huidig = await werkruimteVan(tenantId);
    if (!huidig.dashboards.includes(soort)) {
      if (!beheerder) throw AppError.forbidden("Alleen de beheerder van het bedrijf kan een dashboard toevoegen.");
      await voegDashboardToe(tenantId, soort);
      await recordAudit({
        category: "COMPANY",
        action: "werkruimte.dashboard-toegevoegd",
        severity: "info",
        actorUserId: principal.userId,
        actorLabel: "user",
        summary: `${principal.email} voegde het dashboard ${WERKRUIMTE_INFO[soort].naam} toe`,
        targetType: "tenant",
        targetId: tenantId,
      }).catch(() => undefined);
    }

    // de studio (website, webshop) en het rijschool- en horecabeheer zijn voor de beheerder;
    // een collega ziet daarvan het startscherm op /werkgever
    const ga = beheerder ? thuisVan(soort) : "/werkgever";
    const res = NextResponse.json({ ga, soort });
    res.cookies.set(dashboardCookie(soort));
    return res;
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
