import { prisma } from "@/lib/prisma";

export type DataClassification = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "PERSONAL" | "SENSITIVE";
export type RetentionPolicy = "30_DAYS" | "90_DAYS" | "1_YEAR" | "3_YEARS" | "7_YEARS" | "PERMANENT";

export interface DataGovernancePolicy {
  id: string;
  name: string;
  classification: DataClassification;
  retentionDays: number;
  residency: string;
  handlePolicies: string[];
  requiresEncryption: boolean;
  requiresAudit: boolean;
  deletionSchedule?: string;
}

export class DataGovernanceManager {
  static RETENTION_MAP: Record<RetentionPolicy, number> = {
    "30_DAYS": 30,
    "90_DAYS": 90,
    "1_YEAR": 365,
    "3_YEARS": 1095,
    "7_YEARS": 2555,
    PERMANENT: -1,
  };

  static CLASSIFICATION_POLICIES: Record<DataClassification, DataGovernancePolicy> = {
    PUBLIC: {
      id: "public",
      name: "Public Data",
      classification: "PUBLIC",
      retentionDays: -1,
      residency: "ANY",
      handlePolicies: ["no_encryption_required"],
      requiresEncryption: false,
      requiresAudit: false,
    },
    INTERNAL: {
      id: "internal",
      name: "Internal Data",
      classification: "INTERNAL",
      retentionDays: 365,
      residency: "EU",
      handlePolicies: ["encryption_recommended", "access_restricted"],
      requiresEncryption: false,
      requiresAudit: true,
    },
    CONFIDENTIAL: {
      id: "confidential",
      name: "Confidential Data",
      classification: "CONFIDENTIAL",
      retentionDays: 730,
      residency: "EU",
      handlePolicies: ["encryption_required", "access_restricted", "audit_required"],
      requiresEncryption: true,
      requiresAudit: true,
    },
    RESTRICTED: {
      id: "restricted",
      name: "Restricted Data",
      classification: "RESTRICTED",
      retentionDays: 1095,
      residency: "SAME_AS_STORAGE",
      handlePolicies: ["encryption_required", "access_highly_restricted", "audit_required", "approval_required"],
      requiresEncryption: true,
      requiresAudit: true,
    },
    PERSONAL: {
      id: "personal",
      name: "Personal Data (GDPR)",
      classification: "PERSONAL",
      retentionDays: 365,
      residency: "EU",
      handlePolicies: ["encryption_required", "consent_required", "right_to_deletion", "audit_required"],
      requiresEncryption: true,
      requiresAudit: true,
    },
    SENSITIVE: {
      id: "sensitive",
      name: "Sensitive Data (HIPAA/PII)",
      classification: "SENSITIVE",
      retentionDays: 2555,
      residency: "US",
      handlePolicies: ["encryption_required", "access_minimized", "audit_required", "masking_required"],
      requiresEncryption: true,
      requiresAudit: true,
    },
  };

  static getClassificationPolicy(classification: DataClassification): DataGovernancePolicy {
    return this.CLASSIFICATION_POLICIES[classification];
  }

  static async classifyData(
    dataType: string,
    classification: DataClassification
  ): Promise<{ dataType: string; classification: DataClassification; policy: DataGovernancePolicy }> {
    const policy = this.getClassificationPolicy(classification);
    return { dataType, classification, policy };
  }

  static async setRetentionPolicy(dataType: string, retention: RetentionPolicy): Promise<void> {
    const retentionDays = this.RETENTION_MAP[retention];
    // Store in DB (implementation depends on schema)
    await prisma.dataGovernance.upsert({
      where: { dataType },
      update: { retentionDays, updatedAt: new Date() },
      create: { dataType, retentionDays, classification: "INTERNAL" as any },
    });
  }

  static async scheduleDataDeletion(dataType: string, recordId: string, deletionDate?: Date): Promise<void> {
    const deletion = new Date(deletionDate || Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.dataDeletion.create({
      data: {
        dataType,
        recordId,
        scheduledDate: deletion,
        status: "PENDING",
      },
    });
  }

  static async processScheduledDeletions(): Promise<number> {
    const now = new Date();
    const deletions = await prisma.dataDeletion.findMany({
      where: {
        scheduledDate: { lte: now },
        status: "PENDING",
      },
    });

    let deletedCount = 0;
    for (const deletion of deletions) {
      try {
        // Delete based on data type (implementation)
        await prisma.dataDeletion.update({
          where: { id: deletion.id },
          data: { status: "COMPLETED", completedAt: now },
        });
        deletedCount++;
      } catch (error) {
        await prisma.dataDeletion.update({
          where: { id: deletion.id },
          data: { status: "FAILED", error: String(error) },
        });
      }
    }

    return deletedCount;
  }

  static async archiveData(dataType: string, olderThan: Date): Promise<number> {
    // Archive data older than specified date
    // Implementation depends on specific data model
    return 0;
  }

  static async getDataInventory(): Promise<any[]> {
    return prisma.dataGovernance.findMany({
      include: {
        _count: {
          select: { records: true },
        },
      },
    });
  }

  static async validateDataResidency(dataType: string, residency: string): Promise<boolean> {
    const policy = await prisma.dataGovernance.findUnique({
      where: { dataType },
    });

    if (!policy) return true;

    if (policy.residency === "ANY") return true;
    if (policy.residency === "EU") return ["EU", "DE", "FR", "NL"].includes(residency);
    if (policy.residency === "US") return ["US"].includes(residency);

    return policy.residency === residency;
  }

  static async generateGovernanceReport(): Promise<string> {
    const inventory = await this.getDataInventory();

    const report = `
# Data Governance Report
Generated: ${new Date().toISOString()}

## Data Inventory
${inventory
  .map(
    (item: any) =>
      `- ${item.dataType}: Classification=${item.classification}, Retention=${item.retentionDays} days`
  )
  .join("\n")}

## Compliance Status
- GDPR: ${inventory.filter((i: any) => i.residency === "EU").length} EU datasets
- HIPAA: ${inventory.filter((i: any) => i.classification === "SENSITIVE").length} sensitive datasets
- PCI DSS: ${inventory.filter((i: any) => i.requiresEncryption).length} encrypted datasets

## Retention Policies
${inventory.map((i: any) => `- ${i.dataType}: Delete after ${i.retentionDays} days`).join("\n")}
    `;

    return report;
  }
}
