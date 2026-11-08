import { prisma } from "@/lib/prisma";
import { z } from "zod";

const searchQuerySchema = z.object({
  query: z.string().min(1),
  type: z.enum(["full-text", "metadata", "tags", "ocr"]).optional(),
  folderId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(["relevance", "recent", "name"]).default("relevance"),
});

type SearchQuery = z.infer<typeof searchQuerySchema>;

export async function searchFullText(
  tenantId: string,
  query: SearchQuery
) {
  const validated = searchQuerySchema.parse(query);
  const terms = validated.query.toLowerCase().split(/\s+/);

  const results = await prisma.document.findMany({
    where: {
      tenantId,
      folderId: validated.folderId,
      createdAt: {
        gte: validated.dateFrom,
        lte: validated.dateTo,
      },
      OR: [
        { name: { contains: validated.query, mode: "insensitive" } },
        { searchIndex: { some: { content: { contains: validated.query } } } },
      ],
    },
    include: { searchIndex: true },
    take: 50,
  });

  // Calculate relevance score
  const scored = results.map((doc) => {
    let score = 0;
    const nameMatches = (doc.name.match(/validated.query/gi) ?? []).length;
    score += nameMatches * 50;

    const contentMatches = doc.searchIndex?.[0]?.content
      ? (doc.searchIndex[0].content.match(/validated.query/gi) ?? []).length
      : 0;
    score += contentMatches * 10;

    return { ...doc, relevance: score };
  });

  return scored.sort((a, b) => b.relevance - a.relevance);
}

export async function searchByMetadata(
  tenantId: string,
  filters: {
    author?: string;
    type?: string;
    size?: { min: number; max: number };
  }
) {
  return prisma.document.findMany({
    where: {
      tenantId,
      uploadedBy: filters.author,
      mimeType: filters.type ? { contains: filters.type } : undefined,
      size: filters.size
        ? {
            gte: filters.size.min,
            lte: filters.size.max,
          }
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function searchByTags(tenantId: string, tags: string[]) {
  return prisma.document.findMany({
    where: {
      tenantId,
      tags: {
        hasSome: tags,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function searchByOCR(tenantId: string, query: string) {
  return prisma.documentSearchIndex.findMany({
    where: {
      content: { contains: query.toLowerCase() },
      document: { tenantId },
    },
    include: { document: true },
    take: 50,
  });
}

export async function addTag(documentId: string, tag: string) {
  return prisma.document.update({
    where: { id: documentId },
    data: {
      tags: {
        push: tag.toLowerCase(),
      },
    },
  });
}

export async function removeTag(documentId: string, tag: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc) return null;

  const updatedTags = (doc.tags ?? []).filter((t) => t !== tag);

  return prisma.document.update({
    where: { id: documentId },
    data: { tags: updatedTags },
  });
}

export async function listTags(tenantId: string) {
  const docs = await prisma.document.findMany({
    where: { tenantId },
    select: { tags: true },
  });

  const tagCounts: Record<string, number> = {};

  for (const doc of docs) {
    for (const tag of doc.tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }

  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function saveSavedSearch(
  tenantId: string,
  userId: string,
  name: string,
  query: SearchQuery
) {
  return prisma.savedSearch.create({
    data: {
      tenantId,
      userId,
      name,
      query: JSON.stringify(query),
    },
  });
}

export async function listSavedSearches(tenantId: string, userId: string) {
  return prisma.savedSearch.findMany({
    where: { tenantId, userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function executeSavedSearch(
  tenantId: string,
  savedSearchId: string
) {
  const saved = await prisma.savedSearch.findUnique({
    where: { id: savedSearchId },
  });

  if (!saved) return [];

  const query = JSON.parse(saved.query) as SearchQuery;
  return searchFullText(tenantId, query);
}
