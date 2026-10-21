import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { INSPECT_MAX_HOURS, INSPECT_PARAM, inspectable, mintInspectLink } from "@/lib/auth/inspect";
import type { RoleGrant } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ hours: z.number().int().min(1).max(INSPECT_MAX_HOURS).default(24) });

// POST /api/admin/gebruikers/<id>/inspect — mint a read-only inspection link
// for a TEST account (lib/auth/inspect.ts), for an AI or screenshot script.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { hours } = schema.parse(await request.json().catch(() => ({})));
  const user = await prisma.user.findFirst({
    where: { id: params.id, disabledAt: null },
    include: { memberships: { include: { scopedBranches: { select: { branchId: true } } } } },
  });
  if (!user) throw AppError.notFound("Gebruiker niet gevonden");
  const roles: RoleGrant[] = user.memberships.map((m) => ({
    role: m.role,
    organizationId: m.tenantId,
    locationIds: m.scopedBranches.map((b) => b.branchId),
  }));
  if (!inspectable(roles)) throw AppError.validation("Beheerders- en salesaccounts kun je niet laten inspecteren. Gebruik een testaccount.");

  const { token, expiresAt } = await mintInspectLink({ sub: user.id, email: user.email, name: user.fullName, roles }, hours);
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const q = `${INSPECT_PARAM}=${encodeURIComponent(token)}`;

  await recordAudit({
    category: "SECURITY",
    action: "inspect.link_created",
    severity: "warning",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} maakte een alleen-lezen inspectielink voor ${user.email} (${hours} uur geldig)`,
    targetType: "user",
    targetId: user.id,
    metadata: { hours, expiresAt: expiresAt.toISOString() },
  });

  return NextResponse.json({
    expiresAt: expiresAt.toISOString(),
    token,
    web: `${base}/start?${q}`,
    app: `${base}/start?${q}&app=1`,
    param: q,
  });
});
