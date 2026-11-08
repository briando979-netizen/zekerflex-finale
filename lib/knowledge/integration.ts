import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { ContentIntegration, KnowledgeSubscription } from "@prisma/client";

/**
 * Knowledge Integration & Sync - Pillar 6
 * Content sync from external sources, API access, chatbot integration, email notifications
 */

export interface CreateIntegrationInput {
  articleId: string;
  integrationType: "slack" | "email" | "chatbot" | "api" | "webhook" | "feed";
  externalId?: string;
  externalUrl?: string;
  syncDirection?: "PUSH" | "PULL" | "BIDIRECTIONAL";
  autoSync?: boolean;
  syncFrequency?: "hourly" | "daily" | "weekly" | "manual";
}

export interface CreateSubscriptionInput {
  userId: string;
  email: string;
  subscriptionType: "category" | "entity" | "workflow" | "digest";
  categories?: string[];
  entities?: string[];
  frequency?: "IMMEDIATE" | "DAILY" | "WEEKLY" | "MONTHLY";
}

/**
 * Create content integration
 */
export async function createIntegration(
  input: CreateIntegrationInput
): Promise<ContentIntegration> {
  try {
    // Verify article exists
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: input.articleId },
    });

    if (!article) {
      throw AppError.notFound(`Article ${input.articleId} not found`);
    }

    // Create integration
    const integration = await prisma.contentIntegration.create({
      data: {
        articleId: input.articleId,
        integrationType: input.integrationType,
        externalId: input.externalId,
        externalUrl: input.externalUrl,
        syncDirection: input.syncDirection || "PUSH",
        autoSync: input.autoSync !== false,
        syncFrequency: input.syncFrequency || "daily",
        syncStatus: "PENDING",
      },
    });

    return integration;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Failed to create integration: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Sync content to external service
 */
