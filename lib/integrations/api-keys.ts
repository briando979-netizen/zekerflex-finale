import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AVAILABLE_SCOPES, type ApiScope } from "@/lib/integrations/scopes";

// ---------------------------------------------------------------------------
// API keys for external systems (an integration partner, or a connected
// employer's own tooling) that call the public ZekerFlex API. The raw secret
// is shown exactly once, at creation — only its SHA-256 hash is stored, so a
// database leak never yields a usable key.
//
// Format: zf_live_<32 random base64url chars>. The first 16 characters
// ("zf_live_" + 8) are stored as `prefix` (unique, indexed) so a lookup by
// prefix finds the row before the full hash is compared.
// ---------------------------------------------------------------------------

// Re-exported from lib/integrations/scopes.ts (zero-dependency — safe for
// client components) so existing server-side imports from this file keep working.
export { AVAILABLE_SCOPES, type ApiScope };

export function generateApiKey(): { raw: string; prefix: string; hashedKey: string } {
  const secret = randomBytes(24).toString("base64url");
  const raw = `zf_live_${secret}`;
  const prefix = raw.slice(0, 16);
  const hashedKey = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hashedKey };
}

export async function createApiKey(opts: {
  name: string;
  tenantId?: string | null;
  scopes: string[];
  createdById: string;
}): Promise<{ id: string; prefix: string; raw: string }> {
  const { raw, prefix, hashedKey } = generateApiKey();
  const row = await prisma.apiKey.create({
    data: {
      name: opts.name,
      prefix,
      hashedKey,
      scopes: opts.scopes,
      tenantId: opts.tenantId ?? null,
      createdById: opts.createdById,
    },
    select: { id: true, prefix: true },
  });
  return { ...row, raw };
}

export async function listApiKeys() {
  return prisma.apiKey.findMany({
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      tenant: { select: { id: true, name: true } },
      createdBy: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
}

/**
 * Rotate: issue a new key with the same name, scopes and organisation, and
 * let the old one keep working for `graceHours` (revokedAt in the future) so
 * integrations can switch over without downtime. The new secret is returned once.
 */
export async function rotateApiKey(id: string, createdById: string, graceHours = 24): Promise<{ id: string; prefix: string; raw: string; oldValidUntil: Date }> {
  const old = await prisma.apiKey.findUnique({ where: { id } });
  if (!old || (old.revokedAt && old.revokedAt <= new Date())) throw new Error("Deze sleutel is al ingetrokken");
  const fresh = await createApiKey({ name: old.name, tenantId: old.tenantId, scopes: old.scopes, createdById });
  const oldValidUntil = new Date(Date.now() + Math.max(0, Math.min(168, graceHours)) * 3_600_000);
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: oldValidUntil } });
  return { ...fresh, oldValidUntil };
}

export interface VerifiedApiKey {
  id: string;
  tenantId: string | null;
  scopes: string[];
}

/** Verify a raw `Authorization: Bearer zf_live_...` key. Touches lastUsedAt. */
export async function verifyApiKey(rawKey: string): Promise<VerifiedApiKey | null> {
  if (!rawKey?.startsWith("zf_live_") || rawKey.length < 16) return null;
  const prefix = rawKey.slice(0, 16);
  const hashedKey = createHash("sha256").update(rawKey).digest("hex");

  const row = await prisma.apiKey.findUnique({ where: { prefix } });
  // revokedAt in the future = rotated, still inside its grace period.
  if (!row || (row.revokedAt && row.revokedAt <= new Date())) return null;
  const storedHash = Buffer.from(row.hashedKey, "hex");
  const incomingHash = Buffer.from(hashedKey, "hex");
  if (storedHash.length !== incomingHash.length || !timingSafeEqual(storedHash, incomingHash)) return null;

  void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { id: row.id, tenantId: row.tenantId, scopes: row.scopes };
}

export function hasScope(key: VerifiedApiKey, scope: ApiScope): boolean {
  return key.scopes.includes(scope);
}
