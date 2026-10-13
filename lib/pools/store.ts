import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Favorite pools — named groupings of favorited freelancers an employer can
// privately invite to a new shift before it reaches the open marketplace.
// See prisma/schema.prisma (FavoritePool/FavoritePoolMember/ShiftPoolInvite)
// and lib/shifts/create.ts / lib/matching/engine.ts for the invite-gating.
// ---------------------------------------------------------------------------

export interface PoolWithMembers {
  id: string;
  name: string;
  createdAt: Date;
  members: { freelancerUserId: string; addedAt: Date }[];
}

export async function listPools(tenantId: string): Promise<PoolWithMembers[]> {
  return prisma.favoritePool.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: { select: { freelancerUserId: true, addedAt: true }, orderBy: { addedAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
}

async function assertOwnsPool(tenantId: string, poolId: string): Promise<void> {
  const pool = await prisma.favoritePool.findFirst({ where: { id: poolId, tenantId }, select: { id: true } });
  if (!pool) throw AppError.notFound("Pool niet gevonden.");
}

export async function createPool(tenantId: string, name: string): Promise<{ id: string; name: string }> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw AppError.validation("Geef de pool een naam.");
  return prisma.favoritePool.create({ data: { tenantId, name: trimmed }, select: { id: true, name: true } });
}

export async function renamePool(tenantId: string, poolId: string, name: string): Promise<void> {
  await assertOwnsPool(tenantId, poolId);
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw AppError.validation("Geef de pool een naam.");
  await prisma.favoritePool.update({ where: { id: poolId }, data: { name: trimmed } });
}

export async function deletePool(tenantId: string, poolId: string): Promise<void> {
  await assertOwnsPool(tenantId, poolId);
  await prisma.favoritePool.delete({ where: { id: poolId } });
}

export async function addMember(
  tenantId: string,
  poolId: string,
  freelancerUserId: string,
): Promise<void> {
  await assertOwnsPool(tenantId, poolId);
  await prisma.favoritePoolMember.upsert({
    where: { poolId_freelancerUserId: { poolId, freelancerUserId } },
    create: { poolId, freelancerUserId },
    update: {},
  });
}

export async function removeMember(
  tenantId: string,
  poolId: string,
  freelancerUserId: string,
): Promise<void> {
  await assertOwnsPool(tenantId, poolId);
  await prisma.favoritePoolMember.deleteMany({ where: { poolId, freelancerUserId } });
}

/** All freelancer userIds invited to a shift, across every pool it was invited to. */
export async function invitedPoolMemberUserIds(shiftId: string): Promise<string[]> {
  const invites = await prisma.shiftPoolInvite.findMany({
    where: { shiftId },
    select: { pool: { select: { members: { select: { freelancerUserId: true } } } } },
  });
  const ids = new Set<string>();
  for (const inv of invites) for (const m of inv.pool.members) ids.add(m.freelancerUserId);
  return [...ids];
}

export async function isInvitedToPoolOnlyShift(shiftId: string, userId: string): Promise<boolean> {
  const hit = await prisma.shiftPoolInvite.findFirst({
    where: { shiftId, pool: { members: { some: { freelancerUserId: userId } } } },
    select: { id: true },
  });
  return Boolean(hit);
}

/** The pool(s) a shift was privately invited to — for display on the shift-detail page. */
export async function poolsInvitedToShift(shiftId: string): Promise<{ id: string; name: string }[]> {
  const invites = await prisma.shiftPoolInvite.findMany({
    where: { shiftId },
    select: { pool: { select: { id: true, name: true } } },
  });
  return invites.map((i) => i.pool);
}
