import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Data Isolation - Row-level security, tenant-scoped queries, data residency, compliance per tenant
 */

const dataIsolationPolicySchema = z.object({
  dataResidency: z.enum(["EU", "US", "APAC"]).default("EU"),
  complianceFrameworks: z.array(z.string()).default(["GDPR"]),
  requireMfa: z.boolean().default(false),
  ipWhitelistEnabled: z.boolean().default(false),
  ipWhitelist: z.array(z.string()).default([]),
  encryptionAtRest: z.boolean().default(true),
  encryptionInTransit: z.boolean().default(true),
  keyManagement: z.enum(["platform", "customer_provided"]).default("platform"),
  enableAuditLog: z.boolean().default(true),
  auditLogRetentionDays: z.number().int().min(7).max(2555).default(90),
  allowExport: z.boolean().default(true),
  allowImport: z.boolean().default(true),
});

export type DataIsolationPolicy = z.infer<typeof dataIsolationPolicySchema>;

/**
 * Get the data isolation policy for a tenant
 */
export async function getTenantDataIsolationPolicy(
  tenantId: string
): Promise<DataIsolationPolicy | null> {
  const policy = await prisma.tenantDataIsolationPolicy.findUnique({
    where: { tenantId },
  });

  return policy as DataIsolationPolicy | null;
}

/**
 * Create or update data isolation policy for a tenant
 */
export async function setDataIsolationPolicy(
  tenantId: string,
  data: Partial<DataIsolationPolicy>
) {
  const validated = dataIsolationPolicySchema.partial().parse(data);

  return await prisma.tenantDataIsolationPolicy.upsert({
    where: { tenantId },
    update: validated,
    create: {
      tenantId,
      ...dataIsolationPolicySchema.parse({}),
      ...validated,
    },
  });
}

/**
 * Verify that a request originates from an IP in the whitelist
 */
export async function verifyIpWhitelist(
  tenantId: string,
  requestIp: string
): Promise<boolean> {
  const policy = await getTenantDataIsolationPolicy(tenantId);

  if (!policy?.ipWhitelistEnabled || !policy.ipWhitelist || policy.ipWhitelist.length === 0) {
    return true; // IP whitelist not enabled
  }

  // Check if request IP matches whitelist (supports CIDR)
  return isIpInWhitelist(requestIp, policy.ipWhitelist);
}

/**
 * Add an IP address to the whitelist
 */
export async function addIpToWhitelist(tenantId: string, ip: string) {
  const policy = await getTenantDataIsolationPolicy(tenantId);

  if (!policy) {
    throw AppError.validation("Geïsoleerd beleid niet gevonden");
  }

  const updated = await prisma.tenantDataIsolationPolicy.update({
    where: { tenantId },
    data: {
      ipWhitelist: [...(policy.ipWhitelist ?? []), ip],
    },
  });

  return updated.ipWhitelist;
}

/**
 * Remove an IP address from the whitelist
 */
export async function removeIpFromWhitelist(tenantId: string, ip: string) {
  const policy = await getTenantDataIsolationPolicy(tenantId);

  if (!policy) {
    throw AppError.validation("Geïsoleerd beleid niet gevonden");
  }

  const updated = await prisma.tenantDataIsolationPolicy.update({
    where: { tenantId },
    data: {
      ipWhitelist: (policy.ipWhitelist ?? []).filter((item) => item !== ip),
    },
  });

  return updated.ipWhitelist;
}

/**
 * Enforce data residency requirement by checking if data should be stored in specific region
 */
export async function getDataResidency(tenantId: string): Promise<string> {
  const policy = await getTenantDataIsolationPolicy(tenantId);
  return policy?.dataResidency ?? "EU";
}

/**
 * Check if MFA is required for a tenant
 */
export async function isMfaRequired(tenantId: string): Promise<boolean> {
  const policy = await getTenantDataIsolationPolicy(tenantId);
  return policy?.requireMfa ?? false;
}

/**
 * Enable audit logging for a tenant
 */
