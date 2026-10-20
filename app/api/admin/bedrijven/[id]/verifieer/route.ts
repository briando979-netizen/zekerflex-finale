import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { setTenantApproval } from "@/lib/company/verified";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ approved: z.boolean() });

// POST /api/admin/bedrijven/<id>/verifieer — approve a company by hand (e.g.
// when the automatic KVK check can't confirm it). Until a company is verified
// it can place one test klus and nobody can be scheduled (lib/company/verified.ts).
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { approved } = schema.parse(await request.json().catch(() => ({})));
  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!tenant) throw AppError.notFound("Organisatie niet gevonden");

  await setTenantApproval(tenant.id, approved, principal.email);
  await recordAudit({
    category: "COMPANY",
    action: approved ? "admin.company.approved" : "admin.company.approval_revoked",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} heeft ${tenant.name} ${approved ? "handmatig goedgekeurd" : "de goedkeuring ingetrokken"}`,
    targetType: "tenant",
    targetId: tenant.id,
  });
  return NextResponse.json({ ok: true, approved });
});
