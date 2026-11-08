import { prisma } from "@/lib/prisma";

export interface FacetFilter {
  location?: string[];
  payMin?: number;
  payMax?: number;
  duration?: string[];
  skillTag?: string[];
  rating?: number;
}

export interface FacetAggregation {
  locations: { value: string; count: number }[];
  payRanges: { min: number; max: number; count: number }[];
  durations: { value: string; count: number }[];
  skillTags: { value: string; count: number }[];
  ratings: { value: number; count: number }[];
}

export async function applyFacets(
  filters: FacetFilter,
  limit = 50
) {
  const where: any = {};

  if (filters.location?.length) {
    where.location = { in: filters.location };
  }

  if (filters.payMin || filters.payMax) {
    where.amountCents = {};
    if (filters.payMin) where.amountCents.gte = filters.payMin * 100;
    if (filters.payMax) where.amountCents.lte = filters.payMax * 100;
  }

  if (filters.duration?.length) {
    where.durationMinutes = {
      in: filters.duration.map((d) => {
        if (d === "short") return { lte: 240 };
        if (d === "medium") return { gte: 240, lte: 480 };
        return { gte: 480 };
      }),
    };
  }

  const results = await prisma.shift.findMany({
    where,
    take: limit,
  });

  return results;
}

export async function aggregateFacets(): Promise<FacetAggregation> {
  const shifts = await prisma.shift.findMany({});

  return {
    locations: Object.entries(
      shifts.reduce((acc: Record<string, number>, s) => {
        acc[s.location] = (acc[s.location] || 0) + 1;
        return acc;
      }, {})
    )
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),

    payRanges: [
      {
        min: 0,
        max: 2500,
        count: shifts.filter((s) => s.amountCents <= 2500).length,
      },
      {
        min: 2500,
        max: 5000,
        count: shifts.filter((s) => s.amountCents > 2500 && s.amountCents <= 5000)
          .length,
      },
      {
        min: 5000,
        max: 10000,
        count: shifts.filter((s) => s.amountCents > 5000).length,
      },
    ],

    durations: [
      {
        value: "short",
        count: shifts.filter((s) => s.durationMinutes <= 240).length,
      },
      {
        value: "medium",
        count: shifts.filter(
          (s) => s.durationMinutes > 240 && s.durationMinutes <= 480
        ).length,
      },
      {
        value: "long",
        count: shifts.filter((s) => s.durationMinutes > 480).length,
      },
    ],

    skillTags: [],
    ratings: [
      { value: 5, count: 0 },
      { value: 4, count: 0 },
      { value: 3, count: 0 },
    ],
  };
}
