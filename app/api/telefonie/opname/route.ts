import { getPrincipal, requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { berichtVan, lijnVanEigenaar, opnameStream } from "@/lib/telephony/lijn-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/telefonie/opname?scope=&id=<lijn>&bericht=<id> — een voicemail of opgenomen gesprek van je eigen lijn
// afspelen. De Twilio-URL vraagt de sleutel van het account; die blijft op de server (zoals Admin → AI-beller).
export async function GET(request: Request): Promise<Response> {
  try {
    const q = new URL(request.url).searchParams;
    const scope = q.get("scope") === "persoonlijk" ? "persoonlijk" : "bedrijf";
    const principal = await getPrincipal();
    if (!principal) throw AppError.unauthenticated();
    let eigenaar = principal.userId;
    if (scope === "persoonlijk") requireRole(principal, "FREELANCER", "PLATFORM_ADMIN");
    else {
      requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
      const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
      if (!tenantId || !(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))) throw AppError.validation("Geen organisatie gekoppeld aan je account.");
      eigenaar = tenantId;
    }
    const line = await lijnVanEigenaar(q.get("id") ?? "", scope, eigenaar);
    const b = await berichtVan(line, q.get("bericht") ?? "");
    if (!b?.opnameSid) throw AppError.notFound("Bij dit bericht hoort geen opname.");
    const upstream = await opnameStream(b.opnameSid);
    if (!upstream?.body) throw AppError.upstream("De opname is (nog) niet beschikbaar. Probeer het zo nog eens.");
    return new Response(upstream.body, { status: 200, headers: { "content-type": upstream.headers.get("content-type") ?? "audio/mpeg", "cache-control": "private, no-store" } });
  } catch (err) {
    return jsonError(err);
  }
}
