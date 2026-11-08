import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dashboardShareSchema = z.object({
  dashboardId: z.string(),
  sharedWith: z.array(z.string()),
  permissions: z.enum(["view", "edit", "admin"]),
  expiresAt: z.date().optional()
});

export const dashboardCommentSchema = z.object({
  dashboardId: z.string(),
  widgetId: z.string().optional(),
  userId: z.string(),
  text: z.string(),
  mentions: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional()
});

export async function shareDashboard(data: z.infer<typeof dashboardShareSchema>) {
  const validated = dashboardShareSchema.parse(data);
  return await prisma.dashboardShare.create({
    data: {
      dashboardId: validated.dashboardId,
      permissions: validated.permissions,
      sharedWith: JSON.stringify(validated.sharedWith),
      expiresAt: validated.expiresAt
    }
  });
}

export async function getDashboardShares(dashboardId: string) {
  return await prisma.dashboardShare.findMany({
    where: { dashboardId }
  });
}

export async function addComment(data: z.infer<typeof dashboardCommentSchema>) {
  const validated = dashboardCommentSchema.parse(data);
  return await prisma.dashboardComment.create({
    data: {
      dashboardId: validated.dashboardId,
      widgetId: validated.widgetId,
      userId: validated.userId,
      text: validated.text,
      mentions: JSON.stringify(validated.mentions),
      attachments: JSON.stringify(validated.attachments)
    }
  });
}

export async function getDashboardComments(dashboardId: string) {
  return await prisma.dashboardComment.findMany({
    where: { dashboardId },
    orderBy: { createdAt: "desc" }
  });
}

export async function addAnnotation(dashboardId: string, widgetId: string, text: string, position: any) {
  return await prisma.dashboardAnnotation.create({
    data: {
      dashboardId,
      widgetId,
      text,
      position: JSON.stringify(position)
    }
  });
}

export async function getAnnotations(dashboardId: string) {
  return await prisma.dashboardAnnotation.findMany({
    where: { dashboardId }
  });
}
