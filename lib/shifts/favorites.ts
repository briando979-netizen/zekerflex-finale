import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Shift favorites (bookmarks) — flexwerkers kunnen klussen merken
 * voor makkelijke terugvinding en alerts op vergelijkbare uren.
 */

export async function toggleShiftFavorite(
  freelancerId: string,
  shiftId: string,
): Promise<boolean> {
  try {
    const existing = await prisma.shiftFavorite.findUnique({
      where: { freelancerId_shiftId: { freelancerId, shiftId } },
      select: { id: true },
    });

    if (existing) {
      await prisma.shiftFavorite.delete({ where: { id: existing.id } });
      logger.info("shift-favorite-removed", { freelancerId, shiftId });
      return false;
    }

    await prisma.shiftFavorite.create({
      data: { freelancerId, shiftId, alertSimilar: true },
    });
    logger.info("shift-favorite-added", { freelancerId, shiftId });
    return true;
  } catch (err) {
    logger.error("toggle-shift-favorite-error", { error: (err as Error).message });
    throw err;
  }
}

export async function isShiftFavorited(
  freelancerId: string,
  shiftId: string,
): Promise<boolean> {
  const fav = await prisma.shiftFavorite.findUnique({
    where: { freelancerId_shiftId: { freelancerId, shiftId } },
    select: { id: true },
  });
  return !!fav;
}

export async function getFavoriteShiftIds(freelancerId: string): Promise<string[]> {
  const favs = await prisma.shiftFavorite.findMany({
    where: { freelancerId },
    select: { shiftId: true },
  });
  return favs.map((f) => f.shiftId);
}

export async function getFavoriteShifts(
  freelancerId: string,
  limit = 20,
) {
  return prisma.shiftFavorite.findMany({
    where: { freelancerId },
    include: {
      shift: {
        include: {
          branch: { select: { name: true, tenantId: true } },
          requiredSkill: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
