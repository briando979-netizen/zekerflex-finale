import { prisma } from "@/lib/prisma";

export interface KbArticle {
  title: string;
  content: string;
  category: string;
  tags: string[];
  published: boolean;
}

export async function createArticle(
  tenantId: string,
  data: KbArticle,
  authorId: string
) {
  return prisma.supportKbArticle.create({
    data: {
      tenantId,
      title: data.title,
      content: data.content,
      category: data.category,
      tags: { set: data.tags },
      published: data.published,
      authorId,
      slug: slugify(data.title),
      views: 0,
    },
  });
}

export async function updateArticle(
  articleId: string,
  data: Partial<KbArticle>
) {
  const updates: any = {};
  if (data.title) {
    updates.title = data.title;
    updates.slug = slugify(data.title);
  }
  if (data.content) updates.content = data.content;
  if (data.category) updates.category = data.category;
  if (data.tags) updates.tags = { set: data.tags };
  if (data.published !== undefined) updates.published = data.published;

  updates.updatedAt = new Date();

  return prisma.supportKbArticle.update({
    where: { id: articleId },
    data: updates,
  });
}

export async function searchArticles(
  tenantId: string,
  query: string,
  published: boolean = true
) {
  const articles = await prisma.supportKbArticle.findMany({
    where: {
      tenantId,
      published,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
        { tags: { hasSome: [query] } },
      ],
    },
    orderBy: { views: "desc" },
  });

  return articles;
}

export async function getRelatedArticles(
  articleId: string,
  limit: number = 5
) {
  const article = await prisma.supportKbArticle.findUnique({
    where: { id: articleId },
  });

  if (!article) return [];

  return prisma.supportKbArticle.findMany({
    where: {
      tenantId: article.tenantId,
      id: { not: articleId },
      published: true,
      OR: [
        { category: article.category },
        { tags: { hasSome: article.tags as string[] } },
      ],
    },
    orderBy: { views: "desc" },
    take: limit,
  });
}

export async function getPopularArticles(
  tenantId: string,
  limit: number = 10
) {
  return prisma.supportKbArticle.findMany({
    where: { tenantId, published: true },
    orderBy: { views: "desc" },
    take: limit,
  });
}

export async function recordArticleView(articleId: string) {
  return prisma.supportKbArticle.update({
    where: { id: articleId },
    data: { views: { increment: 1 } },
  });
}

export async function getArticlesByCategory(
  tenantId: string,
  category: string
) {
  return prisma.supportKbArticle.findMany({
    where: { tenantId, category, published: true },
    orderBy: { views: "desc" },
  });
}

export async function deleteArticle(articleId: string) {
  return prisma.supportKbArticle.delete({ where: { id: articleId } });
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
