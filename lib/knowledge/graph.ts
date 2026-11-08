import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { EntityRelation, KnowledgeEntity } from "@prisma/client";

/**
 * Knowledge Graph - Pillar 3
 * Entity linking, relationship mapping, topic hierarchies, concept extraction
 */

export interface EntityNode {
  id: string;
  name: string;
  entityType: string;
  description?: string;
  category?: string;
  mentionCount: number;
}

export interface RelationshipEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
  weight: number;
  manual: boolean;
}

export interface GraphNode extends EntityNode {
  relations: RelationshipEdge[];
  relatedEntities: EntityNode[];
}

/**
 * Create or update an entity in the graph
 */
export async function createEntity(
  name: string,
  entityType: "concept" | "product" | "feature" | "process" | "policy",
  description?: string,
  category?: string,
  aliases: string[] = []
): Promise<KnowledgeEntity> {
  try {
    // Check if entity exists
    let entity = await prisma.knowledgeEntity.findUnique({
      where: { name },
    });

    if (entity) {
      // Update existing
      entity = await prisma.knowledgeEntity.update({
        where: { name },
        data: {
          description: description ?? entity.description,
          category: category ?? entity.category,
          aliases: Array.from(new Set([...entity.aliases, ...aliases])),
        },
      });
    } else {
      // Create new
      entity = await prisma.knowledgeEntity.create({
        data: {
          name,
          entityType,
          description,
          category,
          aliases,
          mentionCount: 0,
        },
      });
    }

    return entity;
  } catch (error) {
    throw AppError.internal(
      `Failed to create entity: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Create a relationship between two articles
 */
export async function createRelation(
  sourceArticleId: string,
  targetArticleId: string,
  relationType:
    | "references"
    | "related"
    | "prerequisite"
    | "example"
    | "parent"
    | "child",
  weight: number = 1.0,
  manual: boolean = false
): Promise<EntityRelation> {
  try {
    // Verify articles exist
    const [source, target] = await Promise.all([
      prisma.knowledgeArticle.findUnique({
        where: { id: sourceArticleId },
      }),
      prisma.knowledgeArticle.findUnique({
        where: { id: targetArticleId },
      }),
    ]);

    if (!source || !target) {
      throw AppError.notFound("One or both articles not found");
    }

    // Create or update relation
    const relation = await prisma.entityRelation.upsert({
      where: {
        sourceArticle_targetArticle_relationType: {
          sourceArticle: sourceArticleId,
          targetArticle: targetArticleId,
          relationType,
        },
      },
      create: {
        sourceArticle: sourceArticleId,
        targetArticle: targetArticleId,
        relationType,
        weight,
        manual,
      },
      update: {
        weight,
        manual,
      },
    });

    return relation;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Failed to create relation: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract entities and relationships from article content
 */
export async function extractEntitiesFromArticle(
  articleId: string,
  content: string
): Promise<{ entities: KnowledgeEntity[]; relations: EntityRelation[] }> {
  try {
    const entities: KnowledgeEntity[] = [];
    const relations: EntityRelation[] = [];

    // Simple entity extraction patterns
    const conceptPatterns = [
      /\*\*([^*]+)\*\*/g, // Bold text
      /#{1,3}\s+([^\n]+)/g, // Headers
    ];

    const extractedEntityNames = new Set<string>();

    for (const pattern of conceptPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1].trim();
        if (name.length > 2 && name.length < 100) {
          extractedEntityNames.add(name);
        }
      }
    }

    // Create entities
    for (const entityName of extractedEntityNames) {
      const entity = await createEntity(
        entityName,
        "concept",
        `Extracted from article`,
        undefined,
        []
      );
      entities.push(entity);
    }

    // Create cross-relations between entities
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        // Create bidirectional relations
        const rel = await createRelation(
          articleId,
          articleId, // Simplified: same article
          "related",
          0.7,
          false
        );
        relations.push(rel);
      }
    }

    return { entities, relations };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Failed to extract entities: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Build a topic hierarchy from entities
 */
export async function buildTopicHierarchy(rootEntityName: string): Promise<GraphNode | null> {
  try {
    const rootEntity = await prisma.knowledgeEntity.findUnique({
      where: { name: rootEntityName },
    });

    if (!rootEntity) {
      return null;
    }

    const relations = await prisma.entityRelation.findMany({
      where: {
        OR: [
          { sourceArticle: rootEntity.id },
          { targetArticle: rootEntity.id },
        ],
      },
    });

    const graphNode: GraphNode = {
      id: rootEntity.id,
      name: rootEntity.name,
      entityType: rootEntity.entityType,
      description: rootEntity.description ?? undefined,
      category: rootEntity.category ?? undefined,
      mentionCount: rootEntity.mentionCount,
      relations: relations as RelationshipEdge[],
      relatedEntities: [],
    };

    return graphNode;
  } catch (error) {
    throw AppError.internal(
      `Failed to build hierarchy: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find related articles through the knowledge graph
 */
export async function findRelatedArticles(
  articleId: string,
  depth: number = 2
): Promise<
  Array<{
    id: string;
    title: string;
    relationType: string;
    distance: number;
  }>
> {
  try {
    const visited = new Set<string>([articleId]);
    const results: Array<{
      id: string;
      title: string;
      relationType: string;
      distance: number;
    }> = [];

    async function traverse(currentId: string, currentDepth: number) {
      if (currentDepth > depth) return;

      const relations = await prisma.entityRelation.findMany({
        where: {
          OR: [
            { sourceArticle: currentId },
            { targetArticle: currentId },
          ],
        },
      });

      for (const relation of relations) {
        const nextId =
          relation.sourceArticle === currentId
            ? relation.targetArticle
            : relation.sourceArticle;

        if (!visited.has(nextId)) {
          visited.add(nextId);

          const article = await prisma.knowledgeArticle.findUnique({
            where: { id: nextId },
            select: { id: true, title: true },
          });

          if (article) {
            results.push({
              id: article.id,
              title: article.title,
              relationType: relation.relationType,
              distance: currentDepth,
            });

            await traverse(nextId, currentDepth + 1);
          }
        }
      }
    }

    await traverse(articleId, 1);

    return results.sort((a, b) => a.distance - b.distance);
  } catch (error) {
    throw AppError.internal(
      `Failed to find related articles: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get entity frequency and mentions
 */
export async function getEntityStats(days: number = 30) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const entities = await prisma.knowledgeEntity.findMany({
      where: {
        lastMentionedAt: { gte: since },
      },
      orderBy: { mentionCount: "desc" },
      take: 50,
    });

    return entities.map((e) => ({
      name: e.name,
      type: e.entityType,
      mentionCount: e.mentionCount,
      lastMentionedAt: e.lastMentionedAt,
    }));
  } catch (error) {
    throw AppError.internal(
      `Failed to get entity stats: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update entity mention count
 */
export async function recordEntityMention(entityName: string): Promise<void> {
  try {
    await prisma.knowledgeEntity.update({
      where: { name: entityName },
      data: {
        mentionCount: { increment: 1 },
        lastMentionedAt: new Date(),
      },
    });
  } catch (error) {
    // Silently fail if entity doesn't exist
    if (
      error instanceof Error &&
      error.message.includes("An operation failed because it depends on one or more records that were required but not found")
    ) {
      return;
    }
    throw AppError.internal(
      `Failed to record mention: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find knowledge gaps - frequently searched but poorly covered topics
 */
export async function findKnowledgeGaps(): Promise<
  Array<{
    query: string;
    searchCount: number;
    noResultsCount: number;
    relatedArticles: number;
  }>
> {
  try {
    // Get searches with no results or low satisfaction
    const failedSearches = await prisma.searchLog.findMany({
      where: {
        resultsCount: 0,
      },
      select: {
        query: true,
      },
    });

    const lowSatisfactionSearches = await prisma.searchLog.findMany({
      where: {
        helpful: false,
      },
      select: {
        query: true,
        resultsCount: true,
      },
    });

    // Aggregate by query
    const gapMap = new Map<
      string,
      {
        searchCount: number;
        noResultsCount: number;
        relatedArticles: number;
      }
    >();

    for (const search of failedSearches) {
      const key = search.query;
      gapMap.set(key, {
        searchCount: (gapMap.get(key)?.searchCount || 0) + 1,
        noResultsCount: (gapMap.get(key)?.noResultsCount || 0) + 1,
        relatedArticles: 0,
      });
    }

    for (const search of lowSatisfactionSearches) {
      const key = search.query;
      if (!gapMap.has(key)) {
        gapMap.set(key, {
          searchCount: 1,
          noResultsCount: 0,
          relatedArticles: search.resultsCount,
        });
      }
    }

    return Array.from(gapMap.entries())
      .map(([query, stats]) => ({
        query,
        ...stats,
      }))
      .sort((a, b) => b.searchCount - a.searchCount)
      .slice(0, 20);
  } catch (error) {
    throw AppError.internal(
      `Failed to find gaps: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
