import { z } from 'zod';

export const PublishingWorkflowSchema = z.object({
  id: z.string(),
  contentId: z.string(),
  state: z.enum(['draft', 'review', 'approved', 'published', 'archived']),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number(),
  scheduledPublishAt: z.date().optional(),
  approvers: z.array(z.string()).optional(),
  approvedBy: z.string().optional(),
  approvedAt: z.date().optional(),
  publishedAt: z.date().optional(),
  publishedBy: z.string().optional(),
  changeLog: z.array(z.object({
    action: z.enum(['created', 'updated', 'submitted', 'approved', 'published', 'archived']),
    by: z.string(),
    at: z.date(),
    message: z.string().optional(),
  })).optional(),
});

export type PublishingWorkflow = z.infer<typeof PublishingWorkflowSchema>;

export class PublishingManager {
  async createDraft(contentId: string, data: any) {
    return {
      id: `pub_${Date.now()}`,
      contentId,
      state: 'draft' as const,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      changeLog: [{ action: 'created' as const, by: 'system', at: new Date() }],
    };
  }

  async submitForReview(contentId: string, approvers: string[], message?: string) {
    return {
      state: 'review' as const,
      approvers,
      updatedAt: new Date(),
      changeLog: [{ action: 'submitted' as const, by: 'system', at: new Date(), message }],
    };
  }

  async approve(contentId: string, approver: string) {
    return {
      state: 'approved' as const,
      approvedBy: approver,
      approvedAt: new Date(),
      changeLog: [{ action: 'approved' as const, by: approver, at: new Date() }],
    };
  }

  async publish(contentId: string, publisher: string, scheduledFor?: Date) {
    return {
      state: 'published' as const,
      publishedBy: publisher,
      publishedAt: scheduledFor || new Date(),
      scheduledPublishAt: scheduledFor,
      updatedAt: new Date(),
    };
  }

  async archive(contentId: string) {
    return {
      state: 'archived' as const,
      updatedAt: new Date(),
    };
  }

  async getHistory(contentId: string) {
    return [];
  }

  async rollback(contentId: string, toVersion: number) {
    return {
      version: toVersion,
      updatedAt: new Date(),
      state: 'draft' as const,
    };
  }
}
