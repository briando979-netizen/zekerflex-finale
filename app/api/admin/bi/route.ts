import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { biIngesteld, biPubliekeUrl, dashboardLinkVoor, leesBiStand, metabaseGezond, richtBiIn } from "@/lib/bi/metabase";
import { BI_VIEWS } from "@/lib/bi/views";
import { KAARTEN } from "@/lib/bi/dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → Overzicht → Rapportages (BI). GET = de stand van Metabase en de
// inrichting, plus een voorbeeldlink voor het eigen bedrijf; POST = nu (opnieuw) inrichten.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const [stand, gezond] = await Promise.all([leesBiStand(), metabaseGezond()]);
  const eigen = await prisma.membership.findFirst({ where: { userId: principal.userId }, select: { tenantId: true }, orderBy: { createdAt: "asc" } });
  const voorbeeldTenant = new URL(request.url).searchParams.get("tenant") || eigen?.tenantId || null;
  const voorbeeld = voorbeeldTenant ? await dashboardLinkVoor(voorbeeldTenant) : null;
  return NextResponse.json({
    ingesteld: biIngesteld(),
    gezond,
    publiekeUrl: biPubliekeUrl(),
    beheerderEmail: env.METABASE_ADMIN_EMAIL,
    stand: { ...stand, rolWachtwoord: stand.rolWachtwoord ? "ingesteld" : null, inbedsleutel: stand.inbedsleutel ? "ingesteld" : null },
    views: BI_VIEWS.map((v) => ({ naam: v.naam, uitleg: v.uitleg })),
    kaarten: KAARTEN.map((k) => ({ sleutel: k.sleutel, naam: k.naam, uitleg: k.uitleg, weergave: k.weergave })),
    voorbeeld: voorbeeld ? { tenantId: voorbeeldTenant, url: voorbeeld } : null,
  });
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  const stand = await richtBiIn();
  await recordAudit({
    category: "ADMIN",
    action: "admin.bi.inrichten",
    summary: stand.laatsteFout ? `Metabase inrichten mislukt: ${stand.laatsteFout.slice(0, 120)}` : `Metabase ingericht (dashboard #${stand.dashboardId})`,
    actorUserId: principal.userId,
  });
  return NextResponse.json({ ok: !stand.laatsteFout, fout: stand.laatsteFout, ingerichtOp: stand.ingerichtOp });
});
