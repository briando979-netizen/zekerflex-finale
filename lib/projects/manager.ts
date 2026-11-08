import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().datetime(),
  dueDate: z.string().datetime().optional(),
  budget: z.number().int().positive().optional(),
});

export async function createProject(tenantId: string, userId: string, data: z.infer<typeof projectSchema>) {
  const parsed = projectSchema.parse(data);

  const project = await prisma.project.create({
    data: {
      ...parsed,
      tenantId,
      owner: userId,
      startDate: new Date(parsed.startDate),
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      budget: parsed.budget,
      members: {
        create: [{ userId, role: "owner" }],
      },
    },
  });

  return project;
}

export async function getProjectsByTenant(tenantId: string) {
  return prisma.project.findMany({
    where: { tenantId },
    include: { members: true, _count: { select: { tasks: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: true,
      tasks: { include: { comments: true, attachments: true } },
      timeline: { include: { milestones: true } },
      _count: { select: { tasks: true } },
    },
  });

  if (!project) throw AppError.notFound("Project not found");
  return project;
}

export async function updateProjectStatus(projectId: string, status: string) {
  return prisma.project.update({
    where: { id: projectId },
    data: {
      status: status as any,
      ...(status === "COMPLETED" && { completedAt: new Date() }),
    },
  });
}

export async function addProjectMember(projectId: string, userId: string, role: string) {
  return prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role },
    update: { role },
  });
}

export async function removeProjectMember(projectId: string, userId: string) {
  return prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function getProjectStats(projectId: string) {
  const project = await getProject(projectId);
  const tasks = await prisma.task.findMany({
    where: { projectId },
  });

  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const totalHours = tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const actualHours = tasks.reduce((sum, t) => sum + t.actualHours, 0);

  return {
    totalTasks: tasks.length,
    completedTasks: completed,
    completionPercent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    estimatedHours: totalHours,
    actualHours,
    budget: project.budget,
    spent: project.spent,
    status: project.status,
  };
}
