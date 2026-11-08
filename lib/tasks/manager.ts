import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  estimatedHours: z.number().int().positive().optional(),
  dependencyIds: z.array(z.string()).optional(),
});

export async function createTask(projectId: string, userId: string, data: z.infer<typeof taskSchema>) {
  const parsed = taskSchema.parse(data);

  const task = await prisma.task.create({
    data: {
      projectId,
      ...parsed,
      createdBy: userId,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      status: "TODO",
    },
  });

  return task;
}

export async function getTasksByProject(projectId: string) {
  return prisma.task.findMany({
    where: { projectId },
    include: { comments: true, attachments: true, subtasks: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      comments: { include: { _count: { select: { attachments: true } } } },
      attachments: true,
      subtasks: true,
      checklist: true,
    },
  });

  if (!task) throw AppError.notFound("Task not found");
  return task;
}

export async function updateTaskStatus(taskId: string, status: string) {
  return prisma.task.update({
    where: { id: taskId },
    data: {
      status: status as any,
      ...(status === "COMPLETED" && { completedAt: new Date() }),
    },
  });
}

export async function updateTaskPriority(taskId: string, priority: string) {
  return prisma.task.update({
    where: { id: taskId },
    data: { priority: priority as any },
  });
}

export async function addTaskComment(taskId: string, userId: string, content: string, mentions: string[] = []) {
  return prisma.taskComment.create({
    data: {
      taskId,
      content,
      author: userId,
      mentions,
    },
  });
}

export async function addTaskAttachment(taskId: string, userId: string, fileName: string, fileUrl: string, fileSize: number, mimeType: string) {
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

export async function updateTaskHours(taskId: string, actualHours: number) {
  return prisma.task.update({
    where: { id: taskId },
    data: { actualHours },
  });
}

export async function getTasksByAssignee(userId: string) {
  return prisma.task.findMany({
    where: { assignedTo: userId, status: { not: "COMPLETED" } },
    include: { project: true },
    orderBy: { dueDate: "asc" },
  });
}

export async function getOverdueTasks(projectId: string) {
  const now = new Date();
  return prisma.task.findMany({
    where: {
      projectId,
      dueDate: { lt: now },
      status: { not: "COMPLETED" },
    },
    orderBy: { dueDate: "asc" },
  });
}
