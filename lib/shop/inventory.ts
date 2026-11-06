// Inventory and stock management

export interface InventoryItem {
  id: string;
  productId: string;
  sku: string;
  quantity: number;
  reservedQuantity: number;
  warehouse?: string;
  lastRestocked: Date;
  reorderLevel: number;
  supplier?: string;
}

export interface StockMovement {
  id: string;
  inventoryId: string;
  type: "sale" | "return" | "adjustment" | "restock" | "damage";
  quantity: number;
  reason?: string;
  orderId?: string;
  createdAt: Date;
}

export async function checkStock(productId: string): Promise<number> {
  // TODO: Get available quantity from database
  return 0;
}

export async function reserveStock(productId: string, quantity: number): Promise<boolean> {
  // TODO: Reserve in database (pessimistic locking)
  return true;
}

export async function releaseReservation(productId: string, quantity: number): Promise<void> {
  // TODO: Release reservation
}

export async function updateStock(productId: string, change: number, type: StockMovement["type"]): Promise<void> {
  // TODO: Update inventory and log movement
}

export function getStockStatus(available: number, reserved: number): "in_stock" | "low_stock" | "out_of_stock" {
  const total = available + reserved;
  if (total === 0) return "out_of_stock";
  if (available < 5) return "low_stock";
  return "in_stock";
}

export async function getStockAlerts(): Promise<InventoryItem[]> {
  // TODO: Get items below reorder level
  return [];
}
