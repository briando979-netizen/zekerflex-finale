import { UserRole } from "@prisma/client";

export type Permission =
  | "read:users"
  | "write:users"
  | "delete:users"
  | "read:admin"
  | "write:admin"
  | "read:finance"
  | "write:finance"
  | "read:reports"
  | "write:reports"
  | "read:security"
  | "write:security"
  | "manage:sso"
  | "manage:mfa"
  | "manage:api_keys"
  | "read:audit"
  | "export:data"
  | "manage:billing"
  | "manage:teams"
  | "manage:webhooks"
  | "manage:integrations"
  | "moderate:content"
  | "manage:support_tickets";

export type ResourceType = "user" | "tenant" | "invoice" | "shift" | "report" | "api_key" | "webhook" | "setting";

export interface ResourcePermission {
  resource: ResourceType;
  action: "create" | "read" | "update" | "delete";
  conditions?: Record<string, any>;
  fieldsAllowed?: string[];
}

const rolePermissions: Record<UserRole, Permission[]> = {
  FREELANCER: ["read:users", "read:reports", "export:data"],
  LOCAL_MANAGER: [
    "read:users",
    "write:users",
    "read:admin",
    "read:reports",
    "write:reports",
    "export:data",
  ],
  HQ_ADMIN: [
    "read:users",
    "write:users",
    "read:admin",
    "write:admin",
    "read:finance",
    "write:finance",
    "manage:sso",
    "manage:mfa",
    "manage:api_keys",
    "manage:teams",
    "manage:billing",
  ],
  DISPUTE_MANAGER: ["read:users", "read:reports", "read:finance", "write:reports", "moderate:content"],
  SALES: ["read:users", "write:users", "read:reports", "export:data"],
  PLATFORM_ADMIN: [
    "read:users",
    "write:users",
    "delete:users",
    "read:admin",
    "write:admin",
    "read:finance",
    "write:finance",
    "read:reports",
    "write:reports",
    "read:security",
    "write:security",
    "manage:sso",
    "manage:mfa",
    "manage:api_keys",
    "read:audit",
    "export:data",
    "manage:billing",
    "manage:teams",
    "manage:webhooks",
    "manage:integrations",
    "moderate:content",
    "manage:support_tickets",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function getPermissionsForRole(role: UserRole): Permission[] {
  return rolePermissions[role] || [];
}

export interface ABACContext {
  userId: string;
  tenantId: string;
  resourceOwnerId?: string;
  timestamp: Date;
  ipAddress?: string;
  deviceId?: string;
  isAdmin?: boolean;
  department?: string;
}

export function checkABAC(
  context: ABACContext,
  permission: Permission,
  resource: any
): boolean {
  // Admin always has access
  if (context.isAdmin) return true;

  // Owner can read their own resource
  if (permission.startsWith("read:") && resource.ownerId === context.userId) return true;

  // Time-based access (e.g., business hours only)
  const now = new Date();
  const hour = now.getHours();
  if (permission.includes("admin") && (hour < 6 || hour > 22)) return false;

  // Geographic/IP-based access for sensitive operations
  if (permission.includes("write:admin") && context.ipAddress) {
    // In production, check against IP whitelist
    const allowedIPs = ["192.168.1.0/24", "203.0.113.0/24"];
    // Implement CIDR check here
  }

  return false;
}

export interface ResourceLevelPermission {
  resource: string;
  resourceId: string;
  action: "create" | "read" | "update" | "delete";
  userId: string;
  tenantId: string;
  grantedAt: Date;
  expiresAt?: Date;
}

export function checkResourcePermission(
  permission: ResourceLevelPermission,
  action: "create" | "read" | "update" | "delete"
): boolean {
  if (permission.action !== action) return false;
  if (permission.expiresAt && permission.expiresAt < new Date()) return false;
  return true;
}

export function createTimeLimitedPermission(
  resource: string,
  resourceId: string,
  userId: string,
  tenantId: string,
  durationMinutes: number
): ResourceLevelPermission {
  const now = new Date();
  return {
    resource,
    resourceId,
    action: "read",
    userId,
    tenantId,
    grantedAt: now,
    expiresAt: new Date(now.getTime() + durationMinutes * 60000),
  };
}

export interface DeviceTrust {
  deviceId: string;
  userId: string;
  fingerprint: string;
  lastUsed: Date;
  trusted: boolean;
  osType: "windows" | "macos" | "linux" | "ios" | "android";
  browserName: string;
}

export function checkDeviceTrust(trust: DeviceTrust): boolean {
  // Require re-authentication if device not trusted and last used > 7 days ago
  const lastUsedDate = trust.lastUsed;
  const daysSinceLastUse = (Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24);
  return trust.trusted || daysSinceLastUse < 7;
}

export interface GeofencePermission {
  userId: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  allowedDuringHours: { start: number; end: number };
}

export function checkGeofence(perm: GeofencePermission, userLat: number, userLon: number): boolean {
  // Haversine distance calculation
  const R = 6371; // Earth radius in km
  const dLat = ((userLat - perm.latitude) * Math.PI) / 180;
  const dLon = ((userLon - perm.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((perm.latitude * Math.PI) / 180) *
      Math.cos((userLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  const now = new Date();
  const hour = now.getHours();
  const inHours = hour >= perm.allowedDuringHours.start && hour <= perm.allowedDuringHours.end;

  return distance <= perm.radiusKm && inHours;
}