export async function syncContent(integrationId: string): Promise<ContentIntegration> {
  try {
    const integration = await prisma.contentIntegration.findUnique({
      where: { id: integrationId },
      include: {
        article: true,
      },
    });

    if (!integration) {
      throw AppError.notFound(`Integration ${integrationId} not found`);
    }

    try {
      // Simulate sync based on integration type
      await performSync(integration);

      // Update sync status
      const updated = await prisma.contentIntegration.update({
        where: { id: integrationId },
        data: {
          lastSyncAt: new Date(),
          syncStatus: "SUCCESS",
          syncError: null,
        },
      });

      return updated;
    } catch (syncError) {
      // Log error and update status
      const errorMsg =
        syncError instanceof Error ? syncError.message : String(syncError);

      await prisma.contentIntegration.update({
        where: { id: integrationId },
        data: {
          syncStatus: "FAILED",
          syncError: errorMsg,
        },
      });

      throw syncError;
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Failed to sync content: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Perform actual sync operation (placeholder)
 */
async function performSync(integration: ContentIntegration & {
  article: { title: string; content: string };
}): Promise<void> {
  // In a real system, this would:
  // - For Slack: Post to channel
  // - For Email: Send email update
  // - For API: Call external endpoint
  // - For Webhook: Trigger webhook
  // - For Feed: Update RSS feed

  switch (integration.integrationType) {
    case "slack":
      // Would call Slack API
      console.log(`[Sync] Pushing to Slack: ${integration.article.title}`);
      break;

    case "email":
      // Would send email
      console.log(`[Sync] Emailing to subscribers: ${integration.article.title}`);
      break;

    case "api":
      // Would call external API
      console.log(`[Sync] Calling API: ${integration.externalUrl}`);
      break;

    case "webhook":
      // Would trigger webhook
      console.log(`[Sync] Triggering webhook: ${integration.externalUrl}`);
      break;

    case "feed":
      // Would update RSS/Atom feed
      console.log(`[Sync] Updating feed: ${integration.article.title}`);
      break;

    case "chatbot":
      // Would update chatbot knowledge
      console.log(`[Sync] Updating chatbot: ${integration.article.title}`);
      break;
  }
}

/**
 * Create subscription for user
 */
export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<KnowledgeSubscription> {
  try {
    // Check if subscription exists
    let subscription = await prisma.knowledgeSubscription.findUnique({
      where: {
        userId_subscriptionType: {
          userId: input.userId,
          subscriptionType: input.subscriptionType,
        },
      },
    });

    if (subscription) {
      // Update existing
      subscription = await prisma.knowledgeSubscription.update({
        where: { id: subscription.id },
        data: {
          categories: input.categories || [],
          entities: input.entities || [],
          frequency: input.frequency || "WEEKLY",
          active: true,
        },
      });
    } else {
      // Create new
      subscription = await prisma.knowledgeSubscription.create({
        data: {
          userId: input.userId,
          email: input.email,
          subscriptionType: input.subscriptionType,
          categories: input.categories || [],
          entities: input.entities || [],
          frequency: input.frequency || "WEEKLY",
          active: true,
        },
      });
    }

    return subscription;
  } catch (error) {
    throw AppError.internal(
      `Failed to create subscription: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get user subscriptions
 */
export async function getUserSubscriptions(userId: string) {
  try {
    const subscriptions = await prisma.knowledgeSubscription.findMany({
      where: {
        userId,
        active: true,
      },
    });

    return subscriptions;
  } catch (error) {
    throw AppError.internal(
      `Failed to get subscriptions: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Send email notification about new/updated content
 */
export async function sendEmailNotification(
  subscriptionId: string,
  articleIds: string[]
): Promise<void> {
  try {
    const subscription = await prisma.knowledgeSubscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw AppError.notFound(`Subscription ${subscriptionId} not found`);
    }

    // Get articles
    const articles = await prisma.knowledgeArticle.findMany({
      where: { id: { in: articleIds } },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        publishedAt: true,
      },
    });

    // Build email content
    const emailContent = buildEmailContent(
      subscription.subscriptionType,
      articles
    );

    // In a real system, would send via email service
    console.log(
      `[Email] Sending to ${subscription.email}: ${articles.length} new articles`
    );

    // Update last email sent
    await prisma.knowledgeSubscription.update({
      where: { id: subscriptionId },
      data: {
        lastEmailAt: new Date(),
      },
    });
  } catch (error) {
    throw AppError.internal(
      `Failed to send email: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Build email content
 */
function buildEmailContent(
  subscriptionType: string,
  articles: Array<{
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    publishedAt?: Date | null;
  }>
): string {
  let content = `<h1>ZekerFlex Knowledge Update</h1>\n`;
  content += `<p>You have ${articles.length} new articles in your ${subscriptionType}:</p>\n\n`;

  for (const article of articles) {
    content += `<div style="margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px;">\n`;
    content += `  <h2>${article.title}</h2>\n`;
    if (article.description) {
      content += `  <p>${article.description}</p>\n`;
    }
    if (article.category) {
      content += `  <small>Category: ${article.category}</small>\n`;
    }
    content += `</div>\n`;
  }

  return content;
}

/**
 * Send digest emails based on frequency
 */
export async function sendDigestEmails(
  frequency: "DAILY" | "WEEKLY" | "MONTHLY"
): Promise<void> {
  try {
    const subscriptions = await prisma.knowledgeSubscription.findMany({
      where: {
        frequency,
        active: true,
        subscriptionType: "digest",
      },
    });

    for (const subscription of subscriptions) {
      // Get new articles since last email
      const since = subscription.lastEmailAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const newArticles = await prisma.knowledgeArticle.findMany({
        where: {
          status: "PUBLISHED",
          publishedAt: { gte: since },
          OR: subscription.categories.length > 0 ?
            [{ category: { in: subscription.categories } }]
            : undefined,
        },
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          publishedAt: true,
        },
        take: 20,
      });

      if (newArticles.length > 0) {
        await sendEmailNotification(
          subscription.id,
          newArticles.map((a) => a.id)
        );
      }
    }
  } catch (error) {
    throw AppError.internal(
      `Failed to send digest emails: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  try {
    await prisma.knowledgeSubscription.update({
      where: { id: subscriptionId },
      data: {
        active: false,
      },
    });
  } catch (error) {
    throw AppError.internal(
      `Failed to cancel subscription: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate API token for knowledge base access
 */
export async function generateApiKey(userId: string): Promise<string> {
  try {
    // In a real system, would generate secure token
    const token = Buffer.from(
      `${userId}:${Date.now()}`
    ).toString("base64");

    // Store in a secure location (Redis, secure store, etc.)
    console.log(`[API] Generated token for user ${userId}`);

    return token;
  } catch (error) {
    throw AppError.internal(
      `Failed to generate API key: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get content for chatbot integration
 */
export async function getChatbotContent(category?: string) {
  try {
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        status: "PUBLISHED",
        ...(category && { category }),
        audience: {
          hasSome: ["public"],
        },
      },
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        tags: true,
      },
      take: 1000,
    });

    // Format for chatbot
    return articles.map((article) => ({
      id: article.id,
      title: article.title,
      content: article.content.substring(0, 1000), // Truncate for bot
      tags: article.tags,
      category: article.category,
    }));
  } catch (error) {
    throw AppError.internal(
      `Failed to get chatbot content: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Sync all active integrations
 */
export async function syncAllIntegrations(): Promise<void> {
  try {
    const integrations = await prisma.contentIntegration.findMany({
      where: {
        autoSync: true,
      },
    });

    for (const integration of integrations) {
      try {
        await syncContent(integration.id);
      } catch (error) {
        console.error(
          `Failed to sync integration ${integration.id}:`,
          error
        );
      }
    }
  } catch (error) {
    throw AppError.internal(
      `Failed to sync integrations: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
