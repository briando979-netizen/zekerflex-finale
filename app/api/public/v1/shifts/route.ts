import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { hasScope, verifyApiKey } from "@/lib/integrations/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/v1/shifts — open diensten for the calling organization.
// Authenticate with `Authorization: Bearer zf_live_...` (see /admin/integraties).
// Requires the "shifts:read" scope. A platform-wide key (no tenantId) sees
// every organization's open shifts; a tenant-scoped key sees only its own.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const raw = auth.replace(/^Bearer\s+/i, "").trim();
    const key = raw ? await verifyApiKey(raw) : null;
    if (!key) throw AppError.unauthenticated("Ongeldige of ontbrekende API-sleutel");
    if (!hasScope(key, "shifts:read")) throw AppError.forbidden("Deze sleutel heeft geen 'shifts:read'-scope");

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

    return NextResponse.json({
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
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
