import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { bonActieInvoer, keurBonGoedViaScherm, wijsBonAfViaScherm } from "@/lib/boekhouding/scherm-actie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[a-z0-9]{10,40}$/i;

// PATCH { actie: "goedkeuren", velden: {leverancier, datum, totaal, btwPercentage, categorie}, ondanksDubbel? } boekt de
// bon; PATCH { actie: "afkeuren", reden } wijst hem af. Geeft de bijgewerkte bon terug. In het auditspoor staan alleen
// het id en de uitkomst, nooit de leverancier of het bedrag.
export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  if (!ID.test(params.id)) throw AppError.validation("Dit is geen geldige bon.");
  const body = bonActieInvoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met actie.");
    }),
  );
  if (body.actie === "goedkeuren") {
    const uit = await keurBonGoedViaScherm(params.id, body, principal.userId);
    await recordAudit({
      category: "ADMIN",
      action: "boekhouding.bon_goedgekeurd",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: "Boekhouding: bon nagekeken en geboekt",
      targetType: "boekBon",
      targetId: params.id,
      metadata: { ondanksDubbel: body.ondanksDubbel === true },
    });
    return NextResponse.json({ bon: uit.bon, boekstuk: uit.boekstuk });
  }
  const bon = await wijsBonAfViaScherm(params.id, body.reden, principal.userId);
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.bon_afgekeurd",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: bon afgekeurd",
    targetType: "boekBon",
    targetId: params.id,
    metadata: {},
  });
  return NextResponse.json({ bon });
});
