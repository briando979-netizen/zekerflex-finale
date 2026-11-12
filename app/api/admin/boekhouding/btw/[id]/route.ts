import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { btwConceptOpId, markeerIngediend, markeerKlaarVoorIndienen } from "@/lib/boekhouding/btw/concept";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/i;

const actieInvoer = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("klaar"), overschrijfReden: z.string().max(500, "De reden is te lang (hooguit 500 tekens).").optional() }),
  z.object({
    actie: z.literal("ingediend"),
    ingediendOp: z.string().trim().min(1, "Vul de datum van indienen in."),
    referentie: z.string().max(100, "De referentie is te lang (hooguit 100 tekens)."),
  }),
]);

// GET: dit ene concept.
export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  if (!ID.test(params.id)) throw AppError.validation("Dit is geen geldig btw-concept.");
  return NextResponse.json({ concept: await btwConceptOpId(params.id) });
});

// PATCH { actie: "klaar", overschrijfReden? } zet het concept op "klaar om in te dienen" (met blokkerende meldingen alleen
// met een reden); PATCH { actie: "ingediend", ingediendOp, referentie } legt vast dat een mens het zelf heeft ingediend.
// ZekerFlex dient NOOIT zelf in. Geeft het bijgewerkte concept terug.
export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  if (!ID.test(params.id)) throw AppError.validation("Dit is geen geldig btw-concept.");
  const body = actieInvoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met actie.");
    }),
  );
  if (body.actie === "klaar") {
    const uit = await markeerKlaarVoorIndienen(params.id, principal.userId, body.overschrijfReden);
    await recordAudit({
      category: "ADMIN",
      action: "boekhouding.btw_concept_klaar",
      actorUserId: principal.userId,
      actorLabel: "user",
      severity: uit.overschreven ? "warning" : "info",
      summary: uit.overschreven ? "Boekhouding: btw-concept klaar gezet ondanks blokkerende punten" : "Boekhouding: btw-concept klaar gezet om in te dienen",
      targetType: "boekBtwAangifte",
      targetId: params.id,
      metadata: { overschreven: uit.overschreven, ...(uit.reden ? { reden: uit.reden } : {}) },
    });
    return NextResponse.json({ concept: uit.concept, overschreven: uit.overschreven });
  }
  const concept = await markeerIngediend(params.id, { ingediendOp: body.ingediendOp, referentie: body.referentie });
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.btw_concept_ingediend",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: btw-aangifte door een mens als ingediend gemarkeerd",
    targetType: "boekBtwAangifte",
    targetId: params.id,
    metadata: { jaar: concept.jaar, kwartaal: concept.kwartaal, versie: concept.versie },
  });
  return NextResponse.json({ concept });
});
