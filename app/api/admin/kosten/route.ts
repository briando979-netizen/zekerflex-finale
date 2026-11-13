import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { leesKosten, wijzigKosten, wijzigingSchema } from "@/lib/admin/kosten-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/kosten: de kostenlijst (Beheer -> Kosten). Alleen platformbeheer.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ stand: await leesKosten() });
});

// PATCH { upsert: post } of { verwijder: id }: past de lijst aan en geeft de NIEUWE serverversie terug.
// Het scherm neemt die over; hij wijzigt zelf geen los veld.
export const PATCH = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const wijziging = wijzigingSchema.parse(await request.json().catch(() => ({})));
  const stand = await wijzigKosten(wijziging);
  await recordAudit({
    category: "ADMIN",
    action: "admin.kosten.gewijzigd",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    // alleen de naam van de post, nooit een bedrag of een bron
    summary: "upsert" in wijziging ? `Kostenpost bijgewerkt: ${wijziging.upsert.naam}` : `Kostenpost verwijderd: ${wijziging.verwijder}`,
  });
  return NextResponse.json({ stand });
});
