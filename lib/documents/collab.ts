import { prisma } from "@/lib/prisma";
import { z } from "zod";

const commentSchema = z.object({
  documentId: z.string(),
  userId: z.string(),
  content: z.string().min(1),
  lineNumber: z.number().optional(),
  resolved: z.boolean().default(false),
});

type Comment = z.infer<typeof commentSchema>;

export async function addComment(comment: Comment) {
  return prisma.documentComment.create({
    data: comment,
  });
}

export async function listComments(documentId: string) {
  return prisma.documentComment.findMany({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });
}

export async function resolveComment(commentId: string, resolved: boolean) {
  return prisma.documentComment.update({
    where: { id: commentId },
    data: { resolved, resolvedAt: resolved ? new Date() : null },
  });
}

export async function replyToComment(
  commentId: string,
  userId: string,
  content: string
) {
  return prisma.documentCommentReply.create({
    data: {
      commentId,
      userId,
      content,
    },
  });
}

export async function trackChange(
  documentId: string,
  userId: string,
  change: {
    type: "added" | "deleted" | "modified";
    field: string;
    oldValue?: string;
    newValue?: string;
  }
) {
  return prisma.documentChangeLog.create({
    data: {
      documentId,
      userId,
      changeType: change.type,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
    },
  });
}

export async function getChangeHistory(documentId: string) {
  return prisma.documentChangeLog.findMany({
    where: { documentId },
    orderBy: { timestamp: "desc" },
    include: { user: { select: { name: true } } },
  });
}

export async function createApprovalWorkflow(
  documentId: string,
  approvers: string[]
) {
  return prisma.documentApprovalWorkflow.create({
    data: {
      documentId,
      steps: {
        create: approvers.map((userId, index) => ({
          order: index,
          userId,
          status: "pending",
        })),
      },
    },
  });
}

export async function approveDocument(
  workflowId: string,
  stepId: string,
  approved: boolean,
  comment?: string
) {
  return prisma.documentApprovalStep.update({
    where: { id: stepId },
    data: {
      status: approved ? "approved" : "rejected",
      comment,
      completedAt: new Date(),
    },
  });
}

export async function getWorkflowStatus(workflowId: string) {
  return prisma.documentApprovalWorkflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: { user: { select: { name: true } } },
      },
    },
  });
}

export async function resolveConflict(
  documentId: string,
  conflictId: string,
  resolution: "ours" | "theirs" | "custom",
  customContent?: string
) {
  return prisma.documentMergeConflict.update({
    where: { id: conflictId },
    data: {
      resolved: true,
      resolution,
      resolvedContent: customContent,
      resolvedAt: new Date(),
    },
  });
}
