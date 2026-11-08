import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

/**
 * Knowledge Analytics - Pillar 5
 * Search analytics, content popularity, engagement metrics, gap analysis
 */

export interface AnalyticsPeriod {
  startDate: Date;
  endDate: Date;
}

export interface SearchMetrics {
  totalSearches: number;
  uniqueQueries: number;
  avgResultCount: number;
  clickThroughRate: number;
  helpfulRate: number;
  noResultsRate: number;
}

export interface ContentPopularity {
  articleId: string;
  title: string;
  viewCount: number;
  searchCount: number;
  clickCount: number;
  helpfulRatio: number;
  trending: boolean;
}

/**
 * Calculate search metrics for a period
 */
export async function calculateSearchMetrics(
  startDate: Date,
  endDate: Date
): Promise<SearchMetrics> {
  try {
    const logs = await prisma.searchLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    if (logs.length === 0) {
      return {
        totalSearches: 0,
        uniqueQueries: 0,
        avgResultCount: 0,
        clickThroughRate: 0,
        helpfulRate: 0,
        noResultsRate: 0,
      };
    }

    const uniqueQueries = new Set(logs.map((l) => l.query)).size;
    const totalResults = logs.reduce((sum, l) => sum + l.resultsCount, 0);
    const avgResultCount = totalResults / logs.length;

    const clickedLogs = logs.filter((l) => l.clickedArticle);
    const clickThroughRate = (clickedLogs.length / logs.length) * 100;

    const helpfulLogs = logs.filter((l) => l.helpful === true);
    const helpfulRate = (helpfulLogs.length / logs.length) * 100;

    const noResultsLogs = logs.filter((l) => l.resultsCount === 0);
    const noResultsRate = (noResultsLogs.length / logs.length) * 100;

    return {
      totalSearches: logs.length,
      uniqueQueries,
      avgResultCount: Math.round(avgResultCount * 10) / 10,
      clickThroughRate: Math.round(clickThroughRate),
      helpfulRate: Math.round(helpfulRate),
      noResultsRate: Math.round(noResultsRate),
    };
  } catch (error) {
    throw AppError.internal(
      `Failed to calculate metrics: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get top searched queries
 */
export async function getTopSearches(
  startDate: Date,
  endDate: Date,
  limit: number = 20
) {
  try {
    const logs = await prisma.searchLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        query: true,
        helpful: true,
        resultsCount: true,
      },
    });

    const grouped = new Map<string, {
      count: number;
      resultsAvg: number;
      helpfulCount: number;
    }>();

    for (const log of logs) {
      const key = log.query;
      if (!grouped.has(key)) {
        grouped.set(key, {
          count: 0,
          resultsAvg: 0,
          helpfulCount: 0,
        });
      }

      const data = grouped.get(key)!;
      data.count++;
      data.resultsAvg += log.resultsCount;
      if (log.helpful) data.helpfulCount++;
    }

    return Array.from(grouped.entries())
      .map(([query, data]) => ({
        query,
        searchCount: data.count,
        avgResults: Math.round(data.resultsAvg / data.count),
        helpfulCount: data.helpfulCount,
        helpfulRate: Math.round((data.helpfulCount / data.count) * 100),
      }))
      .sort((a, b) => b.searchCount - a.searchCount)
      .slice(0, limit);
  } catch (error) {
    throw AppError.internal(
      `Failed to get top searches: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get most viewed/popular articles
 */
export async function getPopularArticles(
  startDate: Date,
  endDate: Date,
  limit: number = 20
): Promise<ContentPopularity[]> {
  try {
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        status: "PUBLISHED",
        updatedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        metrics: true,
      },
      orderBy: {
        metrics: {
          viewCount: "desc",
        },
      },
      take: limit,
    });

    return articles.map((article) => ({
      articleId: article.id,
      title: article.title,
      viewCount: article.metrics?.viewCount || 0,
      searchCount: article.metrics?.searchCount || 0,
      clickCount: article.metrics?.clickCount || 0,
      helpfulRatio: article.metrics?.helpfulRatio || 0.5,
      trending: (article.metrics?.lastViewedAt || new Date()) > new Date(Date.now() - 24 * 60 * 60 * 1000),
    }));
  } catch (error) {
    throw AppError.internal(
      `Failed to get popular articles: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get engagement metrics per audience segment
 */
export async function getAudienceEngagement(
  startDate: Date,
  endDate: Date
) {
  try {
    const logs = await prisma.searchLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const segments: Record<string, {
      searches: number;
      clickThrough: number;
      avgTimeSpent: number;
      helpfulRate: number;
    }> = {};

    const roleMap: Record<string, string> = {
      "freelancer": "Freelancer",
      "employer": "Employer",
      "admin": "Admin",
      null: "Unknown",
    };

    for (const log of logs) {
      const role = log.userRole || "unknown";
      const label = roleMap[role as keyof typeof roleMap] || role;

      if (!segments[label]) {
        segments[label] = {
          searches: 0,
          clickThrough: 0,
          avgTimeSpent: 0,
          helpfulRate: 0,
        };
      }

      segments[label].searches++;
      if (log.clickedArticle) segments[label].clickThrough++;
      if (log.timeSpent) segments[label].avgTimeSpent += log.timeSpent;
      if (log.helpful) segments[label].helpfulRate++;
    }

    // Normalize
    for (const [, data] of Object.entries(segments)) {
      data.avgTimeSpent = Math.round(data.avgTimeSpent / data.searches);
      data.helpfulRate = Math.round((data.helpfulRate / data.searches) * 100);
    }

    return segments;
  } catch (error) {
    throw AppError.internal(
      `Failed to get audience engagement: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Aggregate and store monthly analytics
 */
export async function aggregateMonthlyAnalytics(
  year: number,
  month: number
): Promise<void> {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const period = `${year}-${String(month).padStart(2, "0")}`;

    const metrics = await calculateSearchMetrics(startDate, endDate);
    const topSearches = await getTopSearches(startDate, endDate, 50);

    const topQueries = topSearches.map((s) => ({
      query: s.query,
      count: s.searchCount,
    }));

    // Get top articles
    const topArticles = await prisma.contentMetrics.findMany({
      where: {
        article: {
          updatedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      orderBy: { viewCount: "desc" },
      take: 20,
      select: {
        articleId: true,
        viewCount: true,
      },
    });

    const topArticlesData = topArticles.map((a) => ({
      articleId: a.articleId,
      views: a.viewCount,
    }));

    await prisma.searchAnalytics.upsert({
      where: { period },
      create: {
        period,
        totalSearches: metrics.totalSearches,
        uniqueQueries: metrics.uniqueQueries,
        avgResultCount: metrics.avgResultCount,
        clickThroughRate: metrics.clickThroughRate,
        helpfulRate: metrics.helpfulRate,
        topQueries: JSON.stringify(topQueries),
        topArticles: JSON.stringify(topArticlesData),
        noResultsCount: Math.round(
          metrics.totalSearches * (metrics.noResultsRate / 100)
        ),
      },
      update: {
        totalSearches: metrics.totalSearches,
        uniqueQueries: metrics.uniqueQueries,
        avgResultCount: metrics.avgResultCount,
        clickThroughRate: metrics.clickThroughRate,
        helpfulRate: metrics.helpfulRate,
        topQueries: JSON.stringify(topQueries),
        topArticles: JSON.stringify(topArticlesData),
        noResultsCount: Math.round(
          metrics.totalSearches * (metrics.noResultsRate / 100)
        ),
      },
    });
  } catch (error) {
    throw AppError.internal(
      `Failed to aggregate monthly analytics: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get content gaps - unanswered questions
 */
export async function getContentGaps(minSearchCount: number = 3) {
  try {
    const gaps = await prisma.searchLog.groupBy({
      by: ["query"],
      where: {
        resultsCount: 0,
      },
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gte: minSearchCount,
          },
        },
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: 30,
    });

    return gaps.map((gap) => ({
      query: gap.query,
      failedSearchCount: gap._count.id,
    }));
  } catch (error) {
    throw AppError.internal(
      `Failed to get content gaps: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Calculate content health score (0-100)
 */
export async function calculateContentHealthScore(): Promise<number> {
  try {
    const metrics = await prisma.contentMetrics.findMany({});

    if (metrics.length === 0) return 0;

    let score = 0;

    // Coverage score (articles with metrics)
    score += Math.min((metrics.length / 100) * 25, 25);

    // Average view count
    const avgViews = metrics.reduce((sum, m) => sum + m.viewCount, 0) / metrics.length;
    score += Math.min((avgViews / 1000) * 25, 25);

    // Helpful ratio
    const avgHelpful = metrics.reduce((sum, m) => sum + m.helpfulRatio, 0) / metrics.length;
    score += avgHelpful * 25;

    // Engagement (time spent + clicks)
    const avgEngagement = metrics.reduce((sum, m) => sum + m.avgTimeSpent + m.clickCount, 0) / metrics.length;
    score += Math.min((avgEngagement / 500) * 25, 25);

    return Math.round(score);
  } catch (error) {
    throw AppError.internal(
      `Failed to calculate health score: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get quarterly analytics report
 */
export async function getQuarterlyReport(year: number, quarter: number) {
  try {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;

    const startDate = new Date(year, startMonth - 1, 1);
    const endDate = new Date(year, endMonth, 0, 23, 59, 59);

    const metrics = await calculateSearchMetrics(startDate, endDate);
    const topSearches = await getTopSearches(startDate, endDate, 10);
    const popularArticles = await getPopularArticles(startDate, endDate, 10);
    const gaps = await getContentGaps(2);
    const healthScore = await calculateContentHealthScore();

    return {
      period: `Q${quarter} ${year}`,
      metrics,
      topSearches,
      popularArticles,
      contentGaps: gaps.slice(0, 5),
      healthScore,
    };
  } catch (error) {
    throw AppError.internal(
      `Failed to generate quarterly report: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
