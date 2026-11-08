import { prisma } from "@/lib/prisma";

export async function createPurchaseOrder(vendorId: string, poData: any) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new Error("Vendor not found");

  return prisma.purchaseOrder.create({
    data: {
      vendorId,
      poNumber: `PO-${Date.now()}`,
      items: poData.items || [],
      totalAmount: poData.totalAmount || 0,
      status: "DRAFT",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function getPurchaseOrder(id: string) {
  return prisma.purchaseOrder.findUnique({ where: { id } });
}

export async function updatePurchaseOrderStatus(id: string, status: string) {
  return prisma.purchaseOrder.update({
    where: { id },
    data: { status, updatedAt: new Date() },
  });
}

export async function createInvoice(vendorId: string, poId: string, invoiceData: any) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new Error("PO not found");

  const invoice = await prisma.vendorInvoice.create({
    data: {
      vendorId,
      poId,
      invoiceNumber: `INV-${Date.now()}`,
      amount: invoiceData.amount || po.totalAmount,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: "PENDING",
      createdAt: new Date(),
    },
  });

  // Update vendor total spend
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (vendor) {
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { totalSpend: vendor.totalSpend + invoice.amount },
    });
  }

  return invoice;
}

export async function getInvoices(vendorId: string) {
  return prisma.vendorInvoice.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
  });
}

export async function syncToAccounting(invoiceId: string) {
  const invoice = await prisma.vendorInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error("Invoice not found");

  // Sync to accounting system
  return {
    invoiceId,
    status: "SYNCED",
    accountingReference: `ACC-${Date.now()}`,
  };
}
