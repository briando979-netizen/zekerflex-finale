import { z } from "zod";

export const WorkflowNotificationSchema = z.object({
  id: z.string().min(1),
  approvalId: z.string().min(1),
  recipientId: z.string().min(1),
  type: z.enum(["approval_request", "reminder", "escalation", "completion"]),
  channel: z.enum(["email", "push", "sms", "in_app"]),
  message: z.string(),
  sent: z.boolean().default(false),
  sentAt: z.date().optional(),
  read: z.boolean().default(false),
  readAt: z.date().optional(),
  createdAt: z.date(),
});

export type WorkflowNotification = z.infer<typeof WorkflowNotificationSchema>;

export async function createNotification(data: Omit<WorkflowNotification, "id" | "createdAt">): Promise<WorkflowNotification> {
  return {
    id: `notif_${Date.now()}`,
    ...data,
    createdAt: new Date(),
  };
}

export async function notifyApprovers(
  approvalId: string,
  approvers: string[],
  message: string,
  channels: Array<"email" | "push" | "sms" | "in_app"> = ["email", "push"]
): Promise<WorkflowNotification[]> {
  return Promise.all(
    approvers.flatMap((approverId) =>
      channels.map((channel) =>
        createNotification({
          approvalId,
          recipientId: approverId,
          type: "approval_request",
          channel,
          message,
        })
      )
    )
  );
}

export async function markAsRead(notification: WorkflowNotification): Promise<WorkflowNotification> {
  return {
    ...notification,
    read: true,
    readAt: new Date(),
  };
}
