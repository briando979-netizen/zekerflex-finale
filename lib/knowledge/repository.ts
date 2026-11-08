import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { KnowledgeArticle } from "@prisma/client";

/**
 * Knowledge Repository - Pillar 1
 * Centralized storage for docs, wikis, FAQs, procedures, policies with version control
 */

export interface CreateArticleInput {
  title: string;
  content: string;
  description?: string;
  contentType: "wiki" | "faq" | "procedure" | "policy" | "guide";
  category?: string;
  tags?: string[];
  keywords?: string[];
  audience?: string[];
  isInternal?: boolean;
  createdBy: string;
}

export interface UpdateArticleInput {
  title?: string;
  content?: string;
  description?: string;
  category?: string;
  tags?: string[];
  keywords?: string[];
  audience?: string[];
  status?: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
  updatedBy: string;
}

/**
 * Create a new knowledge article with version control
 */
export async function createArticle(input: CreateArticleInput): Promise<KnowledgeArticle> {
  try {
    const article = await prisma.knowledgeArticle.create({
      data: {
        title: input.title,
        content: input.content,
        description: input.description,
        contentType: input.contentType,
        category: input.category,
        tags: input.tags || [],
        keywords: input.keywords || [],
        audience: input.audience || ["public"],
        isInternal: input.isInternal || false,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
        status: "DRAFT",
        version: 1,
      },
    });

    // Create metrics entry
    await prisma.contentMetrics.create({
      data: {
        articleId: article.id,
        viewCount: 0,
        searchCount: 0,
      },
    });

    return article;
  } catch (error) {
    throw AppError.internal(
      `Failed to create knowledge article: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update an article and maintain version history
 */
export async function updateArticle(
  id: string,
  input: UpdateArticleInput
): Promise<KnowledgeArticle> {
  try {
    const existing = await prisma.knowledgeArticle.findUnique({
      where: { id },
    });

    if (!existing) {
      throw AppError.notFound(`Article ${id} not found`);
    }

    // Create new version
    const updatedArticle = await prisma.knowledgeArticle.create({
      data: {
        title: input.title ?? existing.title,
        content: input.content ?? existing.content,
        description: input.description ?? existing.description,
        contentType: existing.contentType,
        category: input.category ?? existing.category,
        tags: input.tags ?? existing.tags,
        keywords: input.keywords ?? existing.keywords,
        audience: input.audience ?? existing.audience,
        isInternal: existing.isInternal,
        createdBy: existing.createdBy,
        updatedBy: input.updatedBy,
        status: input.status ?? existing.status,
        version: existing.version + 1,
        previousId: existing.id,
      },
    });

    return updatedArticle;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Failed to update article: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Publish an article
 */
export async function publishArticle(id: string, publishedBy: string): Promise<KnowledgeArticle> {
  try {
    const article = await prisma.knowledgeArticle.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        updatedBy: publishedBy,
      },
    });

    return article;
  } catch (error) {
    throw AppError.internal(
      `Failed to publish article: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get article with version history
 */
export async function getArticleWithHistory(id: string) {
  try {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { version: "desc" },
        },
        metrics: true,
      },
    });

    if (!article) {
      throw AppError.notFound(`Article ${id} not found`);
    }

    return article;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Failed to fetch article: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * List articles by status, category, or audience
 */
export async function listArticles(filters?: {
  status?: string;
  category?: string;
  contentType?: string;
  audience?: string;
  isInternal?: boolean;
  limit?: number;
  offset?: number;
}) {
  try {
    const where: Record<string, unknown> = {};

    if (filters?.status) where.status = filters.status;
    if (filters?.category) where.category = filters.category;
    if (filters?.contentType) where.contentType = filters.contentType;
    if (filters?.isInternal !== undefined) where.isInternal = filters.isInternal;
    if (filters?.audience) {
      where.audience = { hasSome: [filters.audience] };
    }

    const articles = await prisma.knowledgeArticle.findMany({
      where,
      include: {
        metrics: true,
      },
      orderBy: { createdAt: "desc" },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });

    const total = await prisma.knowledgeArticle.count({ where });

    return { articles, total };
  } catch (error) {
    throw AppError.internal(
      `Failed to list articles: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Archive an article
 */
export async function archiveArticle(id: string, archivedBy: string): Promise<KnowledgeArticle> {
  try {
    const article = await prisma.knowledgeArticle.update({
      where: { id },
      data: {
        status: "ARCHIVED",
        updatedBy: archivedBy,
      },
    });

    return article;
  } catch (error) {
    throw AppError.internal(
      `Failed to archive article: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete article permanently (soft delete via archiving recommended)
 */
export async function deleteArticle(id: string): Promise<void> {
  try {
    // Delete related data
    await prisma.contentIntegration.deleteMany({
      where: { articleId: id },
    });

    await prisma.contentMetrics.deleteMany({
      where: { articleId: id },
    });

    await prisma.curationWorkflowItem.deleteMany({
      where: { articleId: id },
    });

    await prisma.searchLog.deleteMany({
      where: { clickedArticle: id },
    });

    // Delete article and its versions
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
    });

    if (article?.previousId) {
      // Delete version chain
      await deleteArticleVersionChain(article.previousId);
    }

    await prisma.knowledgeArticle.deleteMany({
      where: {
        OR: [{ id }, { previousId: id }],
      },
    });
  } catch (error) {
    throw AppError.internal(
      `Failed to delete article: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function deleteArticleVersionChain(articleId: string): Promise<void> {
  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: articleId },
  });

  if (article?.previousId) {
    await deleteArticleVersionChain(article.previousId);
  }

  await prisma.knowledgeArticle.delete({
    where: { id: articleId },
  });
}
