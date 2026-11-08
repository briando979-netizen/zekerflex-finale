import { prisma } from "@/lib/prisma";
import { z } from "zod";

const stockMovementSchema = z.object({
  productId: z.string(),
  tenantId: z.string(),
  type: z.enum(["PURCHASE", "SALE", "ADJUSTMENT", "TRANSFER", "WRITE_OFF", "RETURN"]),
  quantity: z.number().int(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
  warehouseLocation: z.string().optional(),
});

export type StockMovement = z.infer<typeof stockMovementSchema>;

/**
 * Record a stock movement (purchase, sale, adjustment, transfer, write-off, return)
 * Updates the current stock level and creates an audit trail
 */
export async function recordStockMovement(data: StockMovement) {
  const validated = stockMovementSchema.parse(data);

  // Verify product exists
  const product = await prisma.inventoryProduct.findUnique({
    where: { id: validated.productId },
    include: { stock: true },
  });

  if (!product) {
    throw new Error(`Product ${validated.productId} not found`);
  }

  if (!product.stock) {
    throw new Error(`Stock record not found for product ${validated.productId}`);
  }

  // Record the movement
  const movement = await prisma.inventoryMovement.create({
    data: {
      productId: validated.productId,
      tenantId: validated.tenantId,
      type: validated.type,
      quantity: validated.quantity,
      reference: validated.reference,
      notes: validated.notes,
      createdBy: validated.createdBy,
    },
  });

  // Update stock level
  const newLevel = product.stock.currentLevel + validated.quantity;

  if (newLevel < 0) {
    throw new Error(
      `Insufficient stock for product ${validated.productId}. Available: ${product.stock.currentLevel}, Requested: ${validated.quantity}`
    );
  }

  await prisma.inventoryStock.update({
    where: { id: product.stock.id },
    data: {
      currentLevel: newLevel,
      warehouseLocation: validated.warehouseLocation || product.stock.warehouseLocation,
      updatedAt: new Date(),
    },
  });

  return movement;
}

/**
 * Get current stock level for a product
 */
export async function getStockLevel(productId: string) {
  const stock = await prisma.inventoryStock.findUnique({
    where: { productId },
    include: {
      product: true,
    },
  });

  if (!stock) {
    throw new Error(`Stock not found for product ${productId}`);
  }

  return {
    productId: stock.productId,
    sku: stock.product.sku,
    name: stock.product.name,
    currentLevel: stock.currentLevel,
    reorderPoint: stock.reorderPoint,
    reorderQty: stock.reorderQty,
    warehouseLocation: stock.warehouseLocation,
    lotNumber: stock.lotNumber,
    expirationDate: stock.expirationDate,
    needsReorder: stock.currentLevel <= stock.reorderPoint,
    lastStockCheck: stock.lastStockCheck,
  };
}

/**
 * Get stock movement history for a product
 */
export async function getStockMovementHistory(
  productId: string,
  tenantId: string,
  options?: { limit?: number; offset?: number; type?: string }
) {
  const { limit = 50, offset = 0, type } = options || {};

  const movements = await prisma.inventoryMovement.findMany({
    where: {
      productId,
      tenantId,
      ...(type && { type: type as any }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: {
      product: {
        select: { sku: true, name: true },
      },
    },
  });

  const total = await prisma.inventoryMovement.count({
    where: {
      productId,
      tenantId,
      ...(type && { type: type as any }),
    },
  });

  return {
    movements,
    total,
    limit,
    offset,
  };
}

/**
 * Bulk get stock levels for multiple products
 */
export async function getStockLevelsBatch(productIds: string[]) {
  const stocks = await prisma.inventoryStock.findMany({
    where: { productId: { in: productIds } },
    include: { product: true },
  });

  return stocks.map((stock) => ({
    productId: stock.productId,
    sku: stock.product.sku,
    name: stock.product.name,
    currentLevel: stock.currentLevel,
    reorderPoint: stock.reorderPoint,
    needsReorder: stock.currentLevel <= stock.reorderPoint,
  }));
}

/**
 * Get low-stock items for a tenant
 */
export async function getLowStockItems(tenantId: string) {
  const products = await prisma.inventoryProduct.findMany({
    where: { tenantId },
    include: {
      stock: true,
    },
  });

  return products
    .filter((p) => p.stock && p.stock.currentLevel <= p.stock.reorderPoint)
    .map((p) => ({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      currentLevel: p.stock!.currentLevel,
      reorderPoint: p.stock!.reorderPoint,
      reorderQty: p.stock!.reorderQty,
      shortage: p.stock!.reorderPoint - p.stock!.currentLevel,
    }));
}

/**
 * Get expiring stock items
 */
export async function getExpiringStockItems(
  tenantId: string,
  daysUntilExpiry: number = 30
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + daysUntilExpiry);

  const products = await prisma.inventoryProduct.findMany({
    where: { tenantId },
    include: {
      stock: {
        where: {
          expirationDate: {
            lte: cutoffDate,
            gt: new Date(),
          },
        },
      },
    },
  });

  return products
    .filter((p) => p.stock)
    .map((p) => ({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      currentLevel: p.stock!.currentLevel,
      expirationDate: p.stock!.expirationDate,
      daysUntilExpiry: Math.ceil(
        (p.stock!.expirationDate!.getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      ),
    }));
}

/**
 * Update reorder settings for a product
 */
export async function updateReorderSettings(
  productId: string,
  reorderPoint: number,
  reorderQty: number
) {
  const stock = await prisma.inventoryStock.findUnique({
    where: { productId },
  });

  if (!stock) {
    throw new Error(`Stock not found for product ${productId}`);
  }

  return prisma.inventoryStock.update({
    where: { productId },
    data: {
      reorderPoint,
      reorderQty,
    },
  });
}
