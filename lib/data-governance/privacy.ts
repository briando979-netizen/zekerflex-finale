import { prisma } from "@/lib/prisma";
import { z } from "zod";
import crypto from "crypto";

const privacyClassificationSchema = z.object({
  assetId: z.string(),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted", "pii", "phi", "pci"]),
  piiFields: z.array(z.string()),
  encryptionRequired: z.boolean(),
  accessControl: z.record(z.array(z.string())),
});

export async function classifyData(data: z.infer<typeof privacyClassificationSchema>) {
  const validated = privacyClassificationSchema.parse(data);
  return prisma.dataPrivacy.create({
    data: {
      ...validated,
      lastAuditedAt: new Date(),
    },
  });
}

export function encryptSensitiveData(data: string, key: string): string {
  const cipher = crypto.createCipher("aes-256-cbc", key);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

export function decryptSensitiveData(encrypted: string, key: string): string {
  const decipher = crypto.createDecipher("aes-256-cbc", key);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function maskPIIData(assetId: string, fields: string[]) {
  return {
    assetId,
    maskedFields: fields,
    maskType: "partial",
    maskingRules: {
      email: "***@***.***",
      phone: "***-***-****",
      ssn: "***-**-****",
    },
    completedAt: new Date(),
  };
}

export async function audilPrivacyAccess(userId: string, assetId: string, action: string) {
  return prisma.privacyAuditLog.create({
    data: {
      userId,
      assetId,
      action,
      timestamp: new Date(),
      ipAddress: "127.0.0.1",
      accessGranted: true,
    },
  });
}

export async function getAccessControl(assetId: string) {
  return prisma.dataPrivacy.findUnique({
    where: { assetId },
  });
}

export async function grantAccessToData(assetId: string, userId: string, role: string) {
  const privacy = await prisma.dataPrivacy.findUnique({ where: { assetId } });
  if (!privacy) throw new Error("Privacy policy not found");

  const currentAccess = privacy.accessControl as Record<string, string[]>;
  currentAccess[role] = [...(currentAccess[role] || []), userId];

  return prisma.dataPrivacy.update({
    where: { assetId },
    data: { accessControl: currentAccess },
  });
}

export async function revokeAccessToData(assetId: string, userId: string) {
  const privacy = await prisma.dataPrivacy.findUnique({ where: { assetId } });
  if (!privacy) throw new Error("Privacy policy not found");

  const currentAccess = privacy.accessControl as Record<string, string[]>;
  for (const role in currentAccess) {
    currentAccess[role] = currentAccess[role].filter((u) => u !== userId);
  }

  return prisma.dataPrivacy.update({
    where: { assetId },
    data: { accessControl: currentAccess },
  });
}
