import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getHeropenInstelling, zetAutomatischHeropenen } from "@/lib/werkgever/heropenen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tenantFor() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
  return { principal, tenantId };
}

// GET /api/werkgever/heropenen-instelling — gaat een volle klus van dit bedrijf vanzelf weer open als een werker afzegt?
// (lib/werkgever/heropenen.ts; standaard ja)
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await tenantFor();
    return NextResponse.json(await getHeropenInstelling(tenantId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ automatisch: z.boolean() });

// POST /api/werkgever/heropenen-instelling { automatisch } — automatisch heropenen aan of uit voor het hele bedrijf. Alleen een beheerder
// (HQ_ADMIN): het geldt voor al je klussen. 423 voor de rest, geen 403 (CrowdSec telt een reeks 403's als inbraakpoging). Het
// antwoord is de nieuwe stand van de server.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId } = await tenantFor();
    if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) throw AppError.alleenBeheerder("Alleen een beheerder van het bedrijf kan dit instellen.");
    const { automatisch } = schema.parse(await request.json().catch(() => ({})));
    const volgende = await zetAutomatischHeropenen(tenantId, automatisch);
    await recordAudit({
      category: "COMPANY",
      action: automatisch ? "klus.heropenen.aan" : "klus.heropenen.uit",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} zette automatisch heropenen van klussen ${automatisch ? "AAN" : "UIT"} voor organisatie ${tenantId}`,
      targetType: "tenant",
      targetId: tenantId,
    }).catch(() => undefined);
    return NextResponse.json(volgende);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
