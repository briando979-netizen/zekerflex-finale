import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, type Principal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getOrgProfileExtra, saveOrgProfileExtra } from "@/lib/profile/store";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function myTenantId(p: Principal): Promise<string> {
  const scope = await resolveEmployerScope(p);
  const id = scope.tenantIds[0];
  if (!id) throw AppError.forbidden("Geen organisatie gekoppeld aan dit account.");
  return id;
}

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await myTenantId(p);
    const [tenant, extra] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      getOrgProfileExtra(tenantId),
    ]);
    return NextResponse.json({ tenantId, name: tenant?.name ?? null, profile: extra });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({
  websiteUrl: z.string().max(200).optional(),
  about: z.string().max(600).optional(),
  billingEmail: z.string().max(200).optional(),
  splitByCostCentre: z.boolean().optional(),
  costCentres: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
});

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const tenantId = await myTenantId(p);
    const input = schema.parse(await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }));
    const profile = await saveOrgProfileExtra(tenantId, {
      ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl } : {}),
      ...(input.about !== undefined ? { about: input.about } : {}),
      ...(input.billingEmail !== undefined ? { billingEmail: input.billingEmail } : {}),
      ...(input.splitByCostCentre !== undefined ? { splitByCostCentre: input.splitByCostCentre } : {}),
      ...(input.costCentres !== undefined ? { costCentres: input.costCentres } : {}),
    });
    return NextResponse.json({ profile });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
