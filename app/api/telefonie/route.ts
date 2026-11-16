import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal, hasRole, requireRole, type Principal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { cancelLineRequest, createLineRequest, linesOf, pricingFor, requestSchema, type LineScope } from "@/lib/telephony/lines";
import { freeAccess } from "@/lib/billing/comp";
import { berichtenVan, bewaarInstellingen, instellingenSchema, instellingenVan, lijnVanEigenaar, stuurSms, verwijderBericht } from "@/lib/telephony/lijn-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/telefonie — een zakelijk nummer aanvragen (lib/telephony/lines.ts).
// scope "bedrijf": opdrachtgever voor zijn organisatie (aanvragen: HQ_ADMIN);
// scope "persoonlijk": een flexkracht voor zichzelf.

async function owner(scope: LineScope, forRequest: boolean): Promise<{ principal: Principal; ownerId: string; tenantId: string | null; orgName: string | null }> {
  const principal = await getPrincipal();
  if (!principal) throw AppError.unauthenticated();
  if (scope === "persoonlijk") {
    requireRole(principal, "FREELANCER", "PLATFORM_ADMIN");
    return { principal, ownerId: principal.userId, tenantId: null, orgName: null };
  }
  // een vestigingsmanager mag meekijken, alleen de hoofdbeheerder legt het bedrijf vast
  if (forRequest) requireRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  else requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  if (!tenantId) throw AppError.validation("Geen organisatie gekoppeld aan je account.");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return { principal, ownerId: tenantId, tenantId, orgName: tenant?.name ?? null };
}

const scopeOf = (v: string | null): LineScope => (v === "persoonlijk" ? "persoonlijk" : "bedrijf");

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const scope = scopeOf(new URL(request.url).searchParams.get("scope"));
    const { ownerId, principal } = await owner(scope, false);
    const [pricing, lines] = await Promise.all([pricingFor(await freeAccess(principal)), linesOf(scope, ownerId)]);
    // bij een actieve lijn: de instellingen en de berichten (terugbelverzoeken, voicemail, sms; lib/telephony/lijn-server.ts)
    const actief = await Promise.all(lines.filter((l) => l.status === "actief").map(async (l) => ({ id: l.id, instellingen: instellingenVan(l), berichten: await berichtenVan(l) })));
    return NextResponse.json({ pricing, lines, actief, canRequest: scope === "persoonlijk" || hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN") });
  } catch (err) {
    return jsonError(err);
  }
}

const cancelSchema = z.object({ action: z.literal("cancel"), scope: z.enum(["bedrijf", "persoonlijk"]), id: z.string().min(1).max(40) });
const lijnActieSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("instellingen"), scope: z.enum(["bedrijf", "persoonlijk"]), id: z.string().min(1).max(40), instellingen: instellingenSchema }),
  z.object({ action: z.literal("bericht-weg"), scope: z.enum(["bedrijf", "persoonlijk"]), id: z.string().min(1).max(40), bericht: z.string().min(1).max(40) }),
  z.object({ action: z.literal("sms"), scope: z.enum(["bedrijf", "persoonlijk"]), id: z.string().min(1).max(40), aan: z.string().trim().min(6).max(30), tekst: z.string().trim().min(1).max(600) }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    });
    if (body?.action === "cancel") {
      const input = cancelSchema.parse(body);
      const { ownerId, principal } = await owner(input.scope, true);
      const line = await cancelLineRequest(input.id, input.scope, ownerId, principal.fullName);
      return NextResponse.json({ line });
    }
    // een actieve lijn beheren: instellen (hoofdbeheerder), berichten wissen en sms terugsturen (ook een vestigingsmanager)
    if (body?.action === "instellingen" || body?.action === "bericht-weg" || body?.action === "sms") {
      const input = lijnActieSchema.parse(body);
      const { ownerId } = await owner(input.scope, input.action === "instellingen");
      const line = await lijnVanEigenaar(input.id, input.scope, ownerId);
      if (input.action === "instellingen") {
        const next = await bewaarInstellingen(line, input.instellingen);
        return NextResponse.json({ line: next, instellingen: instellingenVan(next) });
      }
      if (input.action === "bericht-weg") await verwijderBericht(line, input.bericht);
      else await stuurSms(line, input.aan, input.tekst);
      return NextResponse.json({ berichten: await berichtenVan(line) });
    }
    const input = requestSchema.parse(body);
    const { principal, tenantId, orgName } = await owner(input.scope, true);
    const line = await createLineRequest(
      { userId: principal.userId, name: principal.fullName, email: principal.email, tenantId, orgName },
      input,
      { free: await freeAccess(principal) },
    );
    return NextResponse.json({ line }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
