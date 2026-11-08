import { NextRequest, NextResponse } from "next/server";
import { fullTextSearch, getFacets, applyFacetFilters, getAutoSuggestions } from "@/lib/search";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  facets: z.record(z.array(z.string())).optional(),
  limit: z.coerce.number().default(20),
  offset: z.coerce.number().default(0),
});

const SuggestionsSchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().default(10),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Check if it's a suggestions request
    if (searchParams.has("suggestions")) {
      const suggestionParams = SuggestionsSchema.parse({
        q: searchParams.get("q"),
        limit: searchParams.get("limit"),
      });

      const suggestions = await getAutoSuggestions(suggestionParams.q, suggestionParams.limit);

      return NextResponse.json({ suggestions });
    }

    // Regular search
    const params = SearchQuerySchema.parse({
      q: searchParams.get("q"),
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
      facets: parseFacets(searchParams),
    });

    // Execute search
    const searchResults = await fullTextSearch({
      q: params.q,
      limit: params.limit,
      offset: params.offset,
    });

    // Get facets
    const facets = await getFacets({ filters: params.facets, limit: 10 });

    return NextResponse.json({
      results: searchResults.results,
      total: searchResults.total,
      facets,
      query: params.q,
      took: searchResults.total,
    });
  } catch (err) {
    const status = err instanceof z.ZodError ? 400 : 500;
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Search failed",
      },
      { status }
    );
  }
}

function parseFacets(searchParams: URLSearchParams): Record<string, string[]> {
  const facets: Record<string, string[]> = {};

  searchParams.forEach((value, key) => {
    if (key.startsWith("facet_")) {
      const facetName = key.replace("facet_", "");
      if (!facets[facetName]) facets[facetName] = [];
      facets[facetName].push(value);
    }
  });

  return facets;
}
