import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function createTimeline(projectId: string) {
  return prisma.projectTimeline.create({
    data: { projectId },
  });
}

export async function getTimeline(projectId: string) {
  let timeline = await prisma.projectTimeline.findUnique({
    where: { projectId },
    include: { milestones: true },
  });

  if (!timeline) {
    timeline = await createTimeline(projectId);
  }

  return timeline;
}

export async function addMilestone(projectId: string, name: string, dueDate: Date) {
  const timeline = await getTimeline(projectId);

  return prisma.projectMilestone.create({
    data: {
      timelineId: timeline.id,
      name,
      dueDate,
    },
  });
}

export async function updateMilestoneStatus(milestoneId: string, completed: boolean) {
  return prisma.projectMilestone.update({
    where: { id: milestoneId },
    data: { completed },
  });
}

export async function calculateCriticalPath(projectId: string): Promise<string[]> {
  const tasks = await prisma.task.findMany({
    where: { projectId },
  });

  // Simplified: tasks with no end date and no dependencies
  const criticalTasks = tasks
    .filter((t) => t.dueDate && t.status !== "COMPLETED")
    .sort((a, b) => (a.dueDate || new Date()).getTime() - (b.dueDate || new Date()).getTime())
    .slice(0, 5)
    .map((t) => t.id);

  return criticalTasks;
}

export async function getGanttChart(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { attachments: { select: { id: true } } },
  });

  const timeline = await getTimeline(projectId);
  const criticalPath = await calculateCriticalPath(projectId);

  const taskItems = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    startDate: task.startDate,
    dueDate: task.dueDate,
    estimatedHours: task.estimatedHours,
    actualHours: task.actualHours,
    assignedTo: task.assignedTo,
    isCritical: criticalPath.includes(task.id),
    completionPercent: task.status === "COMPLETED" ? 100 : task.actualHours && task.estimatedHours ? Math.round((task.actualHours / task.estimatedHours) * 100) : 0,
  }));

  return {
    tasks: taskItems,
    milestones: timeline.milestones,
    criticalPath,
    variance: timeline.variance || 0,
  };
}

export async function updateVariance(projectId: string, variance: number) {
  const timeline = await getTimeline(projectId);
  return prisma.projectTimeline.update({
    where: { id: timeline.id },
    data: { variance },
  });
}

export async function getProjectTimeline(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) throw AppError.notFound("Project not found");

  const tasks = await prisma.task.findMany({
    where: { projectId },
  });

  const timeline = await getGanttChart(projectId);

  return {
    projectName: project.name,
    startDate: project.startDate,
    dueDate: project.dueDate,
    status: project.status,
    ...timeline,
  };
}
