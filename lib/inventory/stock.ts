import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const stockUpdateSchema = z.object({
  currentLevel: z.number().int().min(0).optional(),
  reorderPoint: z.number().int().min(0).optional(),
  reorderQty: z.number().int().min(0).optional(),
  warehouseLocation: z.string().optional(),
  lotNumber: z.string().optional(),
  serialNumbers: z.array(z.string()).optional(),
  expirationDate: z.string().datetime().optional(),
});

type StockUpdate = z.infer<typeof stockUpdateSchema>;

export async function getStock(tenantId: string, productId: string) {
  const product = await prisma.inventoryProduct.findUnique({
    where: { id: productId },
    select: { tenantId: true },
  });

  if (!product || product.tenantId !== tenantId) {
    throw AppError.notFound("Product not found");
  }

  return prisma.inventoryStock.findUnique({
    where: { productId },
  });
}

export async function initializeStock(productId: string, currentLevel = 0) {
  return prisma.inventoryStock.upsert({
    where: { productId },
    create: {
      productId,
      currentLevel,
      reorderPoint: 0,
      reorderQty: 0,
    },
    update: {},
  });
}

export async function updateStock(tenantId: string, productId: string, update: StockUpdate) {
  await getStock(tenantId, productId);
  const data = stockUpdateSchema.parse(update);

  return prisma.inventoryStock.upsert({
    where: { productId },
    create: {
      productId,
      ...data,
      expirationDate: data.expirationDate ? new Date(data.expirationDate) : undefined,
    },
    update: {
      ...data,
      expirationDate: data.expirationDate ? new Date(data.expirationDate) : undefined,
      updatedAt: new Date(),
    },
  });
}

export async function checkReorderNeeded(tenantId: string) {
  return prisma.inventoryStock.findMany({
    where: {
      product: { tenantId, archived: false },
      currentLevel: {
        lte: prisma.raw(`"reorderPoint"`),
      },
    },
    include: { product: true },
  });
}

export async function listLowStock(tenantId: string) {
  return prisma.inventoryStock.findMany({
    where: {
      product: { tenantId, archived: false },
      currentLevel: {
        lte: prisma.raw(`"reorderPoint"`),
      },
    },
    include: { product: true },
    orderBy: { currentLevel: "asc" },
  });
}

export async function recordStockCheck(tenantId: string, productId: string, actualLevel: number) {
  const stock = await getStock(tenantId, productId);
  if (!stock) throw AppError.notFound("Stock record not found");

  return prisma.inventoryStock.update({
    where: { productId },
    data: {
      currentLevel: actualLevel,
      lastStockCheck: new Date(),
    },
  });
}

export async function getExpiredStock(tenantId: string) {
  const now = new Date();
  return prisma.inventoryStock.findMany({
    where: {
      product: { tenantId, archived: false },
      expirationDate: { lte: now },
    },
    include: { product: true },
  });
}
