import { prisma } from "@/lib/prisma";
import { Article } from "@prisma/client";
import { z } from "zod";

export const createArticleSchema = z.object({
  tenantId: z.string().cuid(),
  title: z.string().min(3).max(200),
  slug: z.string().min(3).max(100),
  content: z.string().min(20),
  category: z.string(),
  subcategory: z.string().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

export async function createArticle(
  data: z.infer<typeof createArticleSchema>
): Promise<Article> {
  const validated = createArticleSchema.parse(data);

  const article = await prisma.article.create({
    data: {
      ...validated,
      tags: validated.tags || [],
      keywords: validated.keywords || [],
    },
  });

  // Create search index
  const searchText = [
    validated.title,
    validated.content,
    validated.description,
    ...(validated.keywords || []),
  ]
    .filter(Boolean)
    .join(" ");

  await prisma.articleSearchIndex.create({
    data: {
      articleId: article.id,
      tenantId: validated.tenantId,
      searchText,
      wordCount: searchText.split(/\s+/).length,
    },
  });

  return article;
}

// Search articles
export async function searchArticles(
  tenantId: string,
  query: string,
  options: { published?: boolean; category?: string } = {}
) {
  // Full-text search on search index
  const searchResults = await prisma.articleSearchIndex.findMany({
    where: {
      tenantId,
      searchText: {
        search: query,
      },
    },
    include: {
      article: {
        where: {
          published: options.published !== false,
          category: options.category,
        },
      },
    },
    take: 20,
  });

  return searchResults
    .filter((r) => r.article)
    .map((r) => r.article);
}

// List articles
export async function listArticles(
  tenantId: string,
  options: {
    category?: string;
    published?: boolean;
    featured?: boolean;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const {
    category,
    published = true,
    featured,
    page = 1,
    pageSize = 20,
  } = options;

  const where: any = { tenantId, published };
  if (category) where.category = category;
  if (featured !== undefined) where.featured = featured;

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.article.count({ where }),
  ]);

  return {
    articles,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Get article by slug
export async function getArticleBySlug(
  tenantId: string,
  slug: string
): Promise<Article | null> {
  const article = await prisma.article.findFirst({
    where: {
      tenantId,
      slug,
    },
  });

  if (article) {
    // Increment views
    await prisma.article.update({
      where: { id: article.id },
      data: { views: article.views + 1 },
    });
  }

  return article;
}

// Get article by ID
export async function getArticle(
  id: string,
  tenantId: string
): Promise<Article | null> {
  const article = await prisma.article.findUnique({
    where: { id },
  });

  if (!article || article.tenantId !== tenantId) return null;

  // Increment views
  await prisma.article.update({
    where: { id },
    data: { views: article.views + 1 },
  });

  return article;
}

// Update article
export async function updateArticle(
  id: string,
  tenantId: string,
  data: Partial<z.infer<typeof createArticleSchema>>
): Promise<Article> {
  const article = await prisma.article.findUnique({
    where: { id },
  });

  if (!article || article.tenantId !== tenantId) {
    throw new Error("Article not found");
  }

  const updated = await prisma.article.update({
    where: { id },
    data: {
      title: data.title,
      content: data.content,
      category: data.category,
      subcategory: data.subcategory,
      tags: data.tags,
      description: data.description,
      keywords: data.keywords,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
    },
  });

  // Update search index
  if (data.content || data.title || data.description) {
    const searchText = [
      data.title || article.title,
      data.content || article.content,
      data.description || article.description,
      ...(data.keywords || article.keywords),
    ]
      .filter(Boolean)
      .join(" ");

    await prisma.articleSearchIndex.update({
      where: { articleId: id },
      data: {
        searchText,
        wordCount: searchText.split(/\s+/).length,
      },
    });
  }

  return updated;
}

// Delete article
export async function deleteArticle(
  id: string,
  tenantId: string
): Promise<void> {
  const article = await prisma.article.findUnique({
    where: { id },
  });

  if (!article || article.tenantId !== tenantId) {
    throw new Error("Article not found");
  }

  await prisma.articleSearchIndex.deleteMany({
    where: { articleId: id },
  });

  await prisma.article.delete({
    where: { id },
  });
}

// Publish article
export async function publishArticle(
  id: string,
  tenantId: string
): Promise<Article> {
  const article = await prisma.article.findUnique({
    where: { id },
  });

  if (!article || article.tenantId !== tenantId) {
    throw new Error("Article not found");
  }

  return prisma.article.update({
    where: { id },
    data: {
      published: true,
      publishedAt: new Date(),
    },
  });
}

// Get categories
export async function getCategories(tenantId: string): Promise<string[]> {
  const articles = await prisma.article.findMany({
    where: { tenantId, published: true },
    distinct: ["category"],
    select: { category: true },
  });

  return articles.map((a) => a.category).filter(Boolean);
}

// Mark article as helpful
export async function markHelpful(
  id: string,
  tenantId: string,
  helpful: boolean
): Promise<Article> {
  const article = await prisma.article.findUnique({
    where: { id },
  });

  if (!article || article.tenantId !== tenantId) {
    throw new Error("Article not found");
  }

  return prisma.article.update({
    where: { id },
    data: {
      helpfulCount: helpful ? article.helpfulCount + 1 : article.helpfulCount,
      unhelpfulCount: !helpful
        ? article.unhelpfulCount + 1
        : article.unhelpfulCount,
    },
  });
}

// Get related articles
export async function getRelatedArticles(
  id: string,
  tenantId: string,
  limit = 5
): Promise<Article[]> {
  const article = await prisma.article.findUnique({
    where: { id },
  });

  if (!article || article.tenantId !== tenantId) return [];

  return prisma.article.findMany({
    where: {
      tenantId,
      published: true,
      OR: [
        { category: article.category },
        { tags: { hasSome: article.tags } },
      ],
      NOT: { id },
    },
    take: limit,
  });
}
