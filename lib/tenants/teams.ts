import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

/**
 * Team management with hierarchical structure and role-based permissions.
 */

export const teamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().optional(),
  permissions: z.array(z.string()).default([]),
});

export const teamMemberSchema = z.object({
  userId: z.string(),
  teamId: z.string().optional(),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"]),
  title: z.string().optional(),
  department: z.string().optional(),
  customPermissions: z.array(z.string()).optional(),
});

/**
 * Create a new team within a tenant.
 */
export async function createTeam(
  tenantId: string,
  data: z.infer<typeof teamSchema>
) {
  const validated = teamSchema.parse(data);

  // Verify parent team exists and belongs to same tenant
  if (validated.parentId) {
    const parentTeam = await prisma.team.findUnique({
      where: { id: validated.parentId },
    });

    if (!parentTeam || parentTeam.tenantId !== tenantId) {
      throw AppError.validation("Invalid parent team");
    }
  }

  return await prisma.team.create({
    data: {
      tenantId,
      ...validated,
    },
  });
}

/**
 * Get team hierarchy.
 */
export async function getTeamHierarchy(tenantId: string, teamId?: string) {
  const where: any = { tenantId };
  if (teamId) {
    where.id = teamId;
  }

  return await prisma.team.findMany({
    where,
    include: {
      children: true,
      members: {
        include: { user: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Add member to team.
 */
export async function addTeamMember(
  tenantId: string,
  data: z.infer<typeof teamMemberSchema>
) {
  const validated = teamMemberSchema.parse(data);

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: validated.userId },
  });

  if (!user) {
    throw AppError.notFound("User not found");
  }

  // Verify user is a member of the tenant
  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId_role: {
        userId: validated.userId,
        tenantId,
        role: "HQ_ADMIN", // Simplified: check for any membership
      },
    },
  });

  if (!membership) {
    throw AppError.validation("User is not a member of this tenant");
  }

  // Check if team exists
  if (validated.teamId) {
    const team = await prisma.team.findUnique({
      where: { id: validated.teamId },
    });

    if (!team || team.tenantId !== tenantId) {
      throw AppError.notFound("Team not found");
    }
  }

  // Check for existing membership
  const existing = await prisma.teamMember.findFirst({
    where: {
      userId: validated.userId,
      tenantId,
    },
  });

  if (existing) {
    throw AppError.validation("User is already a member of this tenant");
  }

  return await prisma.teamMember.create({
    data: {
      userId: validated.userId,
      tenantId,
      teamId: validated.teamId,
      role: validated.role as any,
      title: validated.title,
      department: validated.department,
      customPermissions: validated.customPermissions || [],
    },
  });
}

/**
 * Get team members.
 */
export async function getTeamMembers(tenantId: string, teamId?: string) {
  return await prisma.teamMember.findMany({
    where: {
      tenantId,
      ...(teamId && { teamId }),
      removedAt: null,
    },
    include: { user: true, team: true },
    orderBy: { joinedAt: "asc" },
  });
}

/**
 * Update team member role/permissions.
 */
export async function updateTeamMember(
  tenantId: string,
  memberId: string,
  data: Partial<z.infer<typeof teamMemberSchema>>
) {
  const member = await prisma.teamMember.findUnique({
    where: { id: memberId },
  });

  if (!member || member.tenantId !== tenantId) {
    throw AppError.notFound("Team member not found");
  }

  return await prisma.teamMember.update({
    where: { id: memberId },
    data,
  });
}

/**
 * Remove member from team (soft delete).
 */
export async function removeTeamMember(
  tenantId: string,
  memberId: string
) {
  const member = await prisma.teamMember.findUnique({
    where: { id: memberId },
  });

  if (!member || member.tenantId !== tenantId) {
    throw AppError.notFound("Team member not found");
  }

  return await prisma.teamMember.update({
    where: { id: memberId },
    data: { removedAt: new Date() },
  });
}

/**
 * Get user's effective permissions within tenant.
 */
export async function getUserPermissions(
  userId: string,
  tenantId: string
): Promise<string[]> {
  const member = await prisma.teamMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    include: { team: true },
  });

  if (!member || member.removedAt) {
    return [];
  }

  // Start with team permissions
  let permissions: Set<string> = new Set();

  // Get inherited team permissions
  if (member.team) {
    member.team.permissions.forEach((p) => permissions.add(p));
  }

  // Add custom permissions
  member.customPermissions.forEach((p) => permissions.add(p));

  // Add role-based permissions
  const rolePermissions = getRolePermissions(member.role);
  rolePermissions.forEach((p) => permissions.add(p));

  return Array.from(permissions);
}

/**
 * Get default permissions for a role.
 */
function getRolePermissions(role: string): string[] {
  const rolePerms: Record<string, string[]> = {
    OWNER: [
      "tenant:manage",
      "team:manage",
      "billing:manage",
      "sso:configure",
      "data:export",
      "audit:view",
    ],
    ADMIN: [
      "team:manage",
      "members:manage",
      "domains:manage",
      "billing:view",
      "audit:view",
    ],
    MANAGER: [
      "team:view",
      "members:manage",
      "reports:view",
      "audit:view",
    ],
    MEMBER: ["team:view", "reports:view"],
    VIEWER: ["team:view"],
  };

  return rolePerms[role] || [];
}

/**
 * Check if user has permission.
 */
export async function hasPermission(
  userId: string,
  tenantId: string,
  permission: string
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, tenantId);
  return permissions.includes(permission);
}

/**
 * Move team to new parent (reorganize).
 */
export async function moveTeam(
  tenantId: string,
  teamId: string,
  newParentId: string | null
) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team || team.tenantId !== tenantId) {
    throw AppError.notFound("Team not found");
  }

  // Prevent circular hierarchy
  if (newParentId) {
    const newParent = await prisma.team.findUnique({
      where: { id: newParentId },
    });

    if (!newParent || newParent.tenantId !== tenantId) {
      throw AppError.validation("Invalid parent team");
    }

    // Check for circular reference
    let current = newParent.parentId;
    while (current) {
      if (current === teamId) {
        throw AppError.validation("Circular hierarchy detected");
      }
      const parent = await prisma.team.findUnique({
        where: { id: current },
      });
      current = parent?.parentId || null;
    }
  }

  return await prisma.team.update({
    where: { id: teamId },
    data: { parentId: newParentId },
  });
}
