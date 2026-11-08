import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { InventoryMovementType } from "@prisma/client";
import { z } from "zod";

const movementSchema = z.object({
  productId: z.string(),
  type: z.nativeEnum(InventoryMovementType),
  quantity: z.number().int(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
});

type MovementInput = z.infer<typeof movementSchema>;

export async function recordMovement(tenantId: string, input: MovementInput) {
  const data = movementSchema.parse(input);

  // Verify product exists and belongs to tenant
  const product = await prisma.inventoryProduct.findUnique({
    where: { id: data.productId },
    select: { tenantId: true, stock: true },
  });

  if (!product || product.tenantId !== tenantId) {
    throw AppError.notFound("Product not found");
  }

  // Record movement
  const movement = await prisma.inventoryMovement.create({
    data: {
      ...data,
      tenantId,
    },
    include: { product: true },
  });

  // Update stock level
  const stock = product.stock || await prisma.inventoryStock.create({
    data: { productId: data.productId, currentLevel: 0 },
  });

  const newLevel = Math.max(0, stock.currentLevel + data.quantity);

  await prisma.inventoryStock.update({
    where: { productId: data.productId },
    data: { currentLevel: newLevel },
  });

  return movement;
}

export async function getMovement(tenantId: string, movementId: string) {
  return prisma.inventoryMovement.findUnique({
    where: { id: movementId },
  }).then((m) => {
    if (!m || m.tenantId !== tenantId) throw AppError.notFound("Movement not found");
    return m;
  });
}

export async function listMovements(
  tenantId: string,
  {
    productId,
    type,
    startDate,
    endDate,
  }: {
    productId?: string;
    type?: InventoryMovementType;
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  return prisma.inventoryMovement.findMany({
    where: {
      tenantId,
      productId,
      type,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: { product: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export async function getMovementsByType(tenantId: string, type: InventoryMovementType) {
  return prisma.inventoryMovement.findMany({
    where: { tenantId, type },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAuditTrail(tenantId: string, productId: string) {
  return prisma.inventoryMovement.findMany({
    where: {
      tenantId,
      productId,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function calculateStockTurnover(tenantId: string, productId: string) {
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      tenantId,
      productId,
      type: "SALE",
    },
  });

  const totalSold = movements.reduce((sum, m) => sum + m.quantity, 0);
  const daysTracked = movements.length > 0
    ? Math.floor((Date.now() - movements[movements.length - 1].createdAt.getTime()) / (1000 * 60 * 60 * 24)) || 1
    : 1;

  return totalSold / (daysTracked / 365); // annual turnover
}

export async function getWasteReport(tenantId: string) {
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      tenantId,
      type: "WRITE_OFF",
    },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  return movements.reduce((acc, m) => {
    acc.totalUnits += m.quantity;
    acc.items.push({
      product: m.product.name,
      quantity: m.quantity,
      notes: m.notes,
      date: m.createdAt,
    });
    return acc;
  }, { totalUnits: 0, items: [] as any[] });
}
