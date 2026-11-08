import { z } from "zod";

export const roleSchema = z.enum(["owner", "admin", "member", "viewer"]);
export type Role = z.infer<typeof roleSchema>;

export const rolePermissions: Record<Role, Set<string>> = {
  owner: new Set([
    "manage_team",
    "manage_members",
    "manage_billing",
    "manage_settings",
    "manage_api_keys",
    "manage_webhooks",
    "view_analytics",
    "export_data",
  ]),
  admin: new Set([
    "manage_members",
    "manage_settings",
    "manage_api_keys",
    "view_analytics",
    "export_data",
  ]),
  member: new Set([
    "view_analytics",
    "manage_content",
    "collaborate",
  ]),
  viewer: new Set([
    "view_analytics",
  ]),
};

export function hasPermission(role: Role, permission: string): boolean {
  const permissions = rolePermissions[role];
  return permissions ? permissions.has(permission) : false;
}

export const teamMemberSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
  role: roleSchema,
  joinedAt: z.date(),
  invitedBy: z.string().uuid().nullable(),
  status: z.enum(["active", "invited", "inactive"]),
});

export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  createdAt: z.date(),
  plan: z.enum(["free", "pro", "business", "enterprise"]),
  maxMembers: z.number(),
  memberCount: z.number(),
});

export type Team = z.infer<typeof teamSchema>;

export const activityLogSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  userId: z.string().uuid(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  changes: z.record(z.unknown()).optional(),
  timestamp: z.date(),
  ipAddress: z.string().ip().optional(),
});

export type ActivityLog = z.infer<typeof activityLogSchema>;

export const documentSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  createdBy: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  sharedWith: z.array(z.string().uuid()).optional(),
  public: z.boolean().default(false),
});

export type Document = z.infer<typeof documentSchema>;

export async function inviteTeamMember(
  teamId: string,
  email: string,
  role: Role,
  invitedBy: string,
) {
  // In production: create invitation, send email
  return {
    id: crypto.randomUUID(),
    teamId,
    email,
    role,
    invitedBy,
    status: "invited" as const,
  };
}

export async function removeTeamMember(teamId: string, userId: string) {
  // In production: delete member, revoke access
  return { success: true };
}

export async function logActivity(
  teamId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  changes?: Record<string, unknown>,
) {
  // In production: save to database
  return {
    id: crypto.randomUUID(),
    teamId,
    userId,
    action,
    resourceType,
    resourceId,
    changes,
    timestamp: new Date(),
  };
}
