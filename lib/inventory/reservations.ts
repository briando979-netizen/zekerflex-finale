import { prisma } from "@/lib/prisma";
import { z } from "zod";

const reservationSchema = z.object({
  tenantId: z.string(),
  productId: z.string(),
  quantity: z.number().int().min(1),
  reservedBy: z.string(),
  holdUntil: z.coerce.date(),
  purpose: z.string().optional(),
  reference: z.string().optional(),
});

export type Reservation = z.infer<typeof reservationSchema>;

/**
 * Create a reservation for items
 */
export async function createReservation(data: Reservation) {
  const validated = reservationSchema.parse(data);

  // Check available stock
  const stock = await prisma.inventoryStock.findUnique({
    where: { productId: validated.productId },
    include: { product: true },
  });

  if (!stock) {
    throw new Error(`Stock not found for product ${validated.productId}`);
  }

  // Get active reservations
  const activeReservations = await prisma.inventoryReservation.findMany({
    where: {
      productId: validated.productId,
      status: "ACTIVE",
      holdUntil: { gt: new Date() },
    },
  });

  const reservedQty = activeReservations.reduce((sum, r) => sum + r.quantity, 0);
  const available = stock.currentLevel - reservedQty;

  if (available < validated.quantity) {
    throw new Error(
      `Insufficient stock available. Requested: ${validated.quantity}, Available: ${available}`
    );
  }

  const reservation = await prisma.inventoryReservation.create({
    data: {
      tenantId: validated.tenantId,
      productId: validated.productId,
      quantity: validated.quantity,
      reservedBy: validated.reservedBy,
      holdUntil: validated.holdUntil,
      purpose: validated.purpose,
      reference: validated.reference,
      status: "ACTIVE",
    },
  });

  return reservation;
}

/**
 * Get reservation by ID
 */
export async function getReservation(reservationId: string) {
  const reservation = await prisma.inventoryReservation.findUnique({
    where: { id: reservationId },
    include: {
      product: {
        select: { sku: true, name: true },
      },
    },
  });

  if (!reservation) {
    throw new Error(`Reservation ${reservationId} not found`);
  }

  return {
    ...reservation,
    isExpired: reservation.holdUntil < new Date(),
    minutesRemaining: Math.max(
      0,
      Math.floor((reservation.holdUntil.getTime() - new Date().getTime()) / 60000)
    ),
  };
}

/**
 * Confirm a reservation (convert to sale/consumption)
 */
export async function confirmReservation(reservationId: string, consumedBy?: string) {
  const reservation = await prisma.inventoryReservation.findUnique({
    where: { id: reservationId },
  });

  if (!reservation) {
    throw new Error(`Reservation ${reservationId} not found`);
  }

  if (reservation.status !== "ACTIVE") {
    throw new Error(`Reservation ${reservationId} is not active`);
  }

  // Record the stock movement
  await prisma.inventoryMovement.create({
    data: {
      productId: reservation.productId,
      tenantId: reservation.tenantId,
      type: "SALE",
      quantity: -reservation.quantity,
      reference: `RES:${reservationId}`,
      notes: `Reservation confirmed${consumedBy ? ` by ${consumedBy}` : ""}`,
      createdBy: consumedBy,
    },
  });

  // Update stock
  const stock = await prisma.inventoryStock.findUnique({
    where: { productId: reservation.productId },
  });

  if (stock) {
    await prisma.inventoryStock.update({
      where: { productId: reservation.productId },
      data: {
        currentLevel: stock.currentLevel - reservation.quantity,
      },
    });
  }

  // Update reservation
  return prisma.inventoryReservation.update({
    where: { id: reservationId },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });
}

/**
 * Cancel a reservation
 */
export async function cancelReservation(reservationId: string, reason?: string) {
  const reservation = await prisma.inventoryReservation.findUnique({
    where: { id: reservationId },
  });

  if (!reservation) {
    throw new Error(`Reservation ${reservationId} not found`);
  }

  if (reservation.status === "CANCELLED") {
    throw new Error(`Reservation ${reservationId} is already cancelled`);
  }

  return prisma.inventoryReservation.update({
    where: { id: reservationId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: reason,
    },
  });
}

/**
 * Get active reservations for a product
 */
export async function getProductReservations(productId: string) {
  const now = new Date();

  const reservations = await prisma.inventoryReservation.findMany({
    where: {
      productId,
      holdUntil: { gt: now },
    },
    orderBy: { holdUntil: "asc" },
    include: {
      product: {
        select: { sku: true, name: true },
      },
    },
  });

  return reservations.map((r) => ({
    ...r,
    minutesRemaining: Math.floor(
      (r.holdUntil.getTime() - now.getTime()) / 60000
    ),
  }));
}

/**
 * Get available stock accounting for active reservations
 */
export async function getAvailableStock(productId: string) {
  const stock = await prisma.inventoryStock.findUnique({
    where: { productId },
  });

  if (!stock) {
    throw new Error(`Stock not found for product ${productId}`);
  }

  const activeReservations = await prisma.inventoryReservation.findMany({
    where: {
      productId,
      status: "ACTIVE",
      holdUntil: { gt: new Date() },
    },
  });

  const reservedQty = activeReservations.reduce((sum, r) => sum + r.quantity, 0);

  return {
    productId,
    currentStock: stock.currentLevel,
    reservedQty,
    availableQty: stock.currentLevel - reservedQty,
    reservationCount: activeReservations.length,
  };
}

/**
 * Expire reservations that have passed their hold time
 */
export async function expireReservations() {
  const now = new Date();

  const expired = await prisma.inventoryReservation.updateMany({
    where: {
      status: "ACTIVE",
      holdUntil: { lte: now },
    },
    data: {
      status: "EXPIRED",
      expiredAt: now,
    },
  });

  return {
    expiredCount: expired.count,
    timestamp: now,
  };
}

/**
 * Get user's reservations
 */
export async function getUserReservations(tenantId: string, userId: string) {
  const now = new Date();

  const reservations = await prisma.inventoryReservation.findMany({
    where: {
      tenantId,
      reservedBy: userId,
    },
    include: {
      product: {
        select: { sku: true, name: true, priceCents: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return reservations.map((r) => ({
    ...r,
    isActive: r.status === "ACTIVE" && r.holdUntil > now,
    isExpired: r.holdUntil <= now,
    minutesRemaining: Math.max(
      0,
      Math.floor((r.holdUntil.getTime() - now.getTime()) / 60000)
    ),
  }));
}

/**
 * Generate reservation report
 */
export async function generateReservationReport(tenantId: string) {
  const now = new Date();

  const allReservations = await prisma.inventoryReservation.findMany({
    where: { tenantId },
    include: {
      product: {
        select: { sku: true, name: true, priceCents: true },
      },
    },
  });

  const active = allReservations.filter(
    (r) => r.status === "ACTIVE" && r.holdUntil > now
  );
  const expired = allReservations.filter((r) => r.status === "EXPIRED" || r.holdUntil <= now);
  const confirmed = allReservations.filter((r) => r.status === "CONFIRMED");
  const cancelled = allReservations.filter((r) => r.status === "CANCELLED");

  const totalReservedValue = active.reduce(
    (sum, r) => sum + (r.product.priceCents * r.quantity),
    0
  );

  return {
    generatedAt: now,
    active: active.length,
    expired: expired.length,
    confirmed: confirmed.length,
    cancelled: cancelled.length,
    total: allReservations.length,
    totalReservedValue,
    reservations: allReservations,
  };
}
