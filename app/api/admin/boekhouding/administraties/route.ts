import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { lijstAdministraties, maakAdministratieAlsBeheerder } from "@/lib/boekhouding/beheer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/boekhouding/administraties: alle administraties met soort, aantal boekingen en vergrendelde maanden.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ administraties: await lijstAdministraties() }));

const invoer = z.object({
  naam: z.string().trim().min(1, "De naam van de administratie is verplicht.").max(80),
  soort: z.enum(["ECHT", "TEST"]),
  valuta: z.string().trim().length(3).optional(),
  platformTenantId: z.string().trim().min(1).max(64).optional(),
  bevestig: z.string().optional(),
});

// POST { naam, soort, valuta?, platformTenantId?, bevestig? }: maakt een administratie. ECHT vraagt bevestig "ECHT AANMAKEN"
// en een platform-tenant; TEST krijgt het voorvoegsel "TEST " in de naam.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met naam en soort.");
    }),
  );
  const gemaakt = await maakAdministratieAlsBeheerder({
    naam: body.naam,
    soort: body.soort,
    valuta: body.valuta?.toUpperCase(),
    platformTenantId: body.platformTenantId,
    bevestig: body.bevestig,
  });
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.administratie_aangemaakt",
    actorUserId: principal.userId,
    actorLabel: "user",
    severity: gemaakt.soort === "ECHT" ? "warning" : "info",
    summary: `Boekhouding: ${gemaakt.soort}-administratie aangemaakt`,
    targetType: "boekAdministratie",
    targetId: gemaakt.id,
    metadata: { soort: gemaakt.soort, rekeningen: gemaakt.rekeningen, btwCodes: gemaakt.btwCodes },
  });
  return NextResponse.json({ administratie: gemaakt }, { status: 201 });
});
