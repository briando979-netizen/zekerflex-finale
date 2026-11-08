import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { CurationWorkflow, CurationWorkflowItem } from "@prisma/client";

/**
 * Content Curation - Pillar 4
 * Editorial workflows, content review, approval processes, publication scheduling
 */

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  workflowType: "review" | "approval" | "publication" | "archival" | "update";
  requiredApprovals?: number;
  autoPublish?: boolean;
  scheduledFor?: Date;
}

export interface AddArticleToWorkflowInput {
  workflowId: string;
  articleId: string;
  priority?: number;
  assignedTo?: string;
  deadlineAt?: Date;
}

export interface ReviewArticleInput {
  workflowItemId: string;
  status: "APPROVED" | "REJECTED" | "SCHEDULED";
  reviewNotes?: string;
  approvedBy: string;
}

/**
 * Create a new curation workflow
 */
export async function createWorkflow(
  input: CreateWorkflowInput
): Promise<CurationWorkflow> {
  try {
    const workflow = await prisma.curationWorkflow.create({
      data: {
        name: input.name,
        description: input.description,
        workflowType: input.workflowType,
        requiredApprovals: input.requiredApprovals || 1,
        autoPublish: input.autoPublish || false,
        scheduledFor: input.scheduledFor,
        status: "ACTIVE",
      },
    });

    return workflow;
  } catch (error) {
    throw AppError.internal(
      `Failed to create workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Add article to workflow
 */
export async function addArticleToWorkflow(
  input: AddArticleToWorkflowInput
): Promise<CurationWorkflowItem> {
  try {
    // Verify article exists
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: input.articleId },
    });

    if (!article) {
      throw AppError.notFound(`Article ${input.articleId} not found`);
    }

    // Add to workflow
    const item = await prisma.curationWorkflowItem.create({
      data: {
        workflowId: input.workflowId,
        articleId: input.articleId,
        priority: input.priority || 0,
        assignedTo: input.assignedTo,
        deadlineAt: input.deadlineAt,
        status: "PENDING",
      },
    });

    return item;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Failed to add article to workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Review and approve/reject article in workflow
 */
export async function reviewArticle(
  input: ReviewArticleInput
): Promise<CurationWorkflowItem> {
  try {
    const item = await prisma.curationWorkflowItem.findUnique({
      where: { id: input.workflowItemId },
      include: {
        workflow: true,
        article: true,
      },
    });

    if (!item) {
      throw AppError.notFound(`Workflow item ${input.workflowItemId} not found`);
    }

    const updated = await prisma.curationWorkflowItem.update({
      where: { id: input.workflowItemId },
      data: {
        status: input.status,
        reviewNotes: input.reviewNotes,
        approvedBy: input.approvedBy,
        reviewedAt: new Date(),
      },
    });

    // Handle auto-publish if workflow has it enabled
    if (
      item.workflow.autoPublish &&
      input.status === "APPROVED"
    ) {
      await prisma.knowledgeArticle.update({
        where: { id: item.articleId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          updatedBy: input.approvedBy,
        },
      });
    }

    // Handle scheduled publication
    if (
      item.workflow.workflowType === "publication" &&
      item.workflow.scheduledFor &&
      input.status === "APPROVED"
    ) {
      await prisma.knowledgeArticle.update({
        where: { id: item.articleId },
        data: {
          status: "PUBLISHED",
          publishedAt: item.workflow.scheduledFor,
          updatedBy: input.approvedBy,
        },
      });
    }

    return updated;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Failed to review article: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get pending articles in a workflow
 */
export async function getWorkflowItems(
  workflowId: string,
  status?: string
): Promise<
  Array<{
    item: CurationWorkflowItem;
    article: { id: string; title: string; status: string };
  }>
> {
  try {
    const items = await prisma.curationWorkflowItem.findMany({
      where: {
        workflowId,
        ...(status && { status }),
      },
      include: {
        article: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    return items as Array<{
      item: CurationWorkflowItem;
      article: { id: string; title: string; status: string };
    }>;
  } catch (error) {
    throw AppError.internal(
      `Failed to get workflow items: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Assign article review to user
 */
export async function assignReview(
  workflowItemId: string,
  assignedTo: string,
  deadlineAt: Date
): Promise<CurationWorkflowItem> {
  try {
    const updated = await prisma.curationWorkflowItem.update({
      where: { id: workflowItemId },
      data: {
        assignedTo,
        deadlineAt,
      },
    });

    return updated;
  } catch (error) {
    throw AppError.internal(
      `Failed to assign review: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Bulk assign articles to reviewers
 */
export async function bulkAssignReviews(
  assignments: Array<{
    workflowItemId: string;
    assignedTo: string;
    deadlineAt: Date;
  }>
): Promise<void> {
  try {
    await Promise.all(
      assignments.map((a) =>
        assignReview(a.workflowItemId, a.assignedTo, a.deadlineAt)
      )
    );
  } catch (error) {
    throw AppError.internal(
      `Failed to bulk assign reviews: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get reviews assigned to user
 */
export async function getAssignedReviews(userId: string) {
  try {
    const items = await prisma.curationWorkflowItem.findMany({
      where: {
        assignedTo: userId,
        status: "PENDING",
      },
      include: {
        article: {
          select: {
            id: true,
            title: true,
            description: true,
            contentType: true,
            createdAt: true,
          },
        },
        workflow: {
          select: {
            name: true,
            workflowType: true,
          },
        },
      },
      orderBy: [{ deadlineAt: "asc" }, { priority: "desc" }],
    });

    return items;
  } catch (error) {
    throw AppError.internal(
      `Failed to get assigned reviews: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Schedule publication
 */
export async function schedulePublication(
  articleId: string,
  publishAt: Date,
  scheduledBy: string
): Promise<CurationWorkflow> {
  try {
    // Create publication workflow
    const workflow = await prisma.curationWorkflow.create({
      data: {
        name: `Publication scheduled for ${publishAt.toISOString().split("T")[0]}`,
        workflowType: "publication",
        requiredApprovals: 0,
        autoPublish: true,
        scheduledFor: publishAt,
        status: "ACTIVE",
      },
    });

    // Add article to workflow
    await prisma.curationWorkflowItem.create({
      data: {
        workflowId: workflow.id,
        articleId,
        status: "SCHEDULED",
        approvedBy: scheduledBy,
      },
    });

    return workflow;
  } catch (error) {
    throw AppError.internal(
      `Failed to schedule publication: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get workflow status and metrics
 */
export async function getWorkflowStatus(workflowId: string) {
  try {
    const workflow = await prisma.curationWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw AppError.notFound(`Workflow ${workflowId} not found`);
    }

    const items = await prisma.curationWorkflowItem.findMany({
      where: { workflowId },
    });

    const statusCounts = {
      pending: items.filter((i) => i.status === "PENDING").length,
      approved: items.filter((i) => i.status === "APPROVED").length,
      rejected: items.filter((i) => i.status === "REJECTED").length,
      scheduled: items.filter((i) => i.status === "SCHEDULED").length,
    };

    const completionRate = items.length > 0
      ? ((statusCounts.approved + statusCounts.rejected) / items.length) * 100
      : 0;

    return {
      workflow,
      statusCounts,
      totalItems: items.length,
      completionRate: Math.round(completionRate),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.internal(
      `Failed to get workflow status: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Complete workflow
 */
export async function completeWorkflow(workflowId: string): Promise<CurationWorkflow> {
  try {
    const updated = await prisma.curationWorkflow.update({
      where: { id: workflowId },
      data: {
        status: "COMPLETED",
      },
    });

    return updated;
  } catch (error) {
    throw AppError.internal(
      `Failed to complete workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Archive workflow
 */
export async function archiveWorkflow(workflowId: string): Promise<CurationWorkflow> {
  try {
    // Set to paused (softer than deletion)
    const updated = await prisma.curationWorkflow.update({
      where: { id: workflowId },
      data: {
        status: "PAUSED",
      },
    });

    return updated;
  } catch (error) {
    throw AppError.internal(
      `Failed to archive workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get overdue reviews
 */
export async function getOverdueReviews() {
  try {
    const now = new Date();

    const overdue = await prisma.curationWorkflowItem.findMany({
      where: {
        status: "PENDING",
        deadlineAt: {
          lt: now,
        },
        assignedTo: {
          not: null,
        },
      },
      include: {
        article: {
          select: {
            id: true,
            title: true,
          },
        },
        workflow: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { deadlineAt: "asc" },
    });

    return overdue;
  } catch (error) {
    throw AppError.internal(
      `Failed to get overdue reviews: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
