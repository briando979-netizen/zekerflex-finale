import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { withAdminAccess } from "@/lib/auth/handlers";
import { zetEigenTest } from "@/lib/admin/eigen-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/eigen-test: een bedrijf of account als "eigen test (telt niet mee)" markeren of dat weer weghalen
// (lib/admin/eigen-test.ts). Strikt platformbeheer, altijd met een regel in de audit.
const invoer = z.object({
  soort: z.enum(["tenant", "user"]),
  id: z.string().trim().min(1).max(64),
  aan: z.boolean(),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = invoer.parse(
    await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    }),
  );
  const bestaat =
    input.soort === "tenant"
      ? await prisma.tenant.findUnique({ where: { id: input.id }, select: { id: true } })
      : await prisma.user.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!bestaat) throw AppError.notFound(input.soort === "tenant" ? "Dit bedrijf bestaat niet (meer)." : "Dit account bestaat niet (meer).");
  const et = await zetEigenTest(input.soort, input.id, input.aan, { userId: principal.userId });
  const sinds = (input.soort === "tenant" ? et.tenants : et.users)[input.id] ?? null;
  return NextResponse.json({ aan: sinds !== null, sinds });
});
