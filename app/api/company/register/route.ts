import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, hasRole, assertOrganizationAccess } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  registerFreelancerCompany,
  registerTenantCompany,
} from "@/lib/company/registration";
import { kvkLimietVan } from "@/lib/kvk/tegoed";
import { wisKvkWacht, zetKvkWacht } from "@/lib/kvk/tegoed-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kvkNumber: z.string().regex(/^\d[\d\s.]{6,11}$/),
  target: z.enum(["freelancer", "organization"]).default("freelancer"),
  organizationId: z.string().min(1).max(128).optional(),
});

/**
 * POST /api/company/register
 *
 *  { kvkNumber, target: "freelancer" }                         -> the caller's own profile
 *  { kvkNumber, target: "organization", organizationId: "…" }  -> an org (HQ_ADMIN/PLATFORM_ADMIN)
 *
 * Fetches + validates the company via KVKBase, snapshots it and flips the
 * relevant validity gate.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/company/register" });
  try {
    const principal = await requirePrincipal();
    const json = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    });
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Niet alle gegevens zijn goed ingevuld.", parsed.error.flatten());
    }
    const { kvkNumber, target } = parsed.data;

    if (target === "organization") {
      const organizationId = parsed.data.organizationId;
      if (!organizationId) {
        throw AppError.validation("Kies eerst de organisatie.");
      }
      if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) {
        throw AppError.forbidden("Alleen een beheerder van het hoofdkantoor kan dit doen.");
      }
      assertOrganizationAccess(principal, organizationId);
      const result = await registerTenantCompany({ tenantId: organizationId, kvkNumber });
      return NextResponse.json(result);
    }

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: { id: true },
    });
    if (!profile) throw AppError.forbidden("Je hebt nog geen werkersprofiel. Maak eerst je profiel af.");

    let result;
    try {
      result = await registerFreelancerCompany({
        freelancerProfileId: profile.id,
        kvkNumber,
      });
    } catch (err) {
      // tegoed op of minuutlimiet bij KVKBase: in de wacht voor de herkansing (lib/kvk/herkansing.ts), zoals de aanmelding
      // al deed (lib/onboarding/verify.ts); anders bleef deze werker voor altijd zonder controle en zonder voorstellen
      const limiet = kvkLimietVan(err);
      if (limiet) await zetKvkWacht("werker", principal.userId, kvkNumber.replace(/\D/g, ""), limiet);
      throw err;
    }
    // gecontroleerd: een eerdere wachtende controle is niet meer nodig
    await wisKvkWacht("werker", principal.userId);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("registration failed", { error: (err as Error).message });
    else log.warn("registration rejected", { status, code: body.error.code });
    return NextResponse.json(body, { status });
  }
}
