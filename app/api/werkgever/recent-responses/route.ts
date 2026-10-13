import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { listCounterOffers } from "@/lib/offers/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RecentResponse {
  id: string;
  type: "direct_accept" | "counter_offer";
  freelancerUserId: string;
  freelancerName: string;
  shiftId: string;
  shiftTitle: string;
  at: string;
  proposedRateCents?: number;
  listedRateCents?: number;
}

const querySchema = z.object({ since: z.string().datetime() });

// GET /api/werkgever/recent-responses?since=<ISO> — polled by RecentResponseAlert
// to show a real, dismiss-required card the moment a freelancer responds to a
// shift (direct accept or a new counter-offer). Previously this was entirely
// passive: nothing notified the employer in-app at all (getNotifications()'s
// own attempt at this was a dead stub — offersForUser("__none__")).
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER", "PLATFORM_ADMIN");

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ since: url.searchParams.get("since") });
    if (!parsed.success) throw AppError.validation("since moet een ISO-datum zijn");
    const since = new Date(parsed.data.since);

    const scope = await resolveEmployerScope(principal);
    const branchFilter = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };

    const [assignments, shiftIdsForOffers] = await Promise.all([
      prisma.shiftAssignment.findMany({
        where: {
          source: "ACCEPTED",
          cancelledAt: null,
          acceptedAt: { gt: since },
          shift: { branch: branchFilter },
        },
        select: {
          id: true,
          acceptedAt: true,
          freelancer: { select: { userId: true, user: { select: { fullName: true } } } },
          shift: { select: { id: true, title: true } },
        },
        orderBy: { acceptedAt: "asc" },
        take: 20,
      }),
      prisma.shift.findMany({
        where: { branch: branchFilter, startsAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
        select: { id: true },
        take: 500,
      }),
    ]);

    const out: RecentResponse[] = assignments.map((a) => ({
      id: `accept:${a.id}`,
      type: "direct_accept",
      freelancerUserId: a.freelancer.userId,
      freelancerName: a.freelancer.user.fullName,
      shiftId: a.shift.id,
      shiftTitle: a.shift.title,
      at: a.acceptedAt.toISOString(),
    }));

    const myShiftIds = new Set(shiftIdsForOffers.map((s) => s.id));
    if (myShiftIds.size > 0) {
      const offers = await listCounterOffers(500);
      for (const o of offers) {
        if (o.status !== "pending") continue;
        if (!myShiftIds.has(o.shiftId)) continue;
        if (new Date(o.at) <= since) continue;
        out.push({
          id: `offer:${o.id}`,
          type: "counter_offer",
          freelancerUserId: o.userId,
          freelancerName: o.freelancerName,
          shiftId: o.shiftId,
          shiftTitle: o.shiftTitle,
          at: o.at,
          proposedRateCents: o.proposedRateCents,
          listedRateCents: o.listedRateCents,
        });
      }
    }

    out.sort((a, b) => (a.at < b.at ? -1 : 1));
    return NextResponse.json({ responses: out, now: new Date().toISOString() });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
