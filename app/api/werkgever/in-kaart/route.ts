import { NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { employerTenant } from "@/lib/webhooks/employer";
import { bedrijfSchema } from "@/lib/inkaart/schema";
import { bewaarInKaart, leesInKaart } from "@/lib/inkaart/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bedrijf in kaart (lib/inkaart): de gegevens van het eigen bedrijf lezen en bewaren. Het bedrijf komt uit de sessie, nooit uit de aanvraag.
//   GET → { bedrijf }  (null zolang er niets is bewaard); elke rol van het bedrijf mag lezen
//   PUT { ...bedrijf } → { bedrijf }  de bewaarde versie, met het tijdstip van de server; een beheerder of lokale manager
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await employerTenant(false);
    return NextResponse.json({ bedrijf: await leesInKaart(tenantId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId } = await employerTenant(false);
    if (!hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN")) {
      throw AppError.alleenBeheerder("Alleen een beheerder of een lokale manager past de gegevens van het bedrijf aan.");
    }
    await enforceRateLimit({ name: "inkaart-bewaar", identifier: principal.userId, limit: 120, windowSeconds: 3600 });
    const ruw = await request.json().catch(() => null);
    const geldig = bedrijfSchema.safeParse(ruw);
    if (!geldig.success) {
      const eerste = geldig.error.issues[0];
      throw AppError.validation(`De gegevens kloppen niet${eerste ? ` (${eerste.path.join(".") || "onbekend veld"})` : ""}. Controleer de ingevulde getallen.`);
    }
    return NextResponse.json({ bedrijf: await bewaarInKaart(tenantId, geldig.data) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
