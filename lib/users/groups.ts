import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { z } from 'zod';

const GroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()).default([]),
});

const RoleSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()),
  description: z.string().optional(),
});

export async function createGroup(data: z.infer<typeof GroupSchema>, createdBy: string) {
  const validated = GroupSchema.parse(data);

  return prisma.userGroup.create({
    data: {
      ...validated,
      createdBy,
      members: { connect: { id: createdBy } },
    },
  });
}

export async function getGroup(groupId: string) {
  const group = await prisma.userGroup.findUnique({
    where: { id: groupId },
    include: { members: { select: { id: true, email: true, displayName: true } } },
  });

  if (!group) throw AppError.notFound('Group not found');
  return group;
}

export async function addMemberToGroup(groupId: string, userId: string) {
  return prisma.userGroup.update({
    where: { id: groupId },
    data: { members: { connect: { id: userId } } },
  });
}

export async function removeMemberFromGroup(groupId: string, userId: string) {
  return prisma.userGroup.update({
    where: { id: groupId },
    data: { members: { disconnect: { id: userId } } },
  });
}

export async function createRole(data: z.infer<typeof RoleSchema>) {
  const validated = RoleSchema.parse(data);

  return prisma.userRole.create({
    data: validated,
  });
}

export async function assignRoleToUser(userId: string, roleId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { roles: { connect: { id: roleId } } },
  });
}

export async function getUserRoles(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: true },
  });

  return user?.roles || [];
}

export async function getGroupAnalytics(groupId: string) {
  const group = await getGroup(groupId);

  return {
    groupId,
    memberCount: group.members.length,
    createdAt: group.createdAt,
    members: group.members,
  };
}
