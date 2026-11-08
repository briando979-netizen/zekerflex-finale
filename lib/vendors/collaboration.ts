import { prisma } from "@/lib/prisma";

export async function createSupplierMessage(vendorId: string, message: string, attachments?: string[]) {
  return prisma.supplierMessage.create({
    data: {
      vendorId,
      message,
      attachments: attachments || [],
      createdAt: new Date(),
    },
  });
}

export async function getSupplierMessages(vendorId: string, limit = 50) {
  return prisma.supplierMessage.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function shareDocument(vendorId: string, documentName: string, documentUrl: string, expiresAt?: Date) {
  return prisma.sharedDocument.create({
    data: {
      vendorId,
      documentName,
      documentUrl,
      expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
      accessCount: 0,
      createdAt: new Date(),
    },
  });
}

export async function trackDocumentAccess(documentId: string) {
  return prisma.sharedDocument.update({
    where: { id: documentId },
    data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
  });
}

export async function setVendorKPI(vendorId: string, kpiName: string, target: number, actual: number) {
  return prisma.vendorKPI.upsert({
    where: { vendorId_kpiName: { vendorId, kpiName } },
    create: { vendorId, kpiName, target, actual, updatedAt: new Date() },
    update: { target, actual, updatedAt: new Date() },
  });
}

export async function getVendorKPIs(vendorId: string) {
  return prisma.vendorKPI.findMany({
    where: { vendorId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function calculateKPIPerformance(vendorId: string) {
  const kpis = await getVendorKPIs(vendorId);
  if (!kpis.length) return 0;

  const performance = kpis.reduce((sum, kpi) => {
    const score = kpi.target > 0 ? (kpi.actual / kpi.target) * 100 : 0;
    return sum + Math.min(100, score);
  }, 0);

  return performance / kpis.length;
}
