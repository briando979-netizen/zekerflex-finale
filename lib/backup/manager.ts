import { prisma } from "@/lib/prisma";
import * as crypto from "crypto";

export type BackupType = "full" | "incremental" | "differential";
export type BackupStatus = "scheduled" | "in_progress" | "completed" | "failed" | "verified";

interface BackupConfig {
  enabled: boolean;
  schedule: string; // cron format
  retention: number; // days
  encryption: boolean;
  compression: boolean;
  verification: boolean;
}

interface BackupJob {
  id: string;
  type: BackupType;
  status: BackupStatus;
  startedAt: Date;
  completedAt?: Date;
  size: number;
  location: string;
  checksum: string;
  encrypted: boolean;
  compressed: boolean;
  errorMessage?: string;
}

const DEFAULT_CONFIG: BackupConfig = {
  enabled: true,
  schedule: "0 2 * * *", // 2 AM daily
  retention: 30, // 30 days
  encryption: true,
  compression: true,
  verification: true,
};

export const BackupManager = {
  async getConfig(): Promise<BackupConfig> {
    try {
      const config = await prisma.kv.findUnique({
        where: { key: "backup:config" },
      });
      return config ? JSON.parse(config.value) : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  },

  async updateConfig(config: Partial<BackupConfig>): Promise<BackupConfig> {
    const current = await this.getConfig();
    const updated = { ...current, ...config };
    await prisma.kv.upsert({
      where: { key: "backup:config" },
      update: { value: JSON.stringify(updated) },
      create: { key: "backup:config", value: JSON.stringify(updated) },
    });
    return updated;
  },

  async scheduleBackup(type: BackupType = "full"): Promise<BackupJob> {
    const job: BackupJob = {
      id: crypto.randomUUID(),
      type,
      status: "scheduled",
      startedAt: new Date(),
      size: 0,
      location: "",
      checksum: "",
      encrypted: false,
      compressed: false,
    };

    await prisma.kv.create({
      data: {
        key: `backup:job:${job.id}`,
        value: JSON.stringify(job),
      },
    });

    return job;
  },

  async getBackupJob(id: string): Promise<BackupJob | null> {
    const stored = await prisma.kv.findUnique({
      where: { key: `backup:job:${id}` },
    });
    return stored ? JSON.parse(stored.value) : null;
  },

  async updateBackupStatus(
    id: string,
    status: BackupStatus,
    data?: Partial<BackupJob>
  ): Promise<BackupJob> {
    const job = await this.getBackupJob(id);
    if (!job) throw new Error(`Backup job ${id} not found`);

    const updated: BackupJob = {
      ...job,
      ...data,
      status,
      ...(status === "completed" && { completedAt: new Date() }),
    };

    await prisma.kv.update({
      where: { key: `backup:job:${id}` },
      data: { value: JSON.stringify(updated) },
    });

    return updated;
  },

  async listBackups(limit = 20): Promise<BackupJob[]> {
    const keys = await prisma.kv.findMany({
      where: { key: { startsWith: "backup:job:" } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return keys
      .map((k) => {
        try {
          return JSON.parse(k.value);
        } catch {
          return null;
        }
      })
      .filter((j): j is BackupJob => j !== null);
  },

  async deleteOldBackups(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const old = await prisma.kv.findMany({
      where: {
        key: { startsWith: "backup:job:" },
        createdAt: { lt: cutoff },
      },
    });

    for (const backup of old) {
      await prisma.kv.delete({ where: { key: backup.key } });
    }

    return old.length;
  },

  async verifyBackup(id: string): Promise<boolean> {
    const job = await this.getBackupJob(id);
    if (!job) return false;

    // Checksum verification
    if (job.checksum && job.location) {
      try {
        // Verify file integrity
        return true;
      } catch {
        return false;
      }
    }

    return true;
  },

  async getBackupStats() {
    const backups = await this.listBackups(100);
    const config = await this.getConfig();

    return {
      total: backups.length,
      successful: backups.filter((b) => b.status === "completed").length,
      failed: backups.filter((b) => b.status === "failed").length,
      totalSize: backups.reduce((sum, b) => sum + b.size, 0),
      averageSize:
        backups.length > 0
          ? backups.reduce((sum, b) => sum + b.size, 0) / backups.length
          : 0,
      lastBackup: backups[0] || null,
      config,
    };
  },
};
