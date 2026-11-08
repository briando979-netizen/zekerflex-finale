import { prisma } from "@/lib/prisma";

export async function getAutoSuggestions(
  query: string,
  limit: number = 10
): Promise<string[]> {
  if (!query || query.length < 2) return [];

  // Popular queries matching prefix
  const popular = await prisma.$queryRaw<
    Array<{ query: string }>
  >`
    SELECT DISTINCT query
    FROM search_logs
    WHERE query ILIKE ${query + "%"}
    ORDER BY COUNT(*) DESC
    LIMIT ${limit}
  `;

  // Typo corrections
  const corrections = correctCommonTypos(query);

  // Combine and deduplicate
  const suggestions = new Set<string>();
  popular.forEach((p) => suggestions.add(p.query));
  corrections.forEach((c) => suggestions.add(c));

  return Array.from(suggestions).slice(0, limit);
}

function correctCommonTypos(query: string): string[] {
  const corrections: Record<string, string[]> = {
    teh: ["the"],
    recieve: ["receive"],
    occured: ["occurred"],
    seperate: ["separate"],
    wich: ["which", "witch"],
    thier: ["their"],
    teh: ["the"],
  };

  const normalized = query.toLowerCase();
  return corrections[normalized] || [];
}

// Trending suggestions
export async function getTrendingSuggestions(limit: number = 5): Promise<string[]> {
  const trending = await prisma.$queryRaw<
    Array<{ query: string }>
  >`
    SELECT query
    FROM search_logs
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY query
    ORDER BY COUNT(*) DESC
    LIMIT ${limit}
  `;

  return trending.map((t) => t.query);
}

// Personalized suggestions based on user history
export async function getPersonalizedSuggestions(
  userId: string,
  limit: number = 5
): Promise<string[]> {
  const suggestions = await prisma.$queryRaw<
    Array<{ query: string }>
  >`
    SELECT DISTINCT sl.query
    FROM search_logs sl
    WHERE sl.user_id = ${userId}
    ORDER BY sl.created_at DESC
    LIMIT ${limit}
  `;

  return suggestions.map((s) => s.query);
}

// Misspelling correction with confidence
export function correctMisspellings(
  query: string
): { corrected: string; confidence: number } {
  const commonMisspellings: Record<string, { correction: string; confidence: number }> = {
    "iphone": { correction: "iPhone", confidence: 0.95 },
    "sumsung": { correction: "Samsung", confidence: 0.9 },
    "adidas": { correction: "Adidas", confidence: 0.85 },
  };

  const lower = query.toLowerCase();
  if (commonMisspellings[lower]) {
    return {
      corrected: commonMisspellings[lower].correction,
      confidence: commonMisspellings[lower].confidence,
    };
  }

  return { corrected: query, confidence: 1.0 };
}
