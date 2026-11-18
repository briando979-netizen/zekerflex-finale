import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { maakPartnerCampagnes, partnerStand } from "@/lib/sales/partner-campagnes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beheer, Sales, Partnercampagnes: de campagnes voor uitzendbureaus, verzekeraars en administratiekantoren (lib/sales/partner-soorten.ts).
// GET: de stand. POST: maakt de ontbrekende campagnes aan als CONCEPT (niet actief, elke mail met "Verstuur nu"). Alleen PLATFORM_ADMIN.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ soorten: await partnerStand() }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  await enforceRateLimit({ name: "partner-campagnes", identifier: principal.userId, limit: 10, windowSeconds: 3600 });
  const uitslag = await maakPartnerCampagnes({ id: principal.userId, email: principal.email });
  await recordAudit({
    category: "SALES",
    action: "sales.partner.campagnes",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Partnercampagnes aangemaakt: ${uitslag.aangemaakt.length} nieuw, ${uitslag.bestond.length} bestonden al`,
  });
  return NextResponse.json({ ...uitslag, soorten: await partnerStand() });
});
