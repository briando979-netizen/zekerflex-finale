import { reviewSummary } from "@/lib/reviews/store";

export interface Rating {
  average: number;
  count: number;
}

/** Company ratings for a set of tenants (only tenants with at least one review are returned). */
export async function companyRatings(tenantIds: string[]): Promise<Map<string, Rating>> {
  const out = new Map<string, Rating>();
  await Promise.all(
    [...new Set(tenantIds)].map(async (id) => {
      const s = await reviewSummary("company", id).catch(() => null);
      if (s && s.count > 0) out.set(id, { average: s.average, count: s.count });
    }),
  );
  return out;
}

/** Freelancer ratings (by user id) — shown to employers next to names. */
export async function freelancerRatings(userIds: string[]): Promise<Map<string, Rating>> {
  const out = new Map<string, Rating>();
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      const s = await reviewSummary("freelancer", id).catch(() => null);
      if (s && s.count > 0) out.set(id, { average: s.average, count: s.count });
    }),
  );
  return out;
}
