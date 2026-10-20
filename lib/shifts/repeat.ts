import type { Principal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { createShift } from "@/lib/shifts/create";
import { addMember, createPool, listPools } from "@/lib/pools/store";

// ---------------------------------------------------------------------------
// "Zelfde team volgende week" — one click repeats a klus N weeks later and
// offers it privately to the people who worked (or are booked on) this one
// first. They go into a standing pool "Vast team — <klus> (<vestiging>)" so
// next time it's the same click again. Nobody is booked without saying yes:
// they get the private offer and accept like any other klus; if the team is
// empty the klus simply goes to the open marketplace.
// ---------------------------------------------------------------------------

const WEEK = 7 * 86_400_000;

export async function repeatWithSameTeam(principal: Principal, shiftId: string, weeks = 1): Promise<{ shiftId: string; invited: number; poolName: string | null }> {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 8) throw AppError.validation("Kies 1 tot 8 weken vooruit.");
  const scope = await resolveEmployerScope(principal);
  const scopeWhere = scope.branchIds ? { id: { in: scope.branchIds } } : { tenantId: { in: scope.tenantIds } };
  const s = await prisma.shift.findFirst({
    where: { AND: [{ id: shiftId }, { branch: scopeWhere }] },
    select: {
      title: true,
      description: true,
      dresscode: true,
      viaUitzendbureau: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      hourlyRateCents: true,
      positions: true,
      branch: { select: { id: true, name: true, tenantId: true, kind: true } },
      assignments: { where: { cancelledAt: null }, select: { freelancer: { select: { userId: true } } } },
    },
  });
  if (!s) throw AppError.notFound("Klus niet gevonden.");
  if (s.branch.kind === "AD_HOC") throw AppError.validation("Een klus op een eenmalige locatie kun je niet herhalen — plaats hem opnieuw.");

  let startsAt = new Date(s.startsAt.getTime() + weeks * WEEK);
  // already in the past (repeating an old klus): jump to the first matching weekday from now
  while (startsAt.getTime() < Date.now() + 3_600_000) startsAt = new Date(startsAt.getTime() + WEEK);
  const endsAt = new Date(startsAt.getTime() + (s.endsAt.getTime() - s.startsAt.getTime()));

  const team = [...new Set(s.assignments.map((a) => a.freelancer.userId))];
  let poolId: string | undefined;
  let poolName: string | null = null;
  if (team.length) {
    poolName = `Vast team — ${s.title} (${s.branch.name})`.slice(0, 80);
    const existing = (await listPools(s.branch.tenantId)).find((p) => p.name === poolName);
    poolId = existing?.id ?? (await createPool(s.branch.tenantId, poolName)).id;
    for (const userId of team) await addMember(s.branch.tenantId, poolId, userId);
  }

  const res = await createShift(principal, {
    branchId: s.branch.id,
    title: s.title,
    ...(s.description ? { description: s.description } : {}),
    ...(s.dresscode ? { dresscode: s.dresscode } : {}),
    viaUitzendbureau: s.viaUitzendbureau,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    breakMinutes: s.breakMinutes,
    hourlyRateCents: s.hourlyRateCents,
    positions: s.positions,
    ...(poolId ? { poolId } : {}),
  });
  return { shiftId: res.shiftId, invited: team.length, poolName };
}
