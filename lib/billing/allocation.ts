import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const allocationSchema = z.object({
  expenseId: z.string(),
  allocationType: z.enum(['department', 'project', 'activity']),
  targets: z.array(z.object({ targetId: z.string(), percentage: z.number().min(0).max(100) })),
});

export async function allocateExpense(data: z.infer<typeof allocationSchema>) {
  const validated = allocationSchema.parse(data);
  const expense = await prisma.expense.findUnique({ where: { id: validated.expenseId } });
  if (!expense) throw new Error('Expense not found');

  const allocations = validated.targets.map(target => ({
    expenseId: validated.expenseId,
    allocationType: validated.allocationType,
    targetId: target.targetId,
    amount: ((expense.amount as number) * target.percentage) / 100,
  }));

  return prisma.costAllocation.createMany({ data: allocations });
}

export async function getDepartmentCosts(departmentId: string, month: Date) {
  const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  return prisma.costAllocation.aggregate({
    where: {
      targetId: departmentId,
      allocationType: 'department',
      createdAt: { gte: startOfMonth, lte: endOfMonth },
    },
    _sum: { amount: true },
  });
}

export async function getProjectCosts(projectId: string) {
  return prisma.costAllocation.aggregate({
    where: { targetId: projectId, allocationType: 'project' },
    _sum: { amount: true },
  });
}

export async function getActivityBasedCosts(activityId: string) {
  return prisma.costAllocation.findMany({
    where: { targetId: activityId, allocationType: 'activity' },
  });
}

export async function reallocateCosts(allocationId: string, newTargets: Array<{ id: string; percentage: number }>) {
  const allocation = await prisma.costAllocation.findUnique({ where: { id: allocationId } });
  if (!allocation) throw new Error('Allocation not found');

  await prisma.costAllocation.delete({ where: { id: allocationId } });

  const newAllocations = newTargets.map(t => ({
    expenseId: allocation.expenseId,
    allocationType: allocation.allocationType,
    targetId: t.id,
    amount: ((allocation.amount as number) * t.percentage) / 100,
  }));

  return prisma.costAllocation.createMany({ data: newAllocations });
}
