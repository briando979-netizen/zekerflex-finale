import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import { recordAuditEvent } from "./compliance";
import { generateTenantKey } from "./isolation";

/**
 * Tenant lifecycle management: create, read, update, delete.
 */

export const createTenantSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["PLATFORM", "ENTERPRISE_HQ", "FRANCHISE"]),
  country: z.string().default("NL"),
  kvkNumber: z.string().optional(),
  parentId: z.string().optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  country: z.string().optional(),
  kvkNumber: z.string().optional(),
});

/**
 * Create a new tenant with full enterprise setup.
 */
export async function createTenant(
  data: z.infer<typeof createTenantSchema>,
  adminUserId?: string
) {
  const validated = createTenantSchema.parse(data);

  // Create tenant
  const tenant = await prisma.tenant.create({
    data: {
      ...validated,
    },
  });

  // Generate encryption key for tenant
  const encryptionKey = generateTenantKey();
  await prisma.tenantEncryptionKey.create({
    data: {
      tenantId: tenant.id,
      encryptedKeyMaterial: encryptionKey,
    },
  });

  // Add admin to tenant if provided
  if (adminUserId) {
    await prisma.membership.create({
      data: {
        userId: adminUserId,
        tenantId: tenant.id,
        role: "HQ_ADMIN",
      },
    });

    // Create default team
    const defaultTeam = await prisma.team.create({
      data: {
        tenantId: tenant.id,
        name: "Default Team",
        permissions: ["tenant:manage", "team:view"],
      },
    });

    // Add admin to default team
    await prisma.teamMember.create({
      data: {
        userId: adminUserId,
        tenantId: tenant.id,
        teamId: defaultTeam.id,
        role: "OWNER" as any,
      },
    });
  }

  // Record audit event
  await recordAuditEvent({
    tenantId: tenant.id,
    action: "TENANT_CREATED",
    actorId: adminUserId,
    targetType: "Tenant",
    targetId: tenant.id,
    changes: validated,
  });

  return tenant;
}

/**
 * Get tenant by ID.
 */
export async function getTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      domains: true,
      teams: true,
      ssoProviders: true,
    },
  });

  if (!tenant) {
    throw AppError.notFound("Tenant not found");
  }

  return tenant;
}

/**
 * Update tenant.
 */
export async function updateTenant(
  tenantId: string,
  data: z.infer<typeof updateTenantSchema>,
  actorId?: string
) {
  const existing = await getTenant(tenantId);
  const validated = updateTenantSchema.parse(data);

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: validated,
  });

  // Record audit event
  await recordAuditEvent({
    tenantId,
    action: "TENANT_UPDATED",
    actorId,
    targetType: "Tenant",
    targetId: tenantId,
    changes: {
      before: {
        name: existing.name,
        country: existing.country,
      },
      after: validated,
    },
  });

  return updated;
}

/**
 * List all tenants.
 */
export async function listTenants(limit = 50, offset = 0) {
  return await prisma.tenant.findMany({
    take: limit,
    skip: offset,
    orderBy: { createdAt: "desc" },
    include: {
      domains: { where: { verified: true } },
      teams: { select: { id: true, name: true } },
    },
  });
}

/**
 * Get tenant with full hierarchy (parent + children).
 */
export async function getTenantHierarchy(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      parent: true,
      children: {
        include: { children: true },
      },
    },
  });

  if (!tenant) {
    throw AppError.notFound("Tenant not found");
  }

  return tenant;
}

/**
 * Get tenant stats and usage.
 */
export async function getTenantStats(tenantId: string) {
  const tenant = await getTenant(tenantId);

  const memberCount = await prisma.membership.count({
    where: { tenantId },
  });

  const teamCount = await prisma.team.count({
    where: { tenantId },
  });

  const domainCount = await prisma.tenantDomain.count({
    where: { tenantId },
  });

  const ssoCount = await prisma.ssoProvider_rel.count({
    where: { tenantId },
  });

  const auditCount = await prisma.tenantAuditTrail.count({
    where: { tenantId },
  });

  return {
    id: tenant.id,
    name: tenant.name,
    type: tenant.type,
    members: memberCount,
    teams: teamCount,
    domains: domainCount,
    ssoProviders: ssoCount,
    auditEvents: auditCount,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

/**
 * Delete tenant and all related data.
 */
export async function deleteTenant(tenantId: string, actorId?: string) {
  const tenant = await getTenant(tenantId);

  // Record deletion
  await recordAuditEvent({
    tenantId,
    action: "TENANT_DELETED",
    actorId,
    targetType: "Tenant",
    targetId: tenantId,
    changes: { deleted: true },
  });

  // Cascade delete all tenant data
  // Note: Prisma handles this via onDelete: Cascade in schema
  return await prisma.tenant.delete({
    where: { id: tenantId },
  });
}
