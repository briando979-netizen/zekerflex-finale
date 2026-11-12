import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { verwerkNieuweTransacties } from "@/lib/boekhouding/bank/matching";
import { bankOverzicht } from "@/lib/boekhouding/bank/scherm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ID = /^[a-z0-9]{10,40}$/i;
const PRIVE = { "Cache-Control": "private, no-store" };

const administratieInvoer = z.object({ administratieId: z.string().trim().regex(ID, "Kies een geldige administratie.") });

// GET ?administratieId=: de bankrekeningen (IBAN gemaskeerd), de transacties die op jou wachten, tellingen en wat je nog
// moet doen. Alleen lezen.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const q = new URL(request.url).searchParams;
  const { administratieId } = administratieInvoer.parse({ administratieId: q.get("administratieId") });
  return NextResponse.json(await bankOverzicht(administratieId), { headers: PRIVE });
});

// POST { administratieId }: beoordeelt alle transacties die nog op jou wachten opnieuw (na een nieuwe bon of factuur).
// Boekt alleen wat zeker is (exact factuurnummer + exact bedrag + één kandidaat).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { administratieId } = administratieInvoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan: stuur een JSON-body met administratieId.");
    }),
  );
  const verwerkt = await verwerkNieuweTransacties(administratieId, { ookTwijfel: true, door: principal.userId });
  await recordAudit({
    category: "ADMIN",
    action: "boekhouding.bank_opnieuw_gezocht",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Boekhouding: banktransacties opnieuw beoordeeld",
    targetType: "boekAdministratie",
    targetId: administratieId,
    metadata: { ...verwerkt },
  });
  return NextResponse.json({ verwerkt, overzicht: await bankOverzicht(administratieId) }, { headers: PRIVE });
});
