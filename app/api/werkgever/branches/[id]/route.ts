import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ownedBranch(tenantId: string, id: string) {
  const branch = await prisma.branch.findFirst({ where: { id, tenantId, kind: "PERMANENT" } });
  if (!branch) throw AppError.notFound("Vestiging niet gevonden");
  return branch;
}

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  addressLine: z.string().trim().min(3).max(200).optional(),
  postalCode: z.string().trim().min(4).max(12).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  costCenter: z.string().trim().max(60).nullable().optional(),
  geofenceRadiusMeters: z.coerce.number().int().min(20).max(1000).optional(),
});

// PATCH /api/werkgever/branches/:id — edit a vestiging's own fields.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const principal = await requirePrincipal();
    requireRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    await ownedBranch(tenantId, id);

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());
    const d = parsed.data;

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.addressLine !== undefined ? { addressLine: d.addressLine } : {}),
        ...(d.postalCode !== undefined ? { postalCode: d.postalCode } : {}),
        ...(d.city !== undefined ? { city: d.city } : {}),
        ...(d.latitude !== undefined ? { latitude: d.latitude } : {}),
        ...(d.longitude !== undefined ? { longitude: d.longitude } : {}),
        ...(d.geofenceRadiusMeters !== undefined ? { geofenceRadiusMeters: d.geofenceRadiusMeters } : {}),
        ...(d.costCenter !== undefined ? { costCenter: d.costCenter } : {}),
      },
    });

    await recordAudit({
      category: "COMPANY",
      action: "employer.branch.updated",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} bewerkte vestiging "${branch.name}"`,
      targetType: "branch",
      targetId: branch.id,
      metadata: { tenantId, fields: Object.keys(parsed.data) },
    });

    return NextResponse.json({ branch });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/werkgever/branches/:id — only when nothing references it yet;
// a vestiging that has ever had a shift or timesheet stays (archiving/soft
// delete isn't modelled) rather than risking orphaned records.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const principal = await requirePrincipal();
    requireRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const branch = await ownedBranch(tenantId, id);
    const [shiftCount, timesheetCount] = await Promise.all([
      prisma.shift.count({ where: { branchId: id } }),
      prisma.timesheet.count({ where: { branchId: id } }),
    ]);
    if (shiftCount > 0 || timesheetCount > 0) {
      throw AppError.conflict(
        "Deze vestiging heeft al diensten of urenbriefjes — verwijderen kan niet. Pas de vestiging aan of laat hem ongebruikt staan.",
      );
    }

    await prisma.branch.delete({ where: { id } });

    await recordAudit({
      category: "COMPANY",
      action: "employer.branch.deleted",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} verwijderde vestiging "${branch.name}"`,
      targetType: "branch",
      targetId: id,
      metadata: { tenantId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
