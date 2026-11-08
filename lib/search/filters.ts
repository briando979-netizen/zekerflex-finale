import { z } from "zod";

const FilterSchema = z.object({
  price: z.object({ min: z.number(), max: z.number() }).optional(),
  category: z.array(z.string()).optional(),
  dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
  customAttributes: z.record(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

type Filters = z.infer<typeof FilterSchema>;

export function buildFilterQuery(filters: Filters): string {
  const conditions: string[] = [];

  if (filters.price) {
    conditions.push(`price >= ${filters.price.min} AND price <= ${filters.price.max}`);
  }

  if (filters.category && filters.category.length > 0) {
    const cats = filters.category.map((c) => `'${c}'`).join(",");
    conditions.push(`category IN (${cats})`);
  }

  if (filters.dateRange) {
    conditions.push(`created_at >= '${filters.dateRange.start}' AND created_at <= '${filters.dateRange.end}'`);
  }

  if (filters.tags && filters.tags.length > 0) {
    const tags = filters.tags.map((t) => `'${t}'`).join(",");
    conditions.push(`EXISTS (SELECT 1 FROM product_tags WHERE product_id = products.id AND tag IN (${tags}))`);
  }

  if (filters.customAttributes) {
    Object.entries(filters.customAttributes).forEach(([key, value]) => {
      conditions.push(`attributes->>'${key}' = '${value}'`);
    });
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

// Price filter
export function getPriceFilterRanges() {
  return [
    { label: "$0 - $50", min: 0, max: 50 },
    { label: "$50 - $100", min: 50, max: 100 },
    { label: "$100 - $500", min: 100, max: 500 },
    { label: "$500+", min: 500, max: 999999 },
  ];
}

// Category filter
export async function getCategoryFilter(): Promise<{ label: string; value: string; count: number }[]> {
  return [
    { label: "Electronics", value: "electronics", count: 523 },
    { label: "Clothing", value: "clothing", count: 841 },
    { label: "Books", value: "books", count: 312 },
    { label: "Home", value: "home", count: 456 },
  ];
}

// Date range filter
export function getDateRangeFilter() {
  const now = new Date();
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const year = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  return [
    { label: "Last 7 days", start: week, end: now },
    { label: "Last 30 days", start: month, end: now },
    { label: "Last year", start: year, end: now },
  ];
}

// Tag filter
export async function getTagFilter(): Promise<{ label: string; value: string; count: number }[]> {
  return [
    { label: "New", value: "new", count: 234 },
    { label: "Sale", value: "sale", count: 156 },
    { label: "Featured", value: "featured", count: 89 },
    { label: "Trending", value: "trending", count: 203 },
  ];
}

// Custom attribute filter
export function getCustomAttributeFilter(attributeName: string): { label: string; value: string; count: number }[] {
  // Dynamic based on attribute name
  if (attributeName === "brand") {
    return [
      { label: "Apple", value: "apple", count: 120 },
      { label: "Samsung", value: "samsung", count: 95 },
      { label: "Sony", value: "sony", count: 78 },
    ];
  }

  return [];
}
