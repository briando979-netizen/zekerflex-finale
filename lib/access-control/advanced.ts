import { prisma } from "@/lib/prisma";

export type Role = "ADMIN" | "MANAGER" | "USER" | "VIEWER" | "GUEST";
export type AccessType = "RBAC" | "ABAC" | "PBAC";

export interface AccessPolicy {
  id: string;
  name: string;
  type: AccessType;
  rules: AccessRule[];
  active: boolean;
}

export interface AccessRule {
  resource: string;
  action: string;
  effect: "ALLOW" | "DENY";
  conditions?: AccessCondition[];
  priority: number;
}

export interface AccessCondition {
  attribute: string;
  operator: "EQUALS" | "NOT_EQUALS" | "CONTAINS" | "GREATER_THAN" | "LESS_THAN" | "IN" | "NOT_IN";
  value: any;
}

export class AccessControlManager {
  // Role-Based Access Control (RBAC)
  static ROLE_PERMISSIONS: Record<Role, string[]> = {
    ADMIN: [
      "admin.*",
      "users.manage",
      "compliance.manage",
      "audit.view",
      "settings.manage",
      "reports.view",
    ],
    MANAGER: [
      "users.view",
      "users.edit",
      "teams.manage",
      "reports.view",
      "audit.view",
    ],
    USER: [
      "profile.edit",
      "data.view",
      "data.edit",
      "reports.own",
      "audit.own",
    ],
    VIEWER: ["data.view", "reports.view"],
    GUEST: ["data.view"],
  };

  // Attribute-Based Access Control (ABAC)
  static async evaluateABAC(
    principal: { userId: string; role: Role; department?: string; location?: string },
    resource: { type: string; owner?: string; classification?: string; sensitivity?: string },
    action: string
  ): Promise<boolean> {
    const policies = await prisma.accessPolicy.findMany({
      where: { active: true, type: "ABAC" },
    });

    for (const policy of policies) {
      const matches = policy.rules.every((rule: any) => {
        if (rule.resource !== resource.type && rule.resource !== "*") return false;
        if (rule.action !== action && rule.action !== "*") return false;

        if (rule.conditions && rule.conditions.length > 0) {
          return rule.conditions.every((cond: any) => this.evaluateCondition(cond, principal, resource));
        }

        return true;
      });

      if (matches) {
        const effect = policy.rules.find((r: any) => r.resource === resource.type || r.resource === "*")?.effect;
        return effect === "ALLOW";
      }
    }

    return false;
  }

  private static evaluateCondition(condition: AccessCondition, principal: any, resource: any): boolean {
    const value = principal[condition.attribute] ?? resource[condition.attribute];

    switch (condition.operator) {
      case "EQUALS":
        return value === condition.value;
      case "NOT_EQUALS":
        return value !== condition.value;
      case "CONTAINS":
        return String(value).includes(condition.value);
      case "GREATER_THAN":
        return Number(value) > condition.value;
      case "LESS_THAN":
        return Number(value) < condition.value;
      case "IN":
        return Array.isArray(condition.value) && condition.value.includes(value);
      case "NOT_IN":
        return Array.isArray(condition.value) && !condition.value.includes(value);
      default:
        return false;
    }
  }

  // Policy-Based Access Control (PBAC)
  static async evaluatePBAC(
    principal: { userId: string; policies: string[] },
    resource: string,
    action: string
  ): Promise<boolean> {
    const policies = await prisma.accessPolicy.findMany({
      where: {
        id: { in: principal.policies },
        active: true,
        type: "PBAC",
      },
    });

    for (const policy of policies) {
      const matches = policy.rules.some(
        (rule: any) =>
          (rule.resource === resource || rule.resource === "*") &&
          (rule.action === action || rule.action === "*") &&
          rule.effect === "ALLOW"
      );

      if (matches) return true;
    }

    return false;
  }

  // Time-Based Access
  static isAccessAllowed(allowedHours?: { start: number; end: number }): boolean {
    if (!allowedHours) return true;

    const now = new Date().getUTCHours();
    return now >= allowedHours.start && now <= allowedHours.end;
  }

  // Location-Based Access
  static isLocationAllowed(currentLocation: string, allowedLocations?: string[]): boolean {
    if (!allowedLocations || allowedLocations.length === 0) return true;
    return allowedLocations.includes(currentLocation);
  }

  // Device-Based Access
  static isDeviceAllowed(deviceId: string, allowedDevices?: string[]): boolean {
    if (!allowedDevices || allowedDevices.length === 0) return true;
    return allowedDevices.includes(deviceId);
  }

  // RBAC Validation
  static hasPermission(role: Role, requiredPermission: string): boolean {
    const permissions = this.ROLE_PERMISSIONS[role] || [];

    return permissions.some((perm) => {
      if (perm === "*") return true;
      if (perm.endsWith(".*")) {
        const prefix = perm.slice(0, -2);
        return requiredPermission.startsWith(prefix);
      }
      return perm === requiredPermission;
    });
  }

  static async grantAccess(
    userId: string,
    resource: string,
    action: string,
    duration?: number
  ): Promise<void> {
    const expiresAt = duration ? new Date(Date.now() + duration) : null;

    await prisma.accessGrant.create({
      data: {
        userId,
        resource,
        action,
        expiresAt,
        grantedAt: new Date(),
      },
    });
  }

  static async revokeAccess(userId: string, resource: string, action?: string): Promise<void> {
    await prisma.accessGrant.deleteMany({
      where: {
        userId,
        resource,
        ...(action && { action }),
      },
    });
  }

  static async hasGrant(userId: string, resource: string, action: string): Promise<boolean> {
    const grant = await prisma.accessGrant.findFirst({
      where: {
        userId,
        resource,
        action,
        expiresAt: { gt: new Date() },
      },
    });

    return !!grant;
  }

  static async createPolicy(policy: AccessPolicy): Promise<void> {
    await prisma.accessPolicy.create({
      data: {
        name: policy.name,
        type: policy.type,
        rules: policy.rules,
        active: policy.active,
      },
    });
  }
}
