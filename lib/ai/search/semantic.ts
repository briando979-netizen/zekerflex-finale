import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/ops/logger";

interface SearchResult {
  id: string;
  title: string;
  relevance: number;
  snippet: string;
}

export async function semanticSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
  try {
    // Tokenize and normalize query
    const normalized = normalizeQuery(query);
    const tokens = tokenize(normalized);

    // Spell correction
    const corrected = await spellCorrect(tokens);

    // Synonym expansion
    const expanded = await expandSynonyms(corrected);

    // Search across multiple indices
    const shifts = await searchShifts(expanded, limit);
    const users = await searchUsers(expanded, limit);
    const posts = await searchPosts(expanded, limit);

    const results = [
      ...shifts.map(s => ({ id: s.id, title: s.title, relevance: s.relevance, snippet: s.description })),
      ...users.map(u => ({ id: u.id, title: u.name, relevance: u.relevance, snippet: u.bio || "" })),
      ...posts.map(p => ({ id: p.id, title: p.title, relevance: p.relevance, snippet: p.content })),
    ];

    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  } catch (err) {
    logger.error("Semantic search failed", { query, err });
    throw err;
  }
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/[^\w\s]/g, "");
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(t => t.length > 0);
}

async function spellCorrect(tokens: string[]): Promise<string[]> {
  return tokens.map(token => {
    const commonMisspellings: Record<string, string> = {
      "restaurent": "restaurant",
      "flexwork": "flex work",
      "gig": "gig work",
    };
    return commonMisspellings[token] || token;
  });
}

async function expandSynonyms(tokens: string[]): Promise<string[]> {
  const synonyms: Record<string, string[]> = {
    "job": ["klus", "work", "assignment"],
    "worker": ["freelancer", "flex", "werker"],
    "restaurant": ["horeca", "cafe", "eatery"],
  };

  let expanded = [...tokens];
  for (const token of tokens) {
    if (synonyms[token]) {
      expanded = [...expanded, ...synonyms[token]];
    }
  }
  return expanded;
}

async function searchShifts(tokens: string[], limit: number): Promise<any[]> {
  const shifts = await prisma.shift.findMany({
    where: {
      OR: tokens.map(token => ({
        OR: [
          { title: { contains: token, mode: "insensitive" } },
          { description: { contains: token, mode: "insensitive" } },
        ],
      })),
    },
    take: limit,
  });

  return shifts.map(s => ({
    ...s,
    relevance: tokens.filter(t => s.title.toLowerCase().includes(t) || s.description?.toLowerCase().includes(t)).length / tokens.length,
  }));
}

async function searchUsers(tokens: string[], limit: number): Promise<any[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: tokens.map(token => ({
        OR: [
          { name: { contains: token, mode: "insensitive" } },
          { bio: { contains: token, mode: "insensitive" } },
        ],
      })),
    },
    take: limit,
  });

  return users.map(u => ({
    ...u,
    relevance: tokens.filter(t => u.name?.toLowerCase().includes(t) || u.bio?.toLowerCase().includes(t)).length / tokens.length,
  }));
}

async function searchPosts(tokens: string[], limit: number): Promise<any[]> {
  return [];
}

export function autoSuggest(prefix: string): string[] {
  const commonSearches = [
    "restaurants near me",
    "flex work opportunities",
    "gig jobs today",
    "delivery shifts",
    "food service jobs",
  ];

  return commonSearches.filter(s => s.toLowerCase().startsWith(prefix.toLowerCase()));
}
