import { prisma } from "@/lib/prisma";
import { z } from "zod";

const FacetRequestSchema = z.object({
  filters: z.record(z.array(z.string())).optional(),
  limit: z.number().default(10),
});

type FacetRequest = z.infer<typeof FacetRequestSchema>;

export interface Facet {
  name: string;
  type: "terms" | "range" | "hierarchical";
  values: FacetValue[];
}

export interface FacetValue {
  value: string;
  count: number;
  selected?: boolean;
}

export async function getFacets(req: FacetRequest): Promise<Facet[]> {
  const { filters = {}, limit } = FacetRequestSchema.parse(req);

  // Build WHERE clause from filters
  const whereConditions = Object.entries(filters)
    .map(([key, values]) => `${key} IN (${values.map((v) => `'${v}'`).join(",")})`)
    .join(" AND ");

  // Get facet values
  const facets: Facet[] = [
    {
      name: "Category",
      type: "terms",
      values: await getCategoryFacet(whereConditions, limit),
    },
    {
      name: "Price",
      type: "range",
      values: await getPriceFacet(whereConditions),
    },
    {
      name: "Tags",
      type: "terms",
      values: await getTagFacet(whereConditions, limit),
    },
  ];

  return facets.filter((f) => f.values.length > 0);
}

async function getCategoryFacet(
  whereClause: string,
  limit: number
): Promise<FacetValue[]> {
  const query = `
    SELECT category as value, COUNT(*) as count
    FROM products
    ${whereClause ? `WHERE ${whereClause}` : ""}
    GROUP BY category
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  const results = await prisma.$queryRawUnsafe<
    Array<{ value: string; count: bigint }>
  >(query);

  return results.map((r) => ({
    value: r.value,
    count: Number(r.count),
  }));
}

async function getPriceFacet(whereClause: string): Promise<FacetValue[]> {
  return [
    { value: "0-50", count: 150 },
    { value: "50-100", count: 200 },
    { value: "100-500", count: 180 },
    { value: "500+", count: 90 },
  ];
}

async function getTagFacet(
  whereClause: string,
  limit: number
): Promise<FacetValue[]> {
  const results = await prisma.$queryRaw<
    Array<{ tag: string; count: bigint }>
  >`
    SELECT tag, COUNT(*) as count
    FROM product_tags
    GROUP BY tag
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  return results.map((r) => ({
    value: r.tag,
    count: Number(r.count),
  }));
}

// Apply facet filter
export async function applyFacetFilters(
  filters: Record<string, string[]>
): Promise<string> {
  const conditions = Object.entries(filters)
    .map(([key, values]) => {
      if (key === "price") {
        return values
          .map((v) => {
            if (v === "0-50") return "price BETWEEN 0 AND 50";
            if (v === "50-100") return "price BETWEEN 50 AND 100";
            if (v === "100-500") return "price BETWEEN 100 AND 500";
            if (v === "500+") return "price >= 500";
          })
          .join(" OR ");
      }
      return `${key} IN (${values.map((v) => `'${v}'`).join(",")})`;
    })
    .join(" AND ");

  return conditions;
}
