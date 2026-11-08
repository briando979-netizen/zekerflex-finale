import { prisma } from "@/lib/prisma";
import { z } from "zod";

const masterRecordSchema = z.object({
  entityType: z.string(),
  externalId: z.string(),
  data: z.record(z.unknown()),
  sourceSystem: z.string(),
  confidence: z.number().min(0).max(100),
});

export async function createMasterRecord(data: z.infer<typeof masterRecordSchema>) {
  const validated = masterRecordSchema.parse(data);
  return prisma.masterDataRecord.create({
    data: {
      ...validated,
      status: "active",
      synced: false,
    },
  });
}

export async function findDuplicates(entityType: string, threshold: number = 85) {
  const records = await prisma.masterDataRecord.findMany({
    where: { entityType },
  });

  const duplicates: any = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const similarity = calculateSimilarity(records[i].data, records[j].data);
      if (similarity >= threshold) {
        duplicates.push({
          record1: records[i].id,
          record2: records[j].id,
          similarity,
        });
      }
    }
  }

  return duplicates;
}

function calculateSimilarity(obj1: any, obj2: any): number {
  const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  let matches = 0;

  for (const key of keys) {
    if (obj1[key] === obj2[key]) matches++;
  }

  return (matches / keys.size) * 100;
}

export async function mergeMasterRecords(recordId1: string, recordId2: string, winnerId: string) {
  const winner = await prisma.masterDataRecord.findUnique({ where: { id: winnerId } });
  if (!winner) throw new Error("Winner record not found");

  const loser = await prisma.masterDataRecord.findUnique({ where: { id: recordId1 === winnerId ? recordId2 : recordId1 } });
  if (!loser) throw new Error("Loser record not found");

  // Merge data (winner takes precedence, loser fills gaps)
  const mergedData = { ...loser.data, ...winner.data };

  await prisma.masterDataRecord.update({
    where: { id: winnerId },
    data: { data: mergedData, confidence: Math.min(100, (winner.confidence + loser.confidence) / 2 + 5) },
  });

  await prisma.masterDataRecord.delete({ where: { id: recordId1 === winnerId ? recordId2 : recordId1 } });

  return { mergedId: winnerId, data: mergedData };
}

export async function synchronizeToTargetSystems(recordId: string, targetSystems: string[]) {
  const record = await prisma.masterDataRecord.findUnique({ where: { id: recordId } });
  if (!record) throw new Error("Record not found");

  return {
    recordId,
    targetSystems,
    status: "syncing",
    syncedAt: new Date(),
    recordsAffected: targetSystems.length,
  };
}

export async function getMasterRecord(id: string) {
  return prisma.masterDataRecord.findUnique({
    where: { id },
    include: { history: { take: 10 } },
  });
}
