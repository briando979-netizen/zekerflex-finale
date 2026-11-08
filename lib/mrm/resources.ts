import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

// ============================================================================
// 3. RESOURCE PLANNING - Team capacity, project management, resource allocation
// ============================================================================

const CreateResourceAllocationSchema = z.object({
  campaignId: z.string().optional(),
  resourceId: z.string(),
  resourceType: z.enum(["USER", "TEAM", "AGENCY"]),
  resourceName: z.string(),
  allocatedHours: z.number().positive("Toegewezen uren moet positief zijn"),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const UpdateResourceAllocationSchema = CreateResourceAllocationSchema.partial().omit({
  resourceId: true,
  resourceType: true,
});

export type CreateResourceAllocationInput = z.infer<typeof CreateResourceAllocationSchema>;
export type UpdateResourceAllocationInput = z.infer<typeof UpdateResourceAllocationSchema>;

/**
 * Create a resource allocation
 */
export async function createResourceAllocation(
  tenantId: string,
  input: CreateResourceAllocationInput,
) {
  const validated = CreateResourceAllocationSchema.parse(input);

  if (new Date(validated.startDate) >= new Date(validated.endDate)) {
    throw AppError.validation("Startdatum moet voor einddatum liggen");
  }

  // Verify campaign exists if provided
  if (validated.campaignId) {
    const campaign = await prisma.mrmCampaign.findUnique({
      where: { id: validated.campaignId },
    });

    if (!campaign) {
      throw AppError.notFound("Campagne niet gevonden");
    }
  }

  return prisma.mrmResourceAllocation.create({
    data: {
      tenantId,
      campaignId: validated.campaignId || null,
      resourceId: validated.resourceId,
      resourceType: validated.resourceType,
      resourceName: validated.resourceName,
      allocatedHours: validated.allocatedHours,
      utilizedHours: 0,
      remainingHours: validated.allocatedHours,
      startDate: new Date(validated.startDate),
      endDate: new Date(validated.endDate),
    },
  });
}

/**
 * Get resource allocations for a tenant
 */
export async function getResourceAllocations(
  tenantId: string,
  filters?: {
    campaignId?: string;
    resourceType?: string;
    status?: string;
    limit?: number;
    offset?: number;
  },
) {
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const where: any = { tenantId };
  if (filters?.campaignId) where.campaignId = filters.campaignId;
  if (filters?.resourceType) where.resourceType = filters.resourceType;
  if (filters?.status) where.status = filters.status;

  const [allocations, total] = await Promise.all([
    prisma.mrmResourceAllocation.findMany({
      where,
      orderBy: { startDate: "asc" },
      take: limit,
      skip: offset,
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.mrmResourceAllocation.count({ where }),
  ]);

  return { allocations, total, limit, offset };
}

/**
 * Get resource allocation by ID
 */
export async function getResourceAllocationById(id: string, tenantId: string) {
  const allocation = await prisma.mrmResourceAllocation.findFirst({
    where: { id, tenantId },
    include: {
      campaign: true,
    },
  });

  if (!allocation) {
    throw AppError.notFound("Resourcetoewijzing niet gevonden");
  }

  return allocation;
}

/**
 * Update resource allocation
 */
export async function updateResourceAllocation(
  id: string,
  tenantId: string,
  input: UpdateResourceAllocationInput,
) {
  const validated = UpdateResourceAllocationSchema.parse(input);

  const existing = await prisma.mrmResourceAllocation.findFirst({
    where: { id, tenantId },
  });

  if (!existing) {
    throw AppError.notFound("Resourcetoewijzing niet gevonden");
  }

  const startDate = validated.startDate
    ? new Date(validated.startDate)
    : existing.startDate;
  const endDate = validated.endDate
    ? new Date(validated.endDate)
    : existing.endDate;

  if (startDate >= endDate) {
    throw AppError.validation("Startdatum moet voor einddatum liggen");
  }

  return prisma.mrmResourceAllocation.update({
    where: { id },
    data: {
      ...(validated.resourceName !== undefined && { resourceName: validated.resourceName }),
      ...(validated.allocatedHours !== undefined && {
        allocatedHours: validated.allocatedHours,
        remainingHours: validated.allocatedHours - (existing.utilizedHours || 0),
      }),
      ...(validated.startDate !== undefined && { startDate }),
      ...(validated.endDate !== undefined && { endDate }),
    },
  });
}

/**
 * Track resource utilization
 */
export async function trackResourceUtilization(
  id: string,
  tenantId: string,
  hoursUsed: number,
) {
  const allocation = await prisma.mrmResourceAllocation.findFirst({
    where: { id, tenantId },
  });

  if (!allocation) {
    throw AppError.notFound("Resourcetoewijzing niet gevonden");
  }

  const newUtilized = allocation.utilizedHours + hoursUsed;
  const newRemaining = allocation.allocatedHours - newUtilized;

  if (newUtilized > allocation.allocatedHours) {
    throw AppError.validation(
      `Kan ${hoursUsed} uren niet toevoegen. Totaal zou ${newUtilized} zijn, maar gealloceerd is slechts ${allocation.allocatedHours}`,
    );
  }

  const capacity = (newUtilized / allocation.allocatedHours) * 100;

  return prisma.mrmResourceAllocation.update({
    where: { id },
    data: {
      utilizedHours: newUtilized,
      remainingHours: newRemaining,
      capacity,
    },
  });
}

/**
 * Get resource capacity status for a tenant
 */
export async function getTeamCapacityStatus(tenantId: string) {
  const allocations = await prisma.mrmResourceAllocation.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
    },
  });

  const summary = {
    totalAllocated: 0,
    totalUtilized: 0,
    totalRemaining: 0,
    averageCapacity: 0,
    overallocated: [] as any[],
  };

  allocations.forEach((alloc) => {
    summary.totalAllocated += alloc.allocatedHours;
    summary.totalUtilized += alloc.utilizedHours;
    summary.totalRemaining += alloc.remainingHours;

    if (alloc.utilizedHours > alloc.allocatedHours) {
      summary.overallocated.push({
        id: alloc.id,
        resourceName: alloc.resourceName,
        excess: alloc.utilizedHours - alloc.allocatedHours,
      });
    }
  });

  summary.averageCapacity =
    allocations.length > 0
      ? (summary.totalUtilized / summary.totalAllocated) * 100
      : 0;

  return summary;
}

/**
 * Update resource allocation status
 */
export async function updateResourceAllocationStatus(
  id: string,
  tenantId: string,
  status: "ACTIVE" | "PAUSED" | "COMPLETED",
) {
  const allocation = await prisma.mrmResourceAllocation.findFirst({
    where: { id, tenantId },
  });

  if (!allocation) {
    throw AppError.notFound("Resourcetoewijzing niet gevonden");
  }

  return prisma.mrmResourceAllocation.update({
    where: { id },
    data: { status },
  });
}

/**
 * Get available resources for a date range
 */
export async function getAvailableResources(
  tenantId: string,
  startDate: string,
  endDate: string,
) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const allocations = await prisma.mrmResourceAllocation.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });

  return allocations.map((alloc) => ({
    ...alloc,
    availableHours: Math.max(0, alloc.remainingHours),
  }));
}
