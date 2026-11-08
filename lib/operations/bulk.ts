import { prisma } from "@/lib/prisma";

export interface BulkOperation {
  action: "UPDATE" | "DELETE" | "EXPORT" | "STATUS_CHANGE";
  resourceType: string;
  ids: string[];
  data?: Record<string, any>;
}

export async function executeBulkOperation(operation: BulkOperation) {
  const { action, resourceType, ids, data } = operation;

  try {
    if (action === "UPDATE" && data) {
      if (resourceType === "bookings") {
        await prisma.booking.updateMany({
          where: { id: { in: ids } },
          data,
        });
      } else if (resourceType === "products") {
        await prisma.product.updateMany({
          where: { id: { in: ids } },
          data,
        });
      }
      return { success: true, updated: ids.length };
    }

    if (action === "DELETE") {
      if (resourceType === "bookings") {
        await prisma.booking.deleteMany({
          where: { id: { in: ids } },
        });
      } else if (resourceType === "products") {
        await prisma.product.deleteMany({
          where: { id: { in: ids } },
        });
      }
      return { success: true, deleted: ids.length };
    }

    if (action === "STATUS_CHANGE" && data?.status) {
      if (resourceType === "bookings") {
        await prisma.booking.updateMany({
          where: { id: { in: ids } },
          data: { status: data.status },
        });
      }
      return { success: true, changed: ids.length };
    }

    if (action === "EXPORT") {
      if (resourceType === "bookings") {
        const items = await prisma.booking.findMany({
          where: { id: { in: ids } },
        });
        return { success: true, data: items };
      }
    }

    return { success: false, error: "Unknown operation" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export async function getBulkOperationStatus(operationId: string) {
  return {
    id: operationId,
    status: "COMPLETED",
    processed: 100,
    total: 100,
    percentage: 100,
  };
}
