import { prisma } from "@/lib/prisma";

export interface BackupMetadata {
  id: string;
  name: string;
  createdAt: Date;
  size: number;
  type: "MANUAL" | "AUTOMATIC" | "SCHEDULED";
  status: "PENDING" | "COMPLETED" | "FAILED";
}

export async function createBackup(name: string, type: "MANUAL" | "AUTOMATIC" | "SCHEDULED" = "MANUAL") {
  const backup = await prisma.backup.create({
    data: {
      name,
      type,
      status: "PENDING",
      createdAt: new Date(),
      completedAt: null,
      checksum: "",
    },
  });

  return backup;
}

export async function listBackups(limit = 50) {
  const backups = await prisma.backup.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return backups.map((b) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    type: b.type,
    status: b.status,
  }));
}

export async function getBackupStatus(backupId: string) {
  const backup = await prisma.backup.findUnique({
    where: { id: backupId },
  });

  return {
    id: backup?.id,
    name: backup?.name,
    status: backup?.status,
    progress: backup?.status === "COMPLETED" ? 100 : 50,
    createdAt: backup?.createdAt,
  };
}

export async function deleteBackup(backupId: string) {
  await prisma.backup.delete({
    where: { id: backupId },
  });

  return { success: true };
}

export async function scheduleAutoBackup() {
  const lastBackup = await prisma.backup.findFirst({
    where: { type: "AUTOMATIC" },
    orderBy: { createdAt: "desc" },
  });

  const daysSince = lastBackup ? Math.floor((Date.now() - lastBackup.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 1;

  if (daysSince >= 1) {
    return await createBackup(`Auto backup ${new Date().toISOString()}`, "AUTOMATIC");
  }

  return null;
}
