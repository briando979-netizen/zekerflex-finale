/**
 * Advanced Security & Access Control API
 *
 * Endpoints for managing security, access control, and audit logging.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { AppError } from "@/lib/errors";

import * as rbac from "@/lib/security/rbac";
import * as abac from "@/lib/security/abac";
import * as apiKeys from "@/lib/security/api-keys";
import * as sso from "@/lib/security/sso";
import * as auditLogging from "@/lib/security/audit-logging";
import * as encryption from "@/lib/security/encryption";

import { z } from "zod";

// Validation schemas
const roleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissionCodes: z.array(z.string()),
  priority: z.number().default(0)
});

const permissionSchema = z.object({
  code: z.string().min(1),
  description: z.string().optional(),
  resource: z.string(),
  action: z.string()
});

const assignRoleSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  activatedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional()
});

const apiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.string()),
  type: z.enum(["read", "write", "admin"]).optional()
});

const abacPolicySchema = z.object({
  name: z.string().min(1),
  rules: z.array(z.object({
    attribute: z.string(),
    operator: z.enum(["eq", "ne", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "matches"]),
    value: z.any().optional(),
    values: z.array(z.any()).optional()
  })),
  effect: z.enum(["allow", "deny"]).default("allow"),
  resources: z.array(z.string()).optional()
});

/**
 * GET - Retrieve security configuration and audit logs
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
    }

    // Different endpoints based on action parameter
    switch (action) {
      case "roles":
        const roles = await rbac.getRoles(tenantId);
        return NextResponse.json({ roles });

      case "permissions":
        return NextResponse.json({ message: "Get permissions endpoint" });

      case "audit-log":
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const limit = parseInt(searchParams.get("limit") || "100");

        const auditLog = await auditLogging.getAuditLog(tenantId, {
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          limit
        });
        return NextResponse.json({ auditLog });

      case "security-stats":
        const stats = await auditLogging.getSecurityStats(tenantId, 30);
        return NextResponse.json({ stats });

      case "suspicious-activity":
        const userId = searchParams.get("userId");
        if (!userId) {
          return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }
        const suspicious = await auditLogging.detectSuspiciousActivity(tenantId, userId);
        return NextResponse.json({ suspicious });

      case "api-keys":
        const keys = await apiKeys.getApiKeys(tenantId);
        return NextResponse.json({ keys });

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("GET /api/security error:", error);
    return NextResponse.json(
      { error: error instanceof AppError ? error.message : "Internal server error" },
      { status: error instanceof AppError ? error.statusCode : 500 }
    );
  }
}

/**
 * POST - Create resources or perform actions
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: "Missing tenantId" }, { status: 400 });
    }

    switch (action) {
      case "create-role": {
        const validated = roleSchema.parse(body);
        const role = await rbac.ensureBuiltInRole(
          tenantId,
          validated.name,
          validated.permissionCodes
        );
        await auditLogging.logSecurityEvent(tenantId, {
          userId: session.user.id,
          eventType: "admin_action",
          action: "role.created",
          resource: role.id,
          newValue: { name: role.name },
          severity: "warning"
        });
        return NextResponse.json({ role });
      }

      case "assign-role": {
        const validated = assignRoleSchema.parse(body);
        const membership = await rbac.assignRole(
          validated.userId,
          validated.roleId,
          {
            activatedAt: validated.activatedAt ? new Date(validated.activatedAt) : undefined,
            expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : undefined,
            metadata: validated.metadata
          }
        );
        await auditLogging.logSecurityEvent(tenantId, {
          userId: session.user.id,
          eventType: "role_assigned",
          action: "role.assigned",
          resource: validated.userId,
          newValue: { roleId: validated.roleId },
          severity: "info"
        });
        return NextResponse.json({ membership });
      }

      case "create-api-key": {
        const validated = apiKeySchema.parse(body);
        const scopes = validated.scopes.length > 0
          ? validated.scopes
          : apiKeys.getDefaultScopes(validated.type || "read");

        const apiKey = await apiKeys.createApiKey(
          tenantId,
          validated.name,
          scopes,
          session.user.id
        );
        await auditLogging.logSecurityEvent(tenantId, {
          userId: session.user.id,
          eventType: "api_key_created",
          action: "api_key.created",
          resource: apiKey.id,
          newValue: { name: apiKey.name, scopes },
          severity: "warning"
        });
        return NextResponse.json({ apiKey });
      }

      case "revoke-api-key": {
        const { keyId } = body;
        if (!keyId) {
          return NextResponse.json({ error: "Missing keyId" }, { status: 400 });
        }
        await apiKeys.revokeApiKey(keyId);
        await auditLogging.logSecurityEvent(tenantId, {
          userId: session.user.id,
          eventType: "api_key_revoked",
          action: "api_key.revoked",
          resource: keyId,
          severity: "warning"
        });
        return NextResponse.json({ success: true });
      }

      case "create-abac-policy": {
        const validated = abacPolicySchema.parse(body);
        const policy = await abac.createAttributePolicy(
          tenantId,
          validated.name,
          validated.rules,
          {
            effect: validated.effect,
            resources: validated.resources
          }
        );
        await auditLogging.logSecurityEvent(tenantId, {
          userId: session.user.id,
          eventType: "config_change",
          action: "policy.created",
          resource: policy.id,
          newValue: { name: policy.name },
          severity: "warning"
        });
        return NextResponse.json({ policy });
      }

      case "check-abac":  {
        const { context, resourceType } = body;
        const evaluation = await abac.evaluateABACPolicies(tenantId, context, resourceType);
        return NextResponse.json({ evaluation });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("POST /api/security error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof AppError ? error.message : "Internal server error" },
      { status: error instanceof AppError ? error.statusCode : 500 }
    );
  }
}

/**
 * PUT - Update security resources
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, tenantId, resourceId } = body;

    if (!tenantId || !resourceId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    switch (action) {
      case "rotate-api-key": {
        const newKey = await apiKeys.rotateApiKey(resourceId, session.user.id);
        await auditLogging.logSecurityEvent(tenantId, {
          userId: session.user.id,
          eventType: "admin_action",
          action: "api_key.rotated",
          resource: resourceId,
          severity: "warning"
        });
        return NextResponse.json({ apiKey: newKey });
      }

      case "update-abac-policy": {
        const validated = abacPolicySchema.partial().parse(body);
        const policy = await abac.updateAttributePolicy(resourceId, validated);
        return NextResponse.json({ policy });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("PUT /api/security error:", error);
    return NextResponse.json(
      { error: error instanceof AppError ? error.message : "Internal server error" },
      { status: error instanceof AppError ? error.statusCode : 500 }
    );
  }
}

/**
 * DELETE - Remove security resources
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");
    const tenantId = searchParams.get("tenantId");
    const resourceId = searchParams.get("resourceId");

    if (!tenantId || !resourceId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    switch (action) {
      case "revoke-role": {
        const userId = searchParams.get("userId");
        if (!userId) {
          return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }
        await rbac.revokeRole(userId, resourceId);
        await auditLogging.logSecurityEvent(tenantId, {
          userId: session.user.id,
          eventType: "role_revoked",
          action: "role.revoked",
          resource: userId,
          severity: "warning"
        });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("DELETE /api/security error:", error);
    return NextResponse.json(
      { error: error instanceof AppError ? error.message : "Internal server error" },
      { status: error instanceof AppError ? error.statusCode : 500 }
    );
  }
}
