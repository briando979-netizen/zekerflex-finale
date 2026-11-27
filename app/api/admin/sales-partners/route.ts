import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";
import { zetSalesPartner } from "@/lib/sales-partners/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/sales-partners: iemand sales partner maken (op e-mailadres van een bestaand account) of dat weghalen.
// Strikt platformbeheer, altijd met een regel in de audit (lib/sales-partners/store.ts).
const invoer = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  aan: z.boolean(),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }),
  );
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (!user) throw AppError.notFound("Er is geen account met dit e-mailadres. Laat de partner eerst een account maken (als werker of bedrijf).");
  const set = await zetSalesPartner(user.id, input.aan, { userId: principal.userId });
  return NextResponse.json({ aan: Object.hasOwn(set, user.id) });
});
