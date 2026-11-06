// Search and discovery

export interface SearchResult {
  productId: string;
  name: string;
  relevance: number; // 0-100
  rating?: number;
  price: number;
}

export interface SearchFilters {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  rating?: number; // minimum rating
  inStock?: boolean;
  sortBy?: "relevance" | "price_low" | "price_high" | "rating" | "newest";
}

export async function searchProducts(
  query: string,
  filters?: SearchFilters,
  limit: number = 20
): Promise<SearchResult[]> {
  // TODO: Full-text search with filters
  // In production: use Elasticsearch, Algolia, or similar
  return [];
}

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export function calculateRelevance(product: any, tokens: string[]): number {
  let score = 0;

  // Name match (highest weight)
  const name = product.name.toLowerCase();
  tokens.forEach((token) => {
    if (name.includes(token)) score += 30;
    if (name.startsWith(token)) score += 10;
  });

  // Description match
  const desc = (product.description || "").toLowerCase();
  tokens.forEach((token) => {
    if (desc.includes(token)) score += 10;
  });

  // Category match
  if (product.category && tokens.some((t) => product.category.toLowerCase().includes(t))) {
    score += 15;
  }

  return Math.min(100, score);
}

export const POPULAR_SEARCHES = [
  "werkschoenen",
  "veiligheidsuitrusting",
  "flexwerk gereedschap",
  "work wear",
  "safety gear",
];
