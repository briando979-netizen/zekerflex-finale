/**
 * Role-Based Access Control (RBAC)
 *
 * Manages roles, permissions, and hierarchical access control.
 * Supports built-in and custom roles with priority-based overrides.
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export type RoleLevel = "admin" | "manager" | "viewer" | "custom";

/**
 * Get all roles for a tenant
 */
export async function getRoles(tenantId: string) {
  return prisma.role.findMany({
    where: { tenantId, isActive: true },
    include: {
      permissions: true,
      memberships: {
        where: {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }
    },
    orderBy: { priority: "desc" }
  });
}

/**
 * Get or create a built-in role
 */
export async function ensureBuiltInRole(
  tenantId: string,
  name: string,
  permissions: string[]
) {
  const role = await prisma.role.findUnique({
    where: { tenantId_name: { tenantId, name } }
  });

  if (role) {
    return role;
  }

  // Create role with permissions
  return prisma.role.create({
    data: {
      tenantId,
      name,
      isBuiltIn: true,
      priority: 100,
      isActive: true,
      permissions: {
        connectOrCreate: permissions.map(code => ({
          where: { tenantId_code: { tenantId, code } },
          create: { tenantId, code }
        }))
      }
    },
    include: { permissions: true }
  });
}

/**
 * Assign a role to a user
 */
export async function assignRole(
  userId: string,
  roleId: string,
  options?: {
    activatedAt?: Date;
    expiresAt?: Date;
    metadata?: Record<string, any>;
    reason?: string;
  }
) {
  const existing = await prisma.roleMembership.findUnique({
    where: { userId_roleId: { userId, roleId } }
  });

  if (existing) {
    throw new AppError("RoleAlreadyAssigned", "User already has this role", 409);
  }

  const membership = await prisma.roleMembership.create({
    data: {
      userId,
      roleId,
      activatedAt: options?.activatedAt,
      expiresAt: options?.expiresAt,
      metadata: options?.metadata || {}
    },
    include: { role: { include: { permissions: true } } }
  });

  // Log the assignment
  await prisma.roleAuditLog.create({
    data: {
      tenantId: (await prisma.role.findUnique({ where: { id: roleId } }))?.tenantId || "",
      userId,
      roleId,
      action: "added",
      reason: options?.reason
    }
  });

  return membership;
}

/**
 * Revoke a role from a user
 */
export async function revokeRole(
  userId: string,
  roleId: string,
  reason?: string
) {
  const membership = await prisma.roleMembership.findUnique({
    where: { userId_roleId: { userId, roleId } },
    include: { role: true }
  });

  if (!membership) {
    throw new AppError("RoleNotAssigned", "User does not have this role", 404);
  }

  await prisma.roleMembership.delete({
    where: { userId_roleId: { userId, roleId } }
  });

  // Log the revocation
  await prisma.roleAuditLog.create({
    data: {
      tenantId: membership.role.tenantId,
      userId,
      roleId,
      action: "removed",
      reason
    }
  });
}

/**
 * Get effective permissions for a user (with time-based validation)
 */
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  const now = new Date();

  const memberships = await prisma.roleMembership.findMany({
    where: {
      userId,
      OR: [
        { activatedAt: null },
        { activatedAt: { lte: now } }
      ],
      AND: [
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } }
          ]
        }
      ]
    },
    include: {
      role: {
        include: {
          permissions: true
        }
      }
    },
    orderBy: { role: { priority: "desc" } }
  });

  // Collect all unique permission codes
  const permissions = new Set<string>();

  for (const membership of memberships) {
    for (const permission of membership.role.permissions) {
      permissions.add(permission.code);
    }
  }

  return permissions;
}

/**
 * Check if a user has a specific permission
 */
export async function hasPermission(
  userId: string,
  permissionCode: string
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissions.has(permissionCode);
}

/**
 * Check if a user has any of the given permissions
 */
export async function hasAnyPermission(
  userId: string,
  permissionCodes: string[]
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  return permissionCodes.some(code => permissions.has(code));
}

/**
 * Create a custom permission
 */
export async function createPermission(
  tenantId: string,
  code: string,
  options?: {
    description?: string;
    resource?: string;
    action?: string;
  }
) {
  const existing = await prisma.permission.findUnique({
    where: { tenantId_code: { tenantId, code } }
  });

  if (existing) {
    throw new AppError("PermissionExists", "Permission already exists", 409);
  }

  return prisma.permission.create({
    data: {
      tenantId,
      code,
      description: options?.description,
      resource: options?.resource,
      action: options?.action
    }
  });
}

/**
 * Export effective roles for a user (sorted by priority)
 */
export async function getUserRoles(userId: string) {
  const now = new Date();

  return prisma.roleMembership.findMany({
    where: {
      userId,
      OR: [
        { activatedAt: null },
        { activatedAt: { lte: now } }
      ],
      AND: [
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } }
          ]
        }
      ]
    },
    include: { role: true },
    orderBy: { role: { priority: "desc" } }
  });
}
