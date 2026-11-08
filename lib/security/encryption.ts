/**
 * Encryption & Secrets Management
 *
 * Handles encryption key lifecycle, data encryption/decryption, and secret rotation.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Generate a new encryption key
 */
export function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Create a new encryption key for a tenant
 */
export async function createEncryptionKey(
  tenantId: string,
  name: string,
  encryptedKey: string
) {
  return prisma.encryptionKey.create({
    data: {
      tenantId,
      name,
      algorithm: ALGORITHM,
      keyVersion: 1,
      encryptedKey,
      isActive: true,
      createdAt: new Date()
    }
  });
}

/**
 * Get active encryption key for a tenant
 */
export async function getActiveEncryptionKey(tenantId: string) {
  return prisma.encryptionKey.findFirst({
    where: {
      tenantId,
      isActive: true,
      revokedAt: null,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    },
    orderBy: { keyVersion: "desc" }
  });
}

/**
 * Get all active keys for a tenant
 */
export async function getEncryptionKeys(tenantId: string) {
  return prisma.encryptionKey.findMany({
    where: {
      tenantId,
      isActive: true,
      revokedAt: null
    },
    orderBy: { keyVersion: "desc" }
  });
}

/**
 * Encrypt data with a key
 */
export function encryptData(
  plaintext: string | Buffer,
  key: Buffer
): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex")
  };
}

/**
 * Decrypt data with a key
 */
export function decryptData(
  ciphertext: string,
  key: Buffer,
  iv: string,
  authTag: string
): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  let decrypted = decipher.update(Buffer.from(ciphertext, "hex"));
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf-8");
}

/**
 * Encrypt a value and store it with metadata
 */
export async function encryptAndStore(
  tenantId: string,
  plaintext: string,
  keyId: string
) {
  const key = await prisma.encryptionKey.findUnique({
    where: { id: keyId }
  });

  if (!key) {
    throw new AppError("KeyNotFound", "Encryption key not found", 404);
  }

  // In production, the encryptedKey would be decrypted from secure storage (KMS, HSM, etc.)
  // For now, we assume it's available
  const keyBuffer = Buffer.from(key.encryptedKey, "hex").slice(0, KEY_LENGTH);

  const encrypted = encryptData(plaintext, keyBuffer);

  // Record usage
  await prisma.encryptionKey.update({
    where: { id: keyId },
    data: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date()
    }
  });

  return encrypted;
}

/**
 * Decrypt data that was stored
 */
export async function decryptStored(
  tenantId: string,
  ciphertext: string,
  iv: string,
  authTag: string,
  keyVersion?: number
) {
  let key = await prisma.encryptionKey.findFirst({
    where: {
      tenantId,
      keyVersion: keyVersion || undefined,
      isActive: true
    }
  });

  if (!key) {
    key = await getActiveEncryptionKey(tenantId);
  }

  if (!key) {
    throw new AppError("NoEncryptionKey", "No active encryption key found", 500);
  }

  const keyBuffer = Buffer.from(key.encryptedKey, "hex").slice(0, KEY_LENGTH);

  return decryptData(ciphertext, keyBuffer, iv, authTag);
}

/**
 * Rotate encryption keys
 */
export async function rotateEncryptionKeys(
  tenantId: string,
  newEncryptedKey: string
) {
  // Get current active key
  const currentKey = await getActiveEncryptionKey(tenantId);

  if (!currentKey) {
    throw new AppError("NoCurrentKey", "No current key to rotate from", 500);
  }

  // Mark current key as rotated
  await prisma.encryptionKey.update({
    where: { id: currentKey.id },
    data: {
      isActive: false,
      rotatedAt: new Date()
    }
  });

  // Create new key
  const newKey = await prisma.encryptionKey.create({
    data: {
      tenantId,
      name: `${currentKey.name} (rotated)`,
      algorithm: ALGORITHM,
      keyVersion: currentKey.keyVersion + 1,
      encryptedKey: newEncryptedKey,
      isActive: true
    }
  });

  return newKey;
}

/**
 * Re-encrypt data with a new key
 */
export async function reEncryptData(
  tenantId: string,
  ciphertext: string,
  oldIv: string,
  oldAuthTag: string,
  oldKeyVersion: number,
  newKeyId: string
) {
  // Decrypt with old key
  const plaintext = await decryptStored(tenantId, ciphertext, oldIv, oldAuthTag, oldKeyVersion);

  // Encrypt with new key
  return encryptAndStore(tenantId, plaintext, newKeyId);
}

/**
 * Revoke an encryption key
 */
export async function revokeEncryptionKey(keyId: string, reason?: string) {
  return prisma.encryptionKey.update({
    where: { id: keyId },
    data: {
      revokedAt: new Date(),
      isActive: false
    }
  });
}

/**
 * Get key rotation schedule
 */
export async function getKeyRotationSchedule(tenantId: string) {
  const keys = await getEncryptionKeys(tenantId);

  return keys.map(key => ({
    id: key.id,
    name: key.name,
    version: key.keyVersion,
    createdAt: key.createdAt,
    rotatedAt: key.rotatedAt,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    usageCount: key.usageCount,
    age: Date.now() - key.createdAt.getTime(),
    needsRotation: !key.expiresAt || key.expiresAt <= new Date() ||
                   (Date.now() - key.createdAt.getTime()) > (90 * 24 * 60 * 60 * 1000) // 90 days
  }));
}

/**
 * Hash sensitive data (one-way)
 */
export function hashSensitiveData(
  data: string,
  algorithm: "sha256" | "sha512" = "sha256"
): string {
  return crypto.createHash(algorithm).update(data).digest("hex");
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Create a password hash with salt
 */
export async function hashPassword(password: string, saltRounds: number = 10): Promise<string> {
  // In production, use bcrypt or similar
  // For now, use a simple approach with salt
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a password hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, storedHash] = hash.split(":");
  const computedHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return computedHash === storedHash;
}

/**
 * Get encryption key statistics
 */
export async function getKeyStatistics(tenantId: string) {
  const keys = await getEncryptionKeys(tenantId);

  return {
    totalKeys: keys.length,
    activeKeys: keys.filter(k => k.isActive).length,
    totalUsage: keys.reduce((sum, k) => sum + k.usageCount, 0),
    lastRotation: Math.max(...keys.map(k => k.rotatedAt?.getTime() || 0)),
    oldestKey: Math.min(...keys.map(k => k.createdAt.getTime())),
    keysNeedingRotation: keys.filter(k => {
      const age = Date.now() - k.createdAt.getTime();
      return age > (90 * 24 * 60 * 60 * 1000); // 90 days
    }).length
  };
}
