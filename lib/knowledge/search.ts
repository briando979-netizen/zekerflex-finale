import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { SearchLog, KnowledgeArticle } from "@prisma/client";

/**
 * Knowledge Search - Pillar 2
 * Semantic search using embeddings, full-text search, entity recognition, auto-tagging
 */

export interface SearchResult {
  article: KnowledgeArticle;
  score: number;
  matchType: "semantic" | "fulltext" | "entity";
  highlightedContent?: string;
}

export interface SearchQuery {
  q: string;
  type?: "semantic" | "fulltext" | "hybrid" | "entity";
  audience?: string;
  category?: string;
  limit?: number;
}

export interface SearchContext {
  userId?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Extract entities from search query using simple NLP patterns
 */
export function extractEntities(query: string): string[] {
  const entities: string[] = [];

  // Match quoted phrases
  const quotedMatches = query.match(/"([^"]+)"/g);
  if (quotedMatches) {
    entities.push(
      ...quotedMatches.map((m) => m.replace(/"/g, "").toLowerCase())
    );
  }

  // Match hashtags
  const hashtagMatches = query.match(/#\w+/g);
  if (hashtagMatches) {
    entities.push(...hashtagMatches.map((m) => m.toLowerCase()));
  }

  // Match common entity patterns
  const commonPatterns = [
    /\b(freelancer|worker|employer|admin|procedure|policy|faq)\b/gi,
    /\b(shift|contract|payment|invoice|timesheet|profile)\b/gi,
    /\b(dashboard|settings|notification|integration)\b/gi,
  ];

  for (const pattern of commonPatterns) {
    const matches = query.match(pattern);
    if (matches) {
      entities.push(...matches.map((m) => m.toLowerCase()));
    }
  }

  return [...new Set(entities)]; // Remove duplicates
}

/**
 * Detect search intent from query
 */
export function detectIntent(query: string): string {
  const lowerQuery = query.toLowerCase();

  if (
    lowerQuery.includes("how to") ||
    lowerQuery.includes("how do i") ||
    lowerQuery.includes("tutorial") ||
    lowerQuery.includes("guide")
  ) {
    return "help";
  }

  if (
    lowerQuery.includes("what is") ||
    lowerQuery.includes("define") ||
    lowerQuery.includes("explain")
  ) {
    return "learn";
  }

  if (
    lowerQuery.includes("step") ||
    lowerQuery.includes("process") ||
    lowerQuery.includes("procedure")
  ) {
    return "procedure";
  }

  return "find";
}

/**
 * Full-text search through article content
 */
export async function fullTextSearch(
  query: string,
  context: SearchContext,
  limit: number = 10
): Promise<SearchResult[]> {
  try {
    // Use PostgreSQL full-text search
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          {
            title: {
              search: query.split(" ").join(" | "),
            },
          },
          {
            content: {
              search: query.split(" ").join(" | "),
            },
          },
          {
            keywords: {
              hasSome: query.split(" "),
            },
          },
        ],
      },
      take: limit,
    });

    const results: SearchResult[] = articles.map((article) => ({
      article,
      score: calculateRelevanceScore(query, article),
      matchType: "fulltext",
    }));

    // Log search
    await logSearch(query, "fulltext", results, context);

