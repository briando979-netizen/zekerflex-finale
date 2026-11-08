import { prisma } from "@/lib/prisma";
import { getProjectStats } from "./manager";
import { getGanttChart } from "./gantt";

export async function generateBurndownChart(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
  });

  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const total = tasks.length;

  return {
    type: "burndown",
    total,
    completed,
    remaining: total - completed,
    percentComplete: total ? Math.round((completed / total) * 100) : 0,
    tasks,
  };
}

export async function generateResourceUtilization(projectId: string) {
  const members = await prisma.projectMember.findMany({
    where: { projectId },
  });

  const tasks = await prisma.task.findMany({
    where: { projectId },
  });

  const utilization = members.map((m) => {
    const memberTasks = tasks.filter((t) => t.assignedTo === m.userId);
    const totalHours = memberTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    const actualHours = memberTasks.reduce((sum, t) => sum + t.actualHours, 0);

    return {
      userId: m.userId,
      role: m.role,
      assignedHours: m.hours || 0,
      estimatedHours: totalHours,
      actualHours,
      utilizationPercent: (m.hours || 0) ? Math.round((actualHours / (m.hours || 1)) * 100) : 0,
      taskCount: memberTasks.length,
    };
  });

  return {
    type: "resource_utilization",
    members: utilization,
  };
}

export async function generateBudgetVariance(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) return null;

  const tasks = await prisma.task.findMany({
    where: { projectId },
  });

  const hoursCompleted = tasks.filter((t) => t.status === "COMPLETED").reduce((sum, t) => sum + t.actualHours, 0);
  const estimatedHours = tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);

  const budget = project.budget || 0;
  const spent = project.spent;
  const variance = budget - spent;

  return {
    type: "budget_variance",
    budget,
    spent,
    variance,
    variancePercent: budget ? Math.round((variance / budget) * 100) : 0,
    status: variance > 0 ? "under_budget" : "over_budget",
  };
}

export async function generateTeamVelocity(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: 20,
  });

  const completed = tasks.length;
  const totalHours = tasks.reduce((sum, t) => sum + t.actualHours, 0);

  // Simple velocity: completed tasks per week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const thisWeek = tasks.filter((t) => (t.completedAt || new Date()) > weekAgo).length;

  return {
    type: "velocity",
    totalCompleted: completed,
    totalHours,
    thisWeek,
    averageVelocity: completed > 0 ? completed / 4 : 0, // 4-week average
  };
}

export async function generateProjectReport(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) return null;

  const stats = await getProjectStats(projectId);
  const burndown = await generateBurndownChart(projectId);
  const resources = await generateResourceUtilization(projectId);
  const budget = await generateBudgetVariance(projectId);
  const velocity = await generateTeamVelocity(projectId);
  const timeline = await getGanttChart(projectId);

  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      owner: project.owner,
    },
    summary: stats,
    burndown,
    resources,
    budget,
    velocity,
    timeline: {
      startDate: project.startDate,
      dueDate: project.dueDate,
      completedAt: project.completedAt,
      milestones: timeline.milestones,
    },
    generatedAt: new Date(),
  };
}

export async function saveReport(projectId: string, type: string, data: any) {
  return prisma.projectReport.create({
    data: {
      projectId,
      type,
      data,
    },
  });
}

export async function getProjectReports(projectId: string, type?: string) {
  return prisma.projectReport.findMany({
    where: { projectId, ...(type && { type }) },
    orderBy: { generatedAt: "desc" },
    take: 50,
  });
}
