import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { requireApiKey } from "@/lib/api-keys/gateway";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/v1/shifts/<id> — one dienst of the calling organization,
// including who is scheduled (first name + initial of the surname only).
// Scope: "shifts:read".
export async function GET(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { key, rate } = await requireApiKey(request, "shifts:read");
    const { id } = await props.params;
    const s = await prisma.shift.findFirst({
      where: { id, ...(key.tenantId ? { branch: { tenantId: key.tenantId } } : {}) },
      select: {
        id: true,
        title: true,
        status: true,
        startsAt: true,
        endsAt: true,
        breakMinutes: true,
        hourlyRateCents: true,
        positions: true,
        branch: { select: { id: true, name: true, city: true } },
        assignments: {
          where: { cancelledAt: null },
          select: { id: true, acceptedAt: true, freelancer: { select: { id: true, user: { select: { fullName: true } } } } },
        },
      },
    });
    if (!s) throw AppError.notFound("Dienst niet gevonden");
    const shortName = (full: string) => {
      const [first, ...rest] = full.trim().split(/\s+/);
      const last = rest.at(-1);
      return last ? `${first} ${last[0]!.toUpperCase()}.` : (first ?? "");
    };
    const { assignments, ...shift } = s;
    return NextResponse.json(
      {
        data: {
          ...shift,
          filled: assignments.length,
          scheduled: assignments.map((a) => ({ assignmentId: a.id, workerId: a.freelancer.id, name: shortName(a.freelancer.user.fullName), since: a.acceptedAt })),
        },
      },
      { headers: rateLimitHeaders(rate) },
    );
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
