import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { MicroWarehouse, HyperlocalInventory } from "@prisma/client";

// ---------------------------------------------------------------------------
// Micro-Fulfillment: Hyperlocal inventory management, micro-warehouse
// optimization, and inventory allocation strategies
// ---------------------------------------------------------------------------

export const MicroWarehouseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  geoZoneId: z.string(),
  name: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  totalCapacity: z.number().int().positive(),
  currentUsage: z.number().int().nonnegative(),
  status: z.enum(["ACTIVE", "INACTIVE", "FULL"]),
  operatingHoursOpen: z.string().optional(),
  operatingHoursClose: z.string().optional(),
});

export type MicroWarehouseInfo = z.infer<typeof MicroWarehouseSchema>;

export const CreateMicroWarehouseSchema = z.object({
  tenantId: z.string(),
  geoZoneId: z.string(),
  name: z.string().min(2).max(100),
  address: z.string().min(5),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  totalCapacity: z.number().int().min(10).max(1000000),
  operatingHoursOpen: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  operatingHoursClose: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export type CreateMicroWarehouseInput = z.infer<
  typeof CreateMicroWarehouseSchema
>;

export const InventoryItemSchema = z.object({
  id: z.string(),
  microWarehouseId: z.string(),
  productId: z.string().optional(),
  productName: z.string(),
  quantity: z.number().int().nonnegative(),
  reservedQuantity: z.number().int().nonnegative(),
  lastRestockAt: z.date().optional(),
  expiresAt: z.date().optional(),
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const StockRequestSchema = z.object({
  productId: z.string().optional(),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  expirationDate: z.date().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export type StockRequestInput = z.infer<typeof StockRequestSchema>;

/**
 * Bereken de capaciteitsbezetting van een micro-warehouse
 */
export function getCapacityUtilization(warehouse: MicroWarehouse): {
  percentage: number;
  status: "OPTIMAL" | "WARNING" | "CRITICAL" | "FULL";
} {
  const percentage = (warehouse.currentUsage / warehouse.totalCapacity) * 100;

  if (percentage >= 95) {
    return { percentage, status: "FULL" };
  }
  if (percentage >= 80) {
    return { percentage, status: "CRITICAL" };
  }
  if (percentage >= 60) {
    return { percentage, status: "WARNING" };
  }
  return { percentage, status: "OPTIMAL" };
}

/**
 * Controleer of een product beschikbaar is in een warehouse
 */
export async function checkProductAvailability(
  warehouseId: string,
  productId: string,
  quantity: number
): Promise<boolean> {
  const inventory = await prisma.hyperlocalInventory.findUnique({
    where: {
      microWarehouseId_productId: {
        microWarehouseId: warehouseId,
        productId,
      },
    },
  });

  if (!inventory) return false;

  const available = inventory.quantity - inventory.reservedQuantity;
  return available >= quantity;
}

/**
 * Reserveer inventaris voor een order
 */
export async function reserveInventory(
  warehouseId: string,
  productId: string,
  quantity: number
): Promise<boolean> {
  const inventory = await prisma.hyperlocalInventory.findUnique({
    where: {
      microWarehouseId_productId: {
        microWarehouseId: warehouseId,
        productId,
      },
    },
  });

  if (!inventory) return false;

  const available = inventory.quantity - inventory.reservedQuantity;
  if (available < quantity) return false;

  await prisma.hyperlocalInventory.update({
    where: {
      microWarehouseId_productId: {
        microWarehouseId: warehouseId,
        productId,
      },
    },
    data: {
      reservedQuantity: {
        increment: quantity,
      },
    },
  });

  return true;
}

/**
 * Geef inventaris vrij als order wordt geannuleerd
 */
export async function releaseInventory(
  warehouseId: string,
  productId: string,
  quantity: number
): Promise<void> {
  await prisma.hyperlocalInventory.update({
    where: {
      microWarehouseId_productId: {
        microWarehouseId: warehouseId,
        productId,
      },
    },
    data: {
      reservedQuantity: {
        decrement: quantity,
      },
    },
  });
}

/**
 * Bevestig inventaris oppikken voor levering
 */
export async function confirmInventoryPickup(
  warehouseId: string,
  items: Array<{ productId: string; quantity: number }>
): Promise<void> {
  for (const item of items) {
    await prisma.hyperlocalInventory.update({
      where: {
        microWarehouseId_productId: {
          microWarehouseId: warehouseId,
          productId: item.productId,
        },
      },
      data: {
        quantity: {
          decrement: item.quantity,
        },
        reservedQuantity: {
          decrement: item.quantity,
        },
      },
    });
  }
}

/**
 * Kies het beste warehouse voor fulfillment op basis van:
 * - Inventarisbeschikbaarheid
 * - Afstand tot klant
 * - Capaciteitsbezetting
 */
export async function selectOptimalWarehouse(
  geoZoneId: string,
  customerLat: number,
  customerLon: number,
  requiredItems: Array<{ productId: string; quantity: number }>
): Promise<
  (MicroWarehouse & {
    distanceMeters: number;
    availabilityScore: number;
  }) | null
> {
  const warehouses = await prisma.microWarehouse.findMany({
    where: {
      geoZoneId,
      status: "ACTIVE",
    },
    include: {
      inventory: {
        where: {
          productId: {
            in: requiredItems.map((i) => i.productId).filter(Boolean) as string[],
          },
        },
      },
    },
  });

  if (warehouses.length === 0) return null;

  // Score elk warehouse
  const scored = warehouses
    .map((warehouse) => {
      // Controleer inventaris
      let inventoryScore = 1.0;
      for (const requiredItem of requiredItems) {
        const item = warehouse.inventory.find(
          (i) => i.productId === requiredItem.productId
        );
        if (!item) {
          inventoryScore *= 0; // Missing item = disqualified
          break;
        }
        const available = item.quantity - item.reservedQuantity;
        if (available < requiredItem.quantity) {
          inventoryScore *= 0.5; // Partial availability
        }
      }

      // Controleer capaciteit
      const utilization = getCapacityUtilization(warehouse);
      let capacityScore = 1.0;
      if (utilization.status === "FULL") capacityScore = 0;
      else if (utilization.status === "CRITICAL") capacityScore = 0.3;
      else if (utilization.status === "WARNING") capacityScore = 0.7;

      // Bereken afstand
      const latDiff = warehouse.latitude - customerLat;
      const lonDiff = warehouse.longitude - customerLon;
      const distanceMeters = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111000; // Rough conversion to meters

      const availabilityScore =
        inventoryScore * capacityScore * (1 - distanceMeters / 50000); // Normalize distance

      return {
        ...warehouse,
        distanceMeters: Math.round(distanceMeters),
        availabilityScore: Math.max(0, availabilityScore),
      };
    })
    .filter((w) => w.availabilityScore > 0)
    .sort((a, b) => b.availabilityScore - a.availabilityScore);

  return scored[0] ?? null;
}

/**
 * Simuleer restocking scenario's
 */
export async function forecastRestockingNeeds(
  geoZoneId: string,
  daysAhead: number = 7
): Promise<
  Array<{
    warehouseId: string;
    productId: string;
    currentStock: number;
    predictedDemand: number;
    recommendedRestock: number;
  }>
> {
  const warehouses = await prisma.microWarehouse.findMany({
    where: { geoZoneId },
    include: {
      inventory: true,
    },
  });

  const recommendations = [];

  for (const warehouse of warehouses) {
    for (const item of warehouse.inventory) {
      if (!item.productId) continue;

      // Simpele voorspelling: aanname van 5 stuks per dag gemiddeld
      const predictedDemand = Math.ceil(5 * daysAhead);
      const currentStock = item.quantity - item.reservedQuantity;

      if (currentStock < predictedDemand) {
        recommendations.push({
          warehouseId: warehouse.id,
          productId: item.productId,
          currentStock,
          predictedDemand,
          recommendedRestock: Math.ceil(predictedDemand - currentStock + 20), // Buffer
        });
      }
    }
  }

  return recommendations;
}
