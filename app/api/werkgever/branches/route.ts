import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/branches — the calling employer's own permanent
// vestigingen (never another tenant's, never ad-hoc one-off klus-locaties).
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const branches = await prisma.branch.findMany({
      where: { tenantId, kind: "PERMANENT" },
      select: {
        id: true,
        name: true,
        addressLine: true,
        postalCode: true,
        city: true,
        latitude: true,
        longitude: true,
        costCenter: true,
        geofenceRadiusMeters: true,
        _count: { select: { shifts: true, timesheets: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ branches });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  addressLine: z.string().trim().min(3).max(200),
  postalCode: z.string().trim().min(4).max(12),
  city: z.string().trim().min(2).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  costCenter: z.string().trim().max(60).optional(),
  geofenceRadiusMeters: z.coerce.number().int().min(20).max(1000).default(150),
});

// POST /api/werkgever/branches — self-service: add a vestiging. Only an
// HQ_ADMIN manages the organization's own locations (a LOCAL_MANAGER is
// scoped to specific branches, not entitled to create new ones) — same gate
// as the rest of /werkgever/locaties.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());

    const { costCenter, ...rest } = parsed.data;
    const branch = await prisma.branch.create({
      data: { ...rest, ...(costCenter ? { costCenter } : {}), tenantId, kind: "PERMANENT" },
      select: { id: true, name: true },
    });

    await recordAudit({
      category: "COMPANY",
      action: "employer.branch.created",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} voegde vestiging "${branch.name}" toe`,
      targetType: "branch",
      targetId: branch.id,
      metadata: { tenantId },
    });

    return NextResponse.json({ branch }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
