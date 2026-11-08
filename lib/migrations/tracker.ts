import { prisma } from "@/lib/prisma";

export interface MigrationRecord {
  id: string;
  name: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  appliedAt?: Date;
  duration?: number;
  error?: string;
}

export async function trackMigration(name: string) {
  return await prisma.migration.create({
    data: {
      name,
      status: "PENDING",
    },
  });
}

export async function startMigration(migrationId: string) {
  return await prisma.migration.update({
    where: { id: migrationId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
}

export async function completeMigration(migrationId: string, duration: number) {
  return await prisma.migration.update({
    where: { id: migrationId },
    data: {
      status: "COMPLETED",
      appliedAt: new Date(),
      duration,
    },
  });
}

export async function failMigration(migrationId: string, error: string) {
  return await prisma.migration.update({
    where: { id: migrationId },
    data: {
      status: "FAILED",
      error,
    },
  });
}

export async function getMigrationHistory(limit = 50) {
  const migrations = await prisma.migration.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return migrations;
}

export async function getPendingMigrations() {
  return await prisma.migration.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
}
