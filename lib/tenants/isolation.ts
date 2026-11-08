import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

/**
 * Row-level security (RLS) enforcement for multi-tenant data isolation.
 * Every query to sensitive tables must verify the requesting user has access
 * to the target tenant.
 */

export interface DataBoundary {
  tenantId: string;
  userId: string;
  role: string;
}

/**
 * Verify a user has access to a tenant.
 */
export async function verifyTenantAccess(
  userId: string,
  tenantId: string
): Promise<boolean> {
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId_role: { userId, tenantId, role: "HQ_ADMIN" } },
  });

  return !!membership;
}

/**
 * Get all tenants accessible to a user.
 */
export async function getUserTenants(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { tenant: true },
  });

  return memberships.map((m) => m.tenant);
}

/**
 * Enforce data isolation on a query by adding tenantId filter.
 * Use this wrapper around any Prisma query touching multi-tenant data.
 */
export function isolatedQuery<T>(
  tenantId: string,
  query: () => Promise<T>
): Promise<T> {
  // In a real implementation, this would validate tenantId from request context
  // and add automatic WHERE clauses via Prisma middleware
  return query();
}

/**
 * Field-level encryption for sensitive tenant data.
 */
export async function encryptTenantField(
  tenantId: string,
  plaintext: string
): Promise<string> {
  // In production, retrieve the tenant's encryption key and encrypt with AES-256-GCM
  // For now, return base64-encoded value
  return Buffer.from(plaintext).toString("base64");
}

/**
 * Decrypt tenant field.
 */
export async function decryptTenantField(
  tenantId: string,
  ciphertext: string
): Promise<string> {
  // In production, retrieve and decrypt with tenant's key
  return Buffer.from(ciphertext, "base64").toString("utf-8");
}

/**
 * Generate a per-tenant encryption key (AES-256).
 */
export function generateTenantKey(): string {
  const crypto = require("crypto");
  const key = crypto.randomBytes(32);
  return key.toString("base64");
}

/**
 * Verify row belongs to tenant before returning to user.
 */
export function assertTenantOwnership(
  row: Record<string, unknown>,
  expectedTenantId: string
) {
  const rowTenantId = row.tenantId as string | undefined;
  if (rowTenantId !== expectedTenantId) {
    throw AppError.forbidden("Unauthorized: data belongs to different tenant");
  }
}

/**
 * Get isolation rules for a model.
 */
export async function getDataIsolationRules(
  tenantId: string,
  modelName: string
) {
  return await prisma.dataIsolationRule.findUnique({
    where: { tenantId_modelName: { tenantId, modelName } },
  });
}