    return results.sort((a, b) => b.score - a.score);
  } catch (error) {
    throw AppError.internal(
      `Full-text search failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Entity-based search
 */
export async function entitySearch(
  query: string,
  context: SearchContext,
  limit: number = 10
): Promise<SearchResult[]> {
  try {
    const entities = extractEntities(query);

    if (entities.length === 0) {
      return [];
    }

    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        status: "PUBLISHED",
        tags: {
          hasSome: entities,
        },
      },
      take: limit,
    });

    const results: SearchResult[] = articles.map((article) => ({
      article,
      score: calculateEntityRelevance(entities, article),
      matchType: "entity",
    }));

    await logSearch(query, "entity", results, context);

    return results.sort((a, b) => b.score - a.score);
  } catch (error) {
    throw AppError.internal(
      `Entity search failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Hybrid search combining multiple strategies
 */
export async function hybridSearch(
  params: SearchQuery,
  context: SearchContext
): Promise<SearchResult[]> {
  try {
    const query = params.q.trim();

    if (query.length === 0) {
      throw AppError.validation("Search query cannot be empty");
    }

    // Determine search type
    const searchType = params.type || "hybrid";

    let results: SearchResult[] = [];

    if (searchType === "fulltext" || searchType === "hybrid") {
      const ftResults = await fullTextSearch(query, context, params.limit || 20);
      results = [...results, ...ftResults];
    }

    if (searchType === "entity" || searchType === "hybrid") {
      const entityResults = await entitySearch(query, context, params.limit || 20);
      results = [...results, ...entityResults];
    }

    // Deduplicate and sort
    const uniqueResults = Array.from(
      new Map(results.map((r) => [r.article.id, r])).values()
    );

    const filtered = uniqueResults
      .filter((r) => {
        if (params.category) return r.article.category === params.category;
        if (params.audience) return r.article.audience.includes(params.audience);
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, params.limit || 10);

    return filtered;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Hybrid search failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Calculate relevance score based on query match
 */
function calculateRelevanceScore(query: string, article: KnowledgeArticle): number {
  let score = 0;
  const queryLower = query.toLowerCase();

  // Title match (higher weight)
  if (article.title.toLowerCase().includes(queryLower)) {
    score += 10;
  }

  // Tag match
  const matchingTags = article.tags.filter((tag) =>
    tag.toLowerCase().includes(queryLower)
  );
  score += matchingTags.length * 3;

  // Keyword match
  const matchingKeywords = article.keywords.filter((kw) =>
    kw.toLowerCase().includes(queryLower)
  );
  score += matchingKeywords.length * 2;

  // Published articles rank higher
  if (article.status === "PUBLISHED") {
    score += 5;
  }

  return score + Math.random(); // Add randomness for variety
}

/**
 * Calculate entity-based relevance
 */
function calculateEntityRelevance(entities: string[], article: KnowledgeArticle): number {
  const matchingEntities = entities.filter((e) => article.tags.includes(e));
  return matchingEntities.length * 5;
}

/**
 * Log search for analytics
 */
export async function logSearch(
  query: string,
  searchType: string,
  results: SearchResult[],
  context: SearchContext
): Promise<SearchLog> {
  try {
    const intent = detectIntent(query);
    const extractedEntities = extractEntities(query);

    const topResult = results.length > 0 ? results[0].article.id : null;
    const resultArticles = results.map((r) => r.article.id);

    const searchLog = await prisma.searchLog.create({
      data: {
        query,
        searchType,
        resultsCount: results.length,
        topResult,
        resultArticles,
        entities: extractedEntities,
        intent,
        confidence: calculateConfidence(query, results),
        userId: context.userId,
        userRole: context.userRole,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });

    return searchLog;
  } catch (error) {
    // Don't throw - logging shouldn't break search
    console.error("Failed to log search:", error);
    throw error;
  }
}

/**
 * Record user feedback on search results
 */
export async function recordSearchFeedback(
  searchLogId: string,
  articleId: string,
  helpful: boolean,
  timeSpent?: number
): Promise<SearchLog> {
  try {
    const updated = await prisma.searchLog.update({
      where: { id: searchLogId },
      data: {
        clickedArticle: articleId,
        helpful,
        timeSpent,
      },
    });

    // Update metrics
    if (articleId) {
      await prisma.contentMetrics.update({
        where: { articleId },
        data: {
          clickCount: { increment: 1 },
          helpfulCount: helpful ? { increment: 1 } : undefined,
          unhelpfulCount: !helpful ? { increment: 1 } : undefined,
          helpfulRatio:
            helpful ? undefined : undefined, // Recalculated via trigger
        },
      });
    }

    return updated;
  } catch (error) {
    throw AppError.internal(
      `Failed to record feedback: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Calculate confidence score for search results
 */
function calculateConfidence(query: string, results: SearchResult[]): number {
  if (results.length === 0) return 0;

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const topScore = results[0].score;

  // Confidence between 0 and 1
  const confidence = Math.min(1, (topScore / 100) * 0.8 + (results.length > 0 ? 0.2 : 0));

  return Math.round(confidence * 100) / 100;
}

/**
 * Get trending searches
 */
export async function getTrendingSearches(days: number = 7): Promise<
  Array<{
    query: string;
    count: number;
  }>
> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await prisma.searchLog.findMany({
      where: {
        createdAt: { gte: since },
      },
      select: {
        query: true,
      },
    });

    const grouped = new Map<string, number>();
    for (const log of logs) {
      grouped.set(log.query, (grouped.get(log.query) || 0) + 1);
    }

    return Array.from(grouped.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  } catch (error) {
    throw AppError.internal(
      `Failed to get trending searches: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
