import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { MAX_FACTUREN_PER_AANROEP, boekFacturenAlsBeheerder } from "@/lib/boekhouding/beheer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const invoer = z.object({
  administratieId: z.string().trim().min(1).max(64),
  sinds: z.string().datetime({ offset: true }).optional(),
  limiet: z.number().int().min(1).max(MAX_FACTUREN_PER_AANROEP).optional(),
});

// POST { administratieId, sinds?, limiet? }: boekt de openstaande platformfacturen (idempotent) en geeft de uitkomst terug.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const body = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met administratieId.");
    }),
  );
  const uitkomst = await boekFacturenAlsBeheerder({
    administratieId: body.administratieId,
    sinds: body.sinds ? new Date(body.sinds) : undefined,
    limiet: body.limiet,
  });
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.facturen_geboekt",
    actorUserId: principal.userId,
    actorLabel: "user",
    severity: uitkomst.fouten.length > 0 ? "warning" : "info",
    summary: `Boekhouding: ${uitkomst.verwerkt} facturen verwerkt, ${uitkomst.fouten.length} fouten`,
    targetType: "boekAdministratie",
    targetId: body.administratieId,
    metadata: { geboekt: uitkomst.geboekt, alGeboekt: uitkomst.alGeboekt, overgeslagen: uitkomst.overgeslagen, fouten: uitkomst.fouten.length },
  });
  return NextResponse.json(uitkomst);
});
