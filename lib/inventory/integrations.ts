import { prisma } from "@/lib/prisma";
import { z } from "zod";

const poIntegrationSchema = z.object({
  tenantId: z.string(),
  supplierId: z.string(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().min(1),
    })
  ),
  notes: z.string().optional(),
});

export type POIntegration = z.infer<typeof poIntegrationSchema>;

/**
 * Auto-generate purchase order from low-stock products
 */
export async function generatePOFromLowStock(tenantId: string, supplierId: string) {
  const supplier = await prisma.inventorySupplier.findUnique({
    where: { id: supplierId },
  });

  if (!supplier) {
    throw new Error(`Supplier ${supplierId} not found`);
  }

  const lowStockProducts = await prisma.inventoryProduct.findMany({
    where: { tenantId },
    include: { stock: true },
  });

  const items = lowStockProducts
    .filter((p) => p.stock && p.stock.currentLevel <= p.stock.reorderPoint)
    .map((p) => ({
      productId: p.id,
      quantity: p.stock!.reorderQty || 0,
    }))
    .filter((item) => item.quantity > 0);

  if (items.length === 0) {
    return null;
  }

  return createPurchaseOrder({
    tenantId,
    supplierId,
    items,
    notes: "Auto-generated from low stock",
  });
}

/**
 * Create purchase order
 */
export async function createPurchaseOrder(data: POIntegration) {
  const validated = poIntegrationSchema.parse(data);

  const orders = [];

  for (const item of validated.items) {
    const product = await prisma.inventoryProduct.findUnique({
      where: { id: item.productId },
    });

    if (!product) {
      throw new Error(`Product ${item.productId} not found`);
    }

    const unitCost = product.cost || product.priceCents;
    const totalCost = unitCost * item.quantity;

    const po = await prisma.inventoryPurchaseOrder.create({
      data: {
        productId: item.productId,
        supplierId: validated.supplierId,
        tenantId: validated.tenantId,
        poNumber: `PO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        quantity: item.quantity,
        unitCostCents: unitCost,
        totalCostCents: totalCost,
        status: "DRAFT",
        notes: validated.notes,
      },
    });

    orders.push(po);
  }

  return orders;
}

/**
 * Update PO status
 */
export async function updatePOStatus(
  poId: string,
  status: "DRAFT" | "SUBMITTED" | "CONFIRMED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED"
) {
  const po = await prisma.inventoryPurchaseOrder.findUnique({
    where: { id: poId },
  });

  if (!po) {
    throw new Error(`PO ${poId} not found`);
  }

  const updated = await prisma.inventoryPurchaseOrder.update({
    where: { id: poId },
    data: {
      status,
      receivedDate: status === "RECEIVED" ? new Date() : undefined,
    },
  });

  if (status === "RECEIVED") {
    await recordStockFromPO(poId);
  }

  return updated;
}

/**
 * Record stock receipt from PO
 */
export async function recordStockFromPO(poId: string) {
  const po = await prisma.inventoryPurchaseOrder.findUnique({
    where: { id: poId },
    include: { product: true },
  });

  if (!po) {
    throw new Error(`PO ${poId} not found`);
  }

  const movement = await prisma.inventoryMovement.create({
    data: {
      productId: po.productId,
      tenantId: po.tenantId,
      type: "PURCHASE",
      quantity: po.quantity,
      reference: po.poNumber,
      notes: `Stock receipt from PO ${po.poNumber}`,
    },
  });

  const stock = await prisma.inventoryStock.findUnique({
    where: { productId: po.productId },
  });

  if (stock) {
    await prisma.inventoryStock.update({
      where: { productId: po.productId },
      data: {
        currentLevel: stock.currentLevel + po.quantity,
      },
    });
  }

  return movement;
}

/**
 * Sync vendor data and prices
 */
export async function syncVendorPrices(supplierId: string) {
  const supplier = await prisma.inventorySupplier.findUnique({
    where: { id: supplierId },
  });

  if (!supplier) {
    throw new Error(`Supplier ${supplierId} not found`);
  }

  const pos = await prisma.inventoryPurchaseOrder.findMany({
    where: { supplierId },
    include: { product: true },
  });

  const vendorPriceData = pos.map((po) => ({
    sku: po.product.sku,
    name: po.product.name,
    unitCost: po.unitCostCents,
    lastPurchaseDate: po.orderedDate,
    leadTime: supplier.leadTimeDays,
  }));

  return {
    supplier: supplier.name,
    priceDataPoints: vendorPriceData.length,
    vendorPriceData,
    syncedAt: new Date(),
  };
}

/**
 * Get vendor performance metrics
 */
export async function getVendorPerformance(supplierId: string) {
  const supplier = await prisma.inventorySupplier.findUnique({
    where: { id: supplierId },
  });

  if (!supplier) {
    throw new Error(`Supplier ${supplierId} not found`);
  }

  const pos = await prisma.inventoryPurchaseOrder.findMany({
    where: { supplierId },
  });

  const totalOrders = pos.length;
  const receivedOrders = pos.filter((p) => p.status === "RECEIVED").length;
  const onTimeOrders = pos.filter((p) => {
    if (!p.receivedDate || !p.expectedDate) return false;
    return p.receivedDate <= p.expectedDate;
  }).length;

  const avgLeadTime = pos
    .filter((p) => p.receivedDate && p.orderedDate)
    .reduce((sum, p) => {
      const leadDays = Math.floor(
        (p.receivedDate!.getTime() - p.orderedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return sum + leadDays;
    }, 0) / (pos.length || 1);

  const totalSpent = pos.reduce((sum, p) => sum + p.totalCostCents, 0);

  return {
    supplier: supplier.name,
    totalOrders,
    receivedOrders,
    onTimeOrders,
    onTimePercentage: totalOrders > 0 ? ((onTimeOrders / totalOrders) * 100).toFixed(2) : "0",
    avgLeadTime: Math.round(avgLeadTime),
    totalSpent,
    leadTimeTarget: supplier.leadTimeDays,
  };
}

/**
 * Get pending POs
 */
export async function getPendingPOs(tenantId: string) {
  return prisma.inventoryPurchaseOrder.findMany({
    where: {
      tenantId,
      status: { in: ["DRAFT", "SUBMITTED", "CONFIRMED", "IN_TRANSIT"] },
    },
    include: { product: true, supplier: true },
    orderBy: { expectedDate: "asc" },
  });
}

/**
 * Get supplier list with stats
 */
export async function getSuppliers(tenantId: string) {
  const suppliers = await prisma.inventorySupplier.findMany({
    where: { tenantId },
  });

  const supplierStats = await Promise.all(
    suppliers.map(async (s) => {
      const poCount = await prisma.inventoryPurchaseOrder.count({
        where: { supplierId: s.id },
      });
      return { ...s, poCount };
    })
  );

  return supplierStats;
}
