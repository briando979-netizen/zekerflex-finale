import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";
import { zetUitzendPartner } from "@/lib/uitzend/partners";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/uitzendpartner: een bedrijf als uitzendpartner markeren of dat weer weghalen (lib/uitzend/partners.ts).
// Bij een partner is het bureau de werkgever van zijn klussen. Strikt platformbeheer, altijd met een regel in de audit.
const invoer = z.object({
  id: z.string().trim().min(1).max(64),
  aan: z.boolean(),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }),
  );
  const bestaat = await prisma.tenant.findUnique({ where: { id: input.id }, select: { id: true, type: true } });
  if (!bestaat) throw AppError.notFound("Dit bedrijf bestaat niet (meer).");
  if (bestaat.type === "PLATFORM") throw AppError.validation("ZekerFlex zelf kan geen uitzendpartner zijn.");
  const set = await zetUitzendPartner(input.id, input.aan, { userId: principal.userId });
  const sinds = set[input.id] ?? null;
  return NextResponse.json({ aan: sinds !== null, sinds });
});
