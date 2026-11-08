import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export async function recordLedgerEntry(data: Record<string, unknown>, previousHash?: string) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return prisma.ledgerEntry.create({
    data: { id: crypto.randomUUID(), data, hash, previousHash, timestamp: new Date(), immutable: true },
  });
}

export async function verifyLedgerIntegrity(entryId: string) {
  const entry = await prisma.ledgerEntry.findUnique({ where: { id: entryId } });
  if (!entry) return { valid: false };
  const hash = crypto.createHash('sha256').update(JSON.stringify(entry.data)).digest('hex');
  return { valid: entry.hash === hash };
}

export async function getAuditTrail(entityId: string) {
  return prisma.ledgerEntry.findMany({
    where: { data: { path: ['entityId'], equals: entityId } },
    orderBy: { timestamp: 'asc' },
  });
}
