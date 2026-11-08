import { prisma } from "@/lib/prisma";
import { z } from "zod";

const resourceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["TEAM", "EQUIPMENT", "BUDGET", "FACILITY"]),
  capacity: z.number().positive(),
  costPerUnit: z.number().nonnegative(),
  availability: z.number().min(0).max(100),
  skills: z.array(z.string()).optional(),
});

export async function createResource(data: z.infer<typeof resourceSchema>) {
  const validated = resourceSchema.parse(data);
  return prisma.resource.create({
    data: { ...validated, allocated: 0, utilized: 0 },
  });
}

export async function getResourceUtilization(resourceId: string) {
  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  return resource ? { utilization: (resource.utilized / resource.capacity) * 100 } : null;
}

export async function detectConflicts(resourceId: string) {
  const allocations = await prisma.resourceAllocation.findMany({
    where: { resourceId, status: "ACTIVE" },
    include: { project: true },
  });

  const conflicts: { project1: string; project2: string }[] = [];
  for (let i = 0; i < allocations.length; i++) {
    for (let j = i + 1; j < allocations.length; j++) {
      const overlap =
        allocations[i].startDate < allocations[j].endDate &&
        allocations[i].endDate > allocations[j].startDate;
      if (overlap) conflicts.push({ project1: allocations[i].projectId, project2: allocations[j].projectId });
    }
  }
  return conflicts;
}

export async function optimizeAllocation(resourceId: string) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: { allocations: { include: { project: true } } },
  });

  if (!resource) return null;

  const sorted = [...resource.allocations].sort((a, b) => a.priority - b.priority);
  const optimized = sorted.map((alloc) => ({
    ...alloc,
    score: (alloc.priority * 0.4) + ((1 - alloc.utilized / alloc.allocated) * 100 * 0.6),
  }));

  return optimized;
}
