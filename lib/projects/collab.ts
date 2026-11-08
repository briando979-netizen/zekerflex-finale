import { prisma } from "@/lib/prisma";
import { z } from "zod";

const commentSchema = z.object({
  content: z.string().min(1),
  mentions: z.array(z.string()).optional(),
});

export async function addTaskComment(taskId: string, userId: string, data: z.infer<typeof commentSchema>) {
  const parsed = commentSchema.parse(data);

  return prisma.taskComment.create({
    data: {
      taskId,
      content: parsed.content,
      author: userId,
      mentions: parsed.mentions || [],
    },
  });
}

export async function getTaskComments(taskId: string) {
  return prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateComment(commentId: string, content: string) {
  return prisma.taskComment.update({
    where: { id: commentId },
    data: { content },
  });
}

export async function deleteComment(commentId: string) {
  return prisma.taskComment.delete({
    where: { id: commentId },
  });
}

export async function addAttachment(taskId: string, userId: string, fileName: string, fileUrl: string, fileSize: number, mimeType: string) {
  return prisma.taskAttachment.create({
    data: {
      taskId,
      fileName,
      fileUrl,
      fileSize,
      mimeType,
      uploadedBy: userId,
    },
  });
}

export async function getTaskActivityFeed(projectId: string, limit = 50) {
  const comments = await prisma.taskComment.findMany({
    where: { task: { projectId } },
    include: { task: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return comments.map((c) => ({
    type: "comment",
    author: c.author,
    task: c.task,
    content: c.content,
    timestamp: c.createdAt,
  }));
}

export async function getMentionedUsers(taskId: string): Promise<string[]> {
  const comments = await prisma.taskComment.findMany({
    where: { taskId },
  });

  const mentions = new Set<string>();
  comments.forEach((c) => {
    c.mentions.forEach((m) => mentions.add(m));
  });

  return Array.from(mentions);
}

export async function notifyMentionedUsers(taskId: string, mentioningUser: string) {
  const mentions = await getMentionedUsers(taskId);
  // Integration with notification system would go here
  return mentions;
}

export async function getProjectActivityFeed(projectId: string, limit = 100) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    take: 5,
  });

  const comments = await prisma.taskComment.findMany({
    where: { task: { projectId } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const activity = [
    ...comments.map((c) => ({
      type: "comment",
      taskId: c.taskId,
      author: c.author,
      content: c.content,
      timestamp: c.createdAt,
    })),
  ];

  return activity.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
