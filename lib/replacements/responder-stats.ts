import { prisma } from "@/lib/prisma";
import { reviewSummary } from "@/lib/reviews/store";

// ---------------------------------------------------------------------------
// Public "card" stats for a freelancer who responded to a replacement request —
// enough for the original to judge whether to hand the shift over.
// ---------------------------------------------------------------------------

export interface ResponderCard {
  userId: string;
  name: string;
  badgeLevel: string;
  avgRating: number;
  reviewCount: number;
  shiftsCompleted: number;
  cancellations: number;
  /** shown up front-of-shift; 0..100 */
  attendancePct: number;
  reliabilityScore: number;
  /** haversine km from the responder's home base to the shift branch, if known */
  distanceKm: number | null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

export async function responderCards(
  userIds: string[],
  branch?: { lat: number; lng: number } | null,
): Promise<ResponderCard[]> {
  if (userIds.length === 0) return [];

  const profiles = await prisma.freelancerProfile.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      badgeLevel: true,
      shiftsCompleted: true,
      reliabilityScore: true,
      homeLatitude: true,
      homeLongitude: true,
      user: { select: { fullName: true } },
      _count: { select: { assignments: { where: { cancelledAt: { not: null } } } } },
    },
  });

  const cards = await Promise.all(
    profiles.map(async (p) => {
      const reviews = await reviewSummary("freelancer", p.userId);
      const completed = p.shiftsCompleted;
      const cancellations = p._count.assignments;
      const denom = completed + cancellations;
      const attendancePct = denom > 0
        ? Math.round((completed / denom) * 100)
        : Math.round(p.reliabilityScore * 100);
      const distanceKm =
        branch && Number.isFinite(p.homeLatitude)
          ? haversineKm({ lat: p.homeLatitude, lng: p.homeLongitude }, branch)
          : null;
      return {
        userId: p.userId,
        name: p.user.fullName,
        badgeLevel: p.badgeLevel,
        avgRating: reviews.average,
        reviewCount: reviews.count,
        shiftsCompleted: completed,
        cancellations,
        attendancePct,
        reliabilityScore: Math.round(p.reliabilityScore * 100) / 100,
        distanceKm,
      } satisfies ResponderCard;
    }),
  );

  // Best first: attendance, then rating, then experience.
  return cards.sort(
    (a, b) =>
      b.attendancePct - a.attendancePct ||
      b.avgRating - a.avgRating ||
      b.shiftsCompleted - a.shiftsCompleted,
  );
}
