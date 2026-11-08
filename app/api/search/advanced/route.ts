import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const body = await request.json();

    const {
      query,
      type,
      filters,
      sort,
      page = 1,
      limit = 20,
    } = body;

    let results: any[] = [];

    if (type === "users") {
      results = await searchUsers(query, filters);
    } else if (type === "products") {
      results = await searchProducts(query, filters);
    } else if (type === "companies") {
      results = await searchCompanies(query, filters);
    } else if (type === "shifts") {
      results = await searchShifts(query, filters);
    }

    const sorted = sortResults(results, sort);
    const paginated = sorted.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      results: paginated,
      total: results.length,
      page,
      limit,
      hasMore: page * limit < results.length,
    });
  } catch (err) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

async function searchUsers(query: string, filters: any) {
  return await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 100,
  });
}

async function searchProducts(query: string, filters: any) {
  return await prisma.product.findMany({
    where: {
      naam: { contains: query, mode: "insensitive" },
      ...(filters?.categorie && { categorie: filters.categorie }),
      ...(filters?.minPrice && { prijsCent: { gte: filters.minPrice * 100 } }),
      ...(filters?.maxPrice && { prijsCent: { lte: filters.maxPrice * 100 } }),
    },
    take: 100,
  });
}

async function searchCompanies(query: string, filters: any) {
  return await prisma.tenant.findMany({
    where: {
      naam: { contains: query, mode: "insensitive" },
    },
    take: 100,
  });
}

async function searchShifts(query: string, filters: any) {
  return await prisma.shift.findMany({
    where: {
      title: { contains: query, mode: "insensitive" },
    },
    take: 100,
  });
}

function sortResults(results: any[], sort?: any): any[] {
  if (!sort) return results;

  if (sort.field === "relevance") {
    return results.sort((a, b) => b.score - a.score);
  } else if (sort.field === "date") {
    return results.sort((a, b) =>
      sort.order === "desc"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  return results;
}
