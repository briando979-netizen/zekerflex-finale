import { prisma } from "@/lib/prisma";
import type { Principal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { hasReviewed } from "@/lib/reviews/store";

// ---------------------------------------------------------------------------
// Sluit de beoordelingslus: welke afgeronde klussen wachten nog op een
// beoordeling van déze werkgever? De beoordeel-knop bestaat al op de
// dienstpagina; dit levert het duwtje om 'm ook echt te gebruiken.
// Best-effort, begrensd (laatste 30 dagen, max `limit`).
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

export interface PendingReview {
  shiftId: string;
  shiftTitle: string;
  freelancerName: string;
  at: string; // einde van de dienst, ISO
}

export async function pendingEmployerReviews(principal: Principal, now = new Date(), limit = 5): Promise<PendingReview[]> {
  const scope = await resolveEmployerScope(principal);
  const branchFilter = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
  const since = new Date(now.getTime() - 30 * DAY);

  const shifts = await prisma.shift.findMany({
    where: { branch: branchFilter, endsAt: { gte: since, lt: now } },
    orderBy: { endsAt: "desc" },
    take: 25,
    select: {
      id: true,
      title: true,
      endsAt: true,
      assignments: {
        where: { cancelledAt: null },
        select: { freelancer: { select: { userId: true, user: { select: { fullName: true } } } } },
      },
    },
  });

  const out: PendingReview[] = [];
  for (const s of shifts) {
    for (const a of s.assignments) {
      if (out.length >= limit) return out;
      const already = await hasReviewed("freelancer", a.freelancer.userId, principal.userId, s.id).catch(() => true);
      if (!already) {
        out.push({ shiftId: s.id, shiftTitle: s.title, freelancerName: a.freelancer.user.fullName, at: s.endsAt.toISOString() });
      }
    }
  }
  return out;
}
