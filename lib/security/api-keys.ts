/**
 * API Key Management
 *
 * Handles API key lifecycle: generation, rotation, revocation, and usage tracking.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

const KEY_PREFIX = "zf";
const KEY_SEPARATOR = "_";
const KEY_LENGTH = 32; // 32 bytes = 256 bits

/**
 * Generate a new API key
 */
export function generateApiKey(): {
  prefix: string;
  secret: string;
  full: string;
} {
  // Generate random bytes
  const randomBytes = crypto.randomBytes(KEY_LENGTH);
  const random = randomBytes.toString("hex");

  // Generate prefix (12 chars from random)
  const prefixSuffix = random.substring(0, 8).toUpperCase();
  const prefix = `${KEY_PREFIX}${KEY_SEPARATOR}live${KEY_SEPARATOR}${prefixSuffix}`;

  // Full key includes secret part
  const secretSuffix = random.substring(8, 16).toUpperCase();
  const secret = `${KEY_PREFIX}${KEY_SEPARATOR}secret${KEY_SEPARATOR}${secretSuffix}${random.substring(16)}`;

  return {
    prefix,
    secret,
    full: `${prefix}${KEY_SEPARATOR}${secret}`
  };
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Create a new API key for a tenant
 */
export async function createApiKey(
  tenantId: string,
  name: string,
  scopes: string[],
  createdById?: string
) {
  const { prefix, secret } = generateApiKey();
  const hashedKey = hashApiKey(secret);

  const apiKey = await prisma.apiKey.create({
    data: {
      name,
      prefix,
      hashedKey,
      scopes,
      tenantId,
      createdById
    }
  });

  return {
    ...apiKey,
    secret // Return secret only once
  };
}

/**
 * Verify an API key
 */
export async function verifyApiKey(secret: string): Promise<{
  valid: boolean;
  apiKey?: any;
  tenant?: any;
  error?: string;
}> {
  const hashedKey = hashApiKey(secret);

  // Extract prefix from secret (format: zf_live_XXXX_zf_secret_...)
  const parts = secret.split(KEY_SEPARATOR);
  const prefix = parts.slice(0, 4).join(KEY_SEPARATOR);

  const apiKey = await prisma.apiKey.findFirst({
    where: {
      prefix,
      hashedKey,
      revokedAt: null
    },
    include: {
      tenant: true
    }
  });

  if (!apiKey) {
    return {
      valid: false,
      error: "Invalid or revoked API key"
    };
  }

  // Update last used timestamp
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  });

  return {
    valid: true,
    apiKey,
    tenant: apiKey.tenant
  };
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(keyId: string) {
  return prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() }
  });
}

/**
 * Rotate an API key (revoke old, create new)
 */
export async function rotateApiKey(
  keyId: string,
  createdById?: string
) {
  const oldKey = await prisma.apiKey.findUnique({
    where: { id: keyId }
  });

  if (!oldKey) {
    throw new AppError("KeyNotFound", "API key not found", 404);
  }

  // Revoke old key
  await revokeApiKey(keyId);

  // Create new key with same scopes
  return createApiKey(
    oldKey.tenantId!,
    `${oldKey.name} (rotated)`,
    oldKey.scopes,
    createdById
  );
}

/**
 * Get API keys for a tenant (without secrets)
 */
export async function getApiKeys(tenantId: string) {
  return prisma.apiKey.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" }
  });
}

/**
 * Validate API key scopes
 */
export function validateScopes(requiredScope: string, keyScopes: string[]): boolean {
  // Check for exact match
  if (keyScopes.includes(requiredScope)) {
    return true;
  }

  // Check for wildcard scopes
  const [resource] = requiredScope.split(":");
  if (keyScopes.includes(`${resource}:*`)) {
    return true;
  }

  // Check for full wildcard
  if (keyScopes.includes("*")) {
    return true;
  }

  return false;
}

/**
 * Create default scopes for a key
 */
export function getDefaultScopes(type: "read" | "write" | "admin"): string[] {
  switch (type) {
    case "read":
      return [
        "shifts:read",
        "invoices:read",
        "users:read",
        "reports:read"
      ];

    case "write":
      return [
        "shifts:read",
        "shifts:write",
        "invoices:read",
        "invoices:write",
        "users:read"
      ];

    case "admin":
      return ["*"];

    default:
      return [];
  }
}

/**
 * Check rate limit for an API key
 */
export async function checkRateLimit(
  keyId: string,
  limit: number = 100,
  windowMs: number = 60000 // 1 minute
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}> {
  // This would typically use Redis for rate limiting in production
  // For now, we'll use a simple in-memory approach with database fallback

  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  // Count requests in the time window
  const count = await prisma.securityEvent.count({
    where: {
      auditLogId: keyId, // Store key ID in auditLogId for this purpose
      timestamp: { gte: windowStart }
    }
  });

  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count - 1),
    resetAt: new Date(now.getTime() + windowMs)
  };
}

/**
 * Get API key statistics
 */
export async function getKeyStatistics(keyId: string) {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: keyId },
    include: {
      _count: {
        select: { apiKeysCreated: true }
      }
    }
  });

  if (!apiKey) {
    throw new AppError("KeyNotFound", "API key not found", 404);
  }

  return {
    lastUsedAt: apiKey.lastUsedAt,
    revokedAt: apiKey.revokedAt,
    age: Date.now() - apiKey.createdAt.getTime(),
    scopes: apiKey.scopes,
    isActive: !apiKey.revokedAt
  };
}
