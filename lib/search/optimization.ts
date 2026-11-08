import { prisma } from "@/lib/prisma";
import { z } from "zod";

const SynonymSchema = z.object({
  term: z.string(),
  synonyms: z.array(z.string()),
});

type Synonym = z.infer<typeof SynonymSchema>;

const QueryBoostSchema = z.object({
  pattern: z.string(),
  boost: z.number().min(0.1).max(10),
  reason: z.string(),
});

type QueryBoost = z.infer<typeof QueryBoostSchema>;

// Synonym management
export async function addSynonym(synonym: Synonym): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO search_synonyms (term, synonyms, created_at)
    VALUES (${synonym.term}, ${JSON.stringify(synonym.synonyms)}, NOW())
    ON CONFLICT (term) DO UPDATE SET synonyms = ${JSON.stringify(synonym.synonyms)}
  `;
}

export async function getSynonyms(term: string): Promise<string[]> {
  const result = await prisma.$queryRaw<
    Array<{ synonyms: string }>
  >`
    SELECT synonyms FROM search_synonyms WHERE term = ${term}
  `;

  if (!result?.[0]?.synonyms) return [];
  return JSON.parse(result[0].synonyms);
}

// Query boost rules
export async function addBoostRule(rule: QueryBoost): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO search_boost_rules (pattern, boost, reason, created_at)
    VALUES (${rule.pattern}, ${rule.boost}, ${rule.reason}, NOW())
  `;
}

export async function getBoostMultiplier(query: string): Promise<number> {
  const results = await prisma.$queryRaw<
    Array<{ boost: number }>
  >`
    SELECT MAX(boost) as boost
    FROM search_boost_rules
    WHERE ${query} ~ pattern
  `;

  return results?.[0]?.boost ?? 1.0;
}

// Result reranking
export interface RankedResult {
  id: string;
  title: string;
  score: number;
  originalRank: number;
  newRank: number;
}

export function rerankeResults(
  results: Array<{ id: string; title: string; score: number }>,
  boostMultiplier: number
): RankedResult[] {
  return results
    .map((r, idx) => ({
      ...r,
      originalRank: idx,
      score: r.score * boostMultiplier,
    }))
    .sort((a, b) => b.score - a.score)
    .map((r, idx) => ({
      ...r,
      newRank: idx,
    }));
}

// Personalization scoring
export async function getPersonalizationBoost(
  userId: string,
  resultId: string
): Promise<number> {
  // Check if user has interacted with this before
  const interaction = await prisma.$queryRaw<
    [{ boost: number }]
  >`
    SELECT COALESCE(COUNT(*) * 0.1, 0) as boost
    FROM user_interactions
    WHERE user_id = ${userId} AND result_id = ${resultId}
    GROUP BY result_id
  `;

  return interaction?.[0]?.boost ?? 0;
}

// A/B testing
export async function createSearchExperiment(
  name: string,
  control: string,
  treatment: string
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO search_experiments (name, control_query, treatment_query, created_at)
    VALUES (${name}, ${control}, ${treatment}, NOW())
  `;
}

export async function getExperimentResults(experimentId: string) {
  return prisma.$queryRaw`
    SELECT control_metrics, treatment_metrics, statistical_significance
    FROM search_experiments
    WHERE id = ${experimentId}
  `;
}

// Performance tuning
export async function getSearchPerformanceMetrics() {
  const metrics = await prisma.$queryRaw<
    Array<{
      avg_query_time: number;
      p95_query_time: number;
      p99_query_time: number;
      queries_per_second: number;
    }>
  >`
    SELECT
      AVG(EXTRACT(EPOCH FROM duration)) * 1000 as avg_query_time,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM duration)) * 1000 as p95_query_time,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM duration)) * 1000 as p99_query_time,
      COUNT(*) / (EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))) as queries_per_second
    FROM search_logs
    WHERE created_at >= NOW() - INTERVAL '1 hour'
  `;

  return metrics?.[0];
}
