import { prisma } from "@/lib/prisma";
import { z } from "zod";

const physicalCountSchema = z.object({
  tenantId: z.string(),
  productId: z.string(),
  countedQuantity: z.number().int().min(0),
  countedBy: z.string(),
  notes: z.string().optional(),
  location: z.string().optional(),
});

export type PhysicalCount = z.infer<typeof physicalCountSchema>;

/**
 * Record a physical inventory count
 */
export async function recordPhysicalCount(data: PhysicalCount) {
  const validated = physicalCountSchema.parse(data);

  // Get current stock
  const stock = await prisma.inventoryStock.findUnique({
    where: { productId: validated.productId },
    include: { product: true },
  });

  if (!stock) {
    throw new Error(`Stock not found for product ${validated.productId}`);
  }

  const variance = validated.countedQuantity - stock.currentLevel;
  const variancePercent =
    stock.currentLevel > 0
      ? Math.abs(variance / stock.currentLevel) * 100
      : 0;

  const audit = await prisma.inventoryAudit.create({
    data: {
      tenantId: validated.tenantId,
      productId: validated.productId,
      systemQuantity: stock.currentLevel,
      physicalQuantity: validated.countedQuantity,
      variance,
      variancePercent,
      countedBy: validated.countedBy,
      location: validated.location,
      notes: validated.notes,
      status: variance === 0 ? "MATCHED" : "DISCREPANCY",
    },
  });

  // If there's a variance, create an adjustment movement
  if (variance !== 0) {
    await prisma.inventoryMovement.create({
      data: {
        productId: validated.productId,
        tenantId: validated.tenantId,
        type: "ADJUSTMENT",
        quantity: variance,
        reference: `AUDIT:${audit.id}`,
        notes: `Physical count adjustment: ${variance > 0 ? "+" : ""}${variance}`,
        createdBy: validated.countedBy,
      },
    });

    // Update stock to match physical count
    await prisma.inventoryStock.update({
      where: { productId: validated.productId },
      data: {
        currentLevel: validated.countedQuantity,
        lastStockCheck: new Date(),
      },
    });
  }

  return audit;
}

/**
 * Get audit record by ID
 */
export async function getAudit(auditId: string) {
  const audit = await prisma.inventoryAudit.findUnique({
    where: { id: auditId },
    include: {
      product: {
        select: { sku: true, name: true, priceCents: true },
      },
    },
  });

  if (!audit) {
    throw new Error(`Audit ${auditId} not found`);
  }

  return audit;
}

/**
 * Get all discrepancies for a tenant
 */
export async function getTenantDiscrepancies(
  tenantId: string,
  options?: {
    severity?: "HIGH" | "MEDIUM" | "LOW";
    limit?: number;
    offset?: number;
  }
) {
  const { limit = 50, offset = 0 } = options || {};

  const audits = await prisma.inventoryAudit.findMany({
    where: {
      tenantId,
      status: "DISCREPANCY",
    },
    include: {
      product: {
        select: { sku: true, name: true, priceCents: true },
      },
    },
    orderBy: { variancePercent: "desc" },
    take: limit,
    skip: offset,
  });

  const total = await prisma.inventoryAudit.count({
    where: {
      tenantId,
      status: "DISCREPANCY",
    },
  });

  return {
    discrepancies: audits.map((a) => ({
      ...a,
      severityLevel: getSeverityLevel(a.variancePercent),
      valueImpact: Math.abs(
        (a.product.priceCents * a.variance) / 100
      ),
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Determine severity level based on variance percentage
 */
function getSeverityLevel(variancePercent: number): "HIGH" | "MEDIUM" | "LOW" {
  if (variancePercent >= 10) return "HIGH";
  if (variancePercent >= 5) return "MEDIUM";
  return "LOW";
}

/**
 * Get audit history for a product
 */
export async function getProductAuditHistory(
  productId: string,
  tenantId: string,
  limit = 50
) {
  const audits = await prisma.inventoryAudit.findMany({
    where: {
      productId,
      tenantId,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      product: {
        select: { sku: true, name: true },
      },
    },
  });

  return audits;
}

/**
 * Generate inventory accuracy report
 */
export async function generateAccuracyReport(tenantId: string) {
  const audits = await prisma.inventoryAudit.findMany({
    where: { tenantId },
    include: {
      product: {
        select: { priceCents: true },
      },
    },
  });

  const totalAudits = audits.length;
  const matched = audits.filter((a) => a.status === "MATCHED").length;
  const discrepancies = audits.filter((a) => a.status === "DISCREPANCY").length;
  const accuracy =
    totalAudits > 0
      ? ((matched / totalAudits) * 100).toFixed(2)
      : "N/A";

  const totalValueVariance = audits.reduce((sum, a) => {
    return sum + Math.abs((a.product.priceCents * a.variance) / 100);
  }, 0);

  const avgVariancePercent =
    totalAudits > 0
      ? (audits.reduce((sum, a) => sum + a.variancePercent, 0) / totalAudits).toFixed(2)
      : "0";

  const highSeverity = audits.filter(
    (a) => getSeverityLevel(a.variancePercent) === "HIGH"
  ).length;

  return {
    generatedAt: new Date(),
    totalAudits,
    matched,
    discrepancies,
    accuracyPercent: accuracy,
    totalValueVariance,
    avgVariancePercent,
    highSeverityCount: highSeverity,
    auditDetails: audits,
  };
}

/**
 * Create a scheduled audit cycle
 */
export async function createAuditCycle(
  tenantId: string,
  name: string,
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY",
  nextAuditDate: Date
) {
  const cycle = await prisma.auditCycle.create({
    data: {
      tenantId,
      name,
      frequency,
      nextAuditDate,
      status: "ACTIVE",
    },
  });

  return cycle;
}

/**
 * Get products due for audit in a cycle
 */
export async function getProductsDueForAudit(
  tenantId: string,
  daysWithoutAudit: number = 90
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysWithoutAudit);

  const products = await prisma.inventoryProduct.findMany({
    where: { tenantId },
    include: {
      stock: {
        where: {
          lastStockCheck: {
            lt: cutoffDate,
          },
        },
      },
      audits: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return products
    .filter((p) => p.stock && (p.stock.lastStockCheck === null || p.stock.lastStockCheck < cutoffDate))
    .map((p) => ({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      currentStock: p.stock?.currentLevel || 0,
      lastAudit: p.audits[0]?.createdAt,
      dayssinceAudit: p.audits[0]
        ? Math.floor(
            (new Date().getTime() - p.audits[0].createdAt.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : null,
    }));
}

/**
 * Generate variance analysis report
 */
export async function generateVarianceAnalysis(tenantId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const audits = await prisma.inventoryAudit.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate },
    },
    include: {
      product: {
        select: { sku: true, name: true, category: true, priceCents: true },
      },
    },
  });

  const byCategory = new Map<
    string,
    { count: number; totalVariance: number; totalValue: number }
  >();

  for (const audit of audits) {
    const cat = audit.product.category;
    const current = byCategory.get(cat) || { count: 0, totalVariance: 0, totalValue: 0 };

    current.count += 1;
    current.totalVariance += Math.abs(audit.variance);
    current.totalValue += Math.abs((audit.product.priceCents * audit.variance) / 100);

    byCategory.set(cat, current);
  }

  return {
    period: { start: startDate, end: new Date(), days },
    totalAudits: audits.length,
    byCategory: Object.fromEntries(byCategory),
    audits,
  };
}
