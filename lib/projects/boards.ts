import { prisma } from "@/lib/prisma";

export interface KanbanBoard {
  columns: Record<string, Task[]>;
  swimlanes: Record<string, Task[]>;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignedTo?: string;
  dueDate?: Date;
}

const DEFAULT_COLUMNS = ["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "COMPLETED"];

export async function getKanbanBoard(projectId: string, groupBy: "status" | "priority" = "status") {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { checklist: { select: { completed: true } } },
  });

  const board: Record<string, Task[]> = {};

  if (groupBy === "status") {
    DEFAULT_COLUMNS.forEach((col) => {
      board[col] = [];
    });
    tasks.forEach((task) => {
      if (!board[task.status]) board[task.status] = [];
      board[task.status].push(task as Task);
    });
  } else if (groupBy === "priority") {
    ["URGENT", "HIGH", "MEDIUM", "LOW"].forEach((pri) => {
      board[pri] = [];
    });
    tasks.forEach((task) => {
      if (!board[task.priority]) board[task.priority] = [];
      board[task.priority].push(task as Task);
    });
  }

  return board;
}

export async function moveTask(taskId: string, newStatus: string) {
  return prisma.task.update({
    where: { id: taskId },
    data: { status: newStatus as any },
  });
}

export async function filterTasks(projectId: string, filters: { assignedTo?: string; priority?: string; status?: string }) {
  return prisma.task.findMany({
    where: {
      projectId,
      ...(filters.assignedTo && { assignedTo: filters.assignedTo }),
      ...(filters.priority && { priority: filters.priority as any }),
      ...(filters.status && { status: filters.status as any }),
    },
  });
}

export async function getBoardStatistics(projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId },
  });

  const stats = {
    total: tasks.length,
    byStatus: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
    blocked: tasks.filter((t) => t.status === "BLOCKED").length,
    overdue: tasks.filter((t) => t.dueDate && t.dueDate < new Date() && t.status !== "COMPLETED").length,
  };

  tasks.forEach((task) => {
    stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
    stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
  });

  return stats;
}
