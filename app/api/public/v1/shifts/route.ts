import { assertMayPlaceShift } from "@/lib/company/verified";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";
import { createShiftSchema } from "@/lib/shifts/create";
import { recordAudit } from "@/lib/audit";
import { runMatchingForShift } from "@/lib/matching/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/v1/shifts — open diensten for the calling organization.
// Authenticate with `Authorization: Bearer zf_live_...` (see /admin/integraties).
// Requires the "shifts:read" scope. A platform-wide key (no tenantId) sees
// every organization's open shifts; a tenant-scoped key sees only its own.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "shifts:read");

    const shifts = await prisma.shift.findMany({
      where: {
        status: { in: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
        ...(key.tenantId ? { branch: { tenantId: key.tenantId } } : {}),
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        hourlyRateCents: true,
        positions: true,
        status: true,
        branch: { select: { name: true, city: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 100,
    });

    return NextResponse.json(
      {
        data: shifts.map((s) => ({
          id: s.id,
          title: s.title,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          hourlyRateCents: s.hourlyRateCents,
          positions: s.positions,
          status: s.status,
          branch: s.branch.name,
          city: s.branch.city,
        })),
      },
      { headers: rateLimitHeaders(rate) },
    );
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "shifts:write");
    if (!key.tenantId) throw AppError.precondition("Deze API-sleutel is niet aan een organisatie gekoppeld");
    const body = createShiftSchema.parse(await request.json());
    // The public API doesn't support eenmalige klus-locaties (dashboard-only convenience) — always requires a saved branchId.
    if (!body.branchId) throw AppError.validation("branchId is verplicht");
    const branch = await prisma.branch.findFirst({ where: { id: body.branchId, tenantId: key.tenantId }, select: { id: true } });
    if (!branch) throw AppError.forbidden("Vestiging hoort niet bij de organisatie van deze sleutel");
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt <= startsAt) throw AppError.validation("De eindtijd moet na de starttijd liggen");
    await assertMayPlaceShift(key.tenantId);
    const shift = await prisma.shift.create({ data: { branchId: branch.id, title: body.title, ...(body.description ? { description: body.description } : {}), startsAt, endsAt, breakMinutes: body.breakMinutes, hourlyRateCents: body.hourlyRateCents, positions: body.positions, status: "OPEN" }, select: { id: true, title: true, startsAt: true, endsAt: true, status: true } });
    void runMatchingForShift(shift.id).catch(() => undefined);
    await recordAudit({ category: "MATCHING", action: "api.shift.created", actorLabel: `api-key:${key.id}`, summary: `Dienst via API aangemaakt: ${shift.title}`, targetType: "shift", targetId: shift.id, metadata: { tenantId: key.tenantId } });
    return NextResponse.json({ data: shift }, { status: 201, headers: rateLimitHeaders(rate) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
