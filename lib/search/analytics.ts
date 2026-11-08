import { prisma } from "@/lib/prisma";

export interface SearchAnalytics {
  popularSearches: { query: string; count: number }[];
  noResultSearches: { query: string; count: number }[];
  searchTrends: { date: string; searches: number }[];
  successRate: number;
  avgResultsPerSearch: number;
  avgTimeToResult: number;
}

export async function getSearchAnalytics(): Promise<SearchAnalytics> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Popular searches
  const popularSearches = await prisma.$queryRaw<
    Array<{ query: string; count: bigint }>
  >`
    SELECT query, COUNT(*) as count
    FROM search_logs
    WHERE created_at >= ${thirtyDaysAgo}
    GROUP BY query
    ORDER BY count DESC
    LIMIT 10
  `;

  // No-result searches
  const noResultSearches = await prisma.$queryRaw<
    Array<{ query: string; count: bigint }>
  >`
    SELECT query, COUNT(*) as count
    FROM search_logs
    WHERE created_at >= ${thirtyDaysAgo} AND results_count = 0
    GROUP BY query
    ORDER BY count DESC
    LIMIT 10
  `;

  // Trends (last 30 days)
  const searchTrends = await prisma.$queryRaw<
    Array<{ date: string; searches: bigint }>
  >`
    SELECT DATE(created_at) as date, COUNT(*) as searches
    FROM search_logs
    WHERE created_at >= ${thirtyDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `;

  // Success rate
  const successRate = await getSuccessRate(thirtyDaysAgo);
  const avgResults = await getAverageResultsPerSearch(thirtyDaysAgo);
  const avgTime = await getAverageTimeToResult(thirtyDaysAgo);

  return {
    popularSearches: popularSearches.map((s) => ({
      query: s.query,
      count: Number(s.count),
    })),
    noResultSearches: noResultSearches.map((s) => ({
      query: s.query,
      count: Number(s.count),
    })),
    searchTrends: searchTrends.map((t) => ({
      date: String(t.date),
      searches: Number(t.searches),
    })),
    successRate,
    avgResultsPerSearch: avgResults,
    avgTimeToResult: avgTime,
  };
}

async function getSuccessRate(since: Date): Promise<number> {
  const result = await prisma.$queryRaw<
    [{ success_rate: number }]
  >`
    SELECT ROUND(
      100.0 * COUNT(CASE WHEN results_count > 0 THEN 1 END) / COUNT(*),
      2
    ) as success_rate
    FROM search_logs
    WHERE created_at >= ${since}
  `;

  return result?.[0]?.success_rate ?? 0;
}

async function getAverageResultsPerSearch(since: Date): Promise<number> {
  const result = await prisma.$queryRaw<
    [{ avg: number }]
  >`
    SELECT ROUND(AVG(results_count), 2) as avg
    FROM search_logs
    WHERE created_at >= ${since}
  `;

  return result?.[0]?.avg ?? 0;
}

async function getAverageTimeToResult(since: Date): Promise<number> {
  const result = await prisma.$queryRaw<
    [{ avg: number }]
  >`
    SELECT ROUND(AVG(EXTRACT(EPOCH FROM (result_time - created_at))), 3) as avg
    FROM search_logs
    WHERE created_at >= ${since}
  `;

  return result?.[0]?.avg ?? 0;
}

// Track search event
export async function trackSearch(
  query: string,
  resultsCount: number,
  timeMs: number
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO search_logs (query, results_count, duration_ms, created_at)
    VALUES (${query}, ${resultsCount}, ${timeMs}, NOW())
  `;
}