export async function enableAuditLogging(
  tenantId: string,
  retentionDays: number = 90
) {
  return await setDataIsolationPolicy(tenantId, {
    enableAuditLog: true,
    auditLogRetentionDays: retentionDays,
  });
}

/**
 * Check if data export is allowed for a tenant
 */
export async function isDataExportAllowed(tenantId: string): Promise<boolean> {
  const policy = await getTenantDataIsolationPolicy(tenantId);
  return policy?.allowExport ?? true;
}

/**
 * Check if data import is allowed for a tenant
 */
export async function isDataImportAllowed(tenantId: string): Promise<boolean> {
  const policy = await getTenantDataIsolationPolicy(tenantId);
  return policy?.allowImport ?? true;
}

/**
 * Get compliance frameworks that apply to a tenant
 */
export async function getTenantComplianceFrameworks(tenantId: string): Promise<string[]> {
  const policy = await getTenantDataIsolationPolicy(tenantId);
  return policy?.complianceFrameworks ?? ["GDPR"];
}

/**
 * Check if encryption is required for data at rest
 */
export async function isEncryptionAtRestRequired(tenantId: string): Promise<boolean> {
  const policy = await getTenantDataIsolationPolicy(tenantId);
  return policy?.encryptionAtRest ?? true;
}

/**
 * Check if encryption is required for data in transit
 */
export async function isEncryptionInTransitRequired(tenantId: string): Promise<boolean> {
  const policy = await getTenantDataIsolationPolicy(tenantId);
  return policy?.encryptionInTransit ?? true;
}

/**
 * Get key management strategy for a tenant
 */
export async function getKeyManagementStrategy(
  tenantId: string
): Promise<"platform" | "customer_provided"> {
  const policy = await getTenantDataIsolationPolicy(tenantId);
  return policy?.keyManagement ?? "platform";
}

/**
 * Add a compliance framework requirement for a tenant
 */
export async function addComplianceFramework(tenantId: string, framework: string) {
  const policy = await getTenantDataIsolationPolicy(tenantId);

  if (!policy) {
    throw AppError.validation("Geïsoleerd beleid niet gevonden");
  }

  const existing = policy.complianceFrameworks ?? [];
  if (existing.includes(framework)) {
    return existing; // Already added
  }

  const updated = await prisma.tenantDataIsolationPolicy.update({
    where: { tenantId },
    data: {
      complianceFrameworks: [...existing, framework],
    },
  });

  return updated.complianceFrameworks;
}

// ============================================================================
// Helpers
// ============================================================================

function isIpInWhitelist(ip: string, whitelist: string[]): boolean {
  // Simple IP matching (supports exact match and basic CIDR)
  // In production, use a library like ip-cidr for proper CIDR validation

  for (const item of whitelist) {
    if (item === ip) {
      return true;
    }

    // Simple CIDR check (e.g., 192.168.1.0/24)
    if (item.includes("/")) {
      const [network, mask] = item.split("/");
      if (matchesCidr(ip, network, parseInt(mask, 10))) {
        return true;
      }
    }
  }

  return false;
}

function matchesCidr(ip: string, network: string, maskBits: number): boolean {
  // Simplified CIDR matching for IPv4
  // In production, use a dedicated library
  const ipParts = ip.split(".").map(Number);
  const netParts = network.split(".").map(Number);

  if (ipParts.length !== 4 || netParts.length !== 4) {
    return false;
  }

  let maskBytes = Math.floor(maskBits / 8);
  let maskBits_ = maskBits % 8;

  // Check full bytes
  for (let i = 0; i < maskBytes; i++) {
    if ((ipParts[i] ?? 0) !== (netParts[i] ?? 0)) {
      return false;
    }
  }

  // Check partial byte
  if (maskBits_ > 0) {
    const mask = (0xff << (8 - maskBits_)) & 0xff;
    if (((ipParts[maskBytes] ?? 0) & mask) !== ((netParts[maskBytes] ?? 0) & mask)) {
      return false;
    }
  }

  return true;
}
