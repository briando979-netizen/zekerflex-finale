import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { PurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";

const supplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  minimumOrder: z.number().int().min(1).optional(),
  paymentTerms: z.string().optional(),
});

type SupplierInput = z.infer<typeof supplierSchema>;

const poSchema = z.object({
  productId: z.string(),
  supplierId: z.string(),
  quantity: z.number().int().min(1),
  unitCostCents: z.number().int().min(0),
  expectedDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

type POInput = z.infer<typeof poSchema>;

export async function createSupplier(tenantId: string, input: SupplierInput) {
  const data = supplierSchema.parse(input);
  return prisma.inventorySupplier.create({
    data: {
      tenantId,
      ...data,
      leadTimeDays: data.leadTimeDays || 7,
      minimumOrder: data.minimumOrder || 1,
    },
  });
}

export async function getSupplier(tenantId: string, supplierId: string) {
  return prisma.inventorySupplier.findUnique({
    where: { id: supplierId },
  }).then((s) => {
    if (!s || s.tenantId !== tenantId) throw AppError.notFound("Supplier not found");
    return s;
  });
}

export async function listSuppliers(tenantId: string) {
  return prisma.inventorySupplier.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  });
}

export async function updateSupplier(tenantId: string, supplierId: string, input: Partial<SupplierInput>) {
  await getSupplier(tenantId, supplierId);
  const updates = supplierSchema.partial().parse(input);
  return prisma.inventorySupplier.update({
    where: { id: supplierId },
    data: updates,
  });
}

export async function deleteSupplier(tenantId: string, supplierId: string) {
  await getSupplier(tenantId, supplierId);

  // Check for active POs
  const po = await prisma.inventoryPurchaseOrder.findFirst({
    where: {
      supplierId,
      status: { notIn: ["RECEIVED", "CANCELLED"] },
    },
  });

  if (po) throw AppError.validation("Cannot delete supplier with active purchase orders");

  return prisma.inventorySupplier.delete({
    where: { id: supplierId },
  });
}

export async function createPurchaseOrder(tenantId: string, input: POInput) {
  const data = poSchema.parse(input);

  // Verify product and supplier
  const product = await prisma.inventoryProduct.findUnique({
    where: { id: data.productId },
    select: { tenantId: true },
  });

  if (!product || product.tenantId !== tenantId) {
    throw AppError.notFound("Product not found");
  }

  const supplier = await getSupplier(tenantId, data.supplierId);

  // Generate PO number
  const poCount = await prisma.inventoryPurchaseOrder.count({
    where: { tenantId },
  });
  const poNumber = `PO-${tenantId.slice(0, 4).toUpperCase()}-${String(poCount + 1).padStart(6, "0")}`;

  return prisma.inventoryPurchaseOrder.create({
    data: {
      ...data,
      tenantId,
      poNumber,
      totalCostCents: data.quantity * data.unitCostCents,
      expectedDate: data.expectedDate ? new Date(data.expectedDate) : undefined,
      status: "DRAFT",
    },
    include: { product: true, supplier: true },
  });
}

export async function getPO(tenantId: string, poId: string) {
  return prisma.inventoryPurchaseOrder.findUnique({
    where: { id: poId },
    include: { product: true, supplier: true },
  }).then((po) => {
    if (!po || po.tenantId !== tenantId) throw AppError.notFound("PO not found");
    return po;
  });
}

export async function listPOs(tenantId: string, { status, supplierId }: { status?: PurchaseOrderStatus; supplierId?: string } = {}) {
  return prisma.inventoryPurchaseOrder.findMany({
    where: {
      tenantId,
      status,
      supplierId,
    },
    include: { product: true, supplier: true },
    orderBy: { orderedDate: "desc" },
  });
}

export async function updatePOStatus(tenantId: string, poId: string, newStatus: PurchaseOrderStatus) {
  const po = await getPO(tenantId, poId);

  const updates: any = { status: newStatus };

  if (newStatus === "RECEIVED" && !po.receivedDate) {
    updates.receivedDate = new Date();
  }

  return prisma.inventoryPurchaseOrder.update({
    where: { id: poId },
    data: updates,
    include: { product: true },
  });
}

export async function receivePO(tenantId: string, poId: string) {
  const po = await getPO(tenantId, poId);

  // Record stock in movement
  await prisma.inventoryMovement.create({
    data: {
      productId: po.productId,
      tenantId,
      type: "PURCHASE",
      quantity: po.quantity,
      reference: po.poNumber,
      notes: `Received from ${po.supplier.name}`,
    },
  });

  // Update stock
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

  // Update PO status
  return updatePOStatus(tenantId, poId, "RECEIVED");
}

export async function getAutoOrderCandidates(tenantId: string) {
  return prisma.inventoryStock.findMany({
    where: {
      product: { tenantId, archived: false },
      currentLevel: {
        lte: prisma.raw(`"reorderPoint"`),
      },
    },
    include: {
      product: {
        include: {
          purchaseOrders: {
            where: { status: { notIn: ["RECEIVED", "CANCELLED"] } },
          },
        },
      },
    },
  });
}
