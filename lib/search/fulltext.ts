import { prisma } from "@/lib/prisma";
import { z } from "zod";

const QuerySchema = z.object({
  q: z.string().min(1),
  limit: z.number().default(20),
  offset: z.number().default(0),
});

type Query = z.infer<typeof QuerySchema>;

// Elasticsearch-ready full-text search
export async function fullTextSearch(query: Query) {
  const { q, limit, offset } = QuerySchema.parse(query);

  // Normalize query: stemming, typo correction
  const normalized = normalizeQuery(q);
  const corrected = correctTypos(normalized);

  // Search across indexed content
  const results = await prisma.$queryRaw`
    SELECT id, title, description, content, type, score
    FROM search_index
    WHERE
      to_tsvector('english', title) @@ plainto_tsquery('english', ${corrected})
      OR to_tsvector('english', description) @@ plainto_tsquery('english', ${corrected})
    ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${corrected})) DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return {
    results: results as SearchResult[],
    total: await countSearchResults(corrected),
    query: corrected,
  };
}

interface SearchResult {
  id: string;
  title: string;
  description: string;
  type: string;
  score: number;
}

function normalizeQuery(q: string): string {
  // Stemming: remove common suffixes
  return q
    .toLowerCase()
    .replace(/ing\b/g, "")
    .replace(/ed\b/g, "")
    .replace(/s\b/g, "");
}

function correctTypos(q: string): string {
  // Simple typo correction: common misspellings
  const corrections: Record<string, string> = {
    teh: "the",
    recieve: "receive",
    occured: "occurred",
  };

  let corrected = q;
  Object.entries(corrections).forEach(([wrong, right]) => {
    corrected = corrected.replace(new RegExp(`\\b${wrong}\\b`, "gi"), right);
  });

  return corrected;
}

async function countSearchResults(query: string): Promise<number> {
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM search_index
    WHERE
      to_tsvector('english', title) @@ plainto_tsquery('english', ${query})
      OR to_tsvector('english', description) @@ plainto_tsquery('english', ${query})
  `;

  return Number(result?.[0]?.count ?? 0);
}
