import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function getStockValuation(tenantId: string) {
  const products = await prisma.inventoryProduct.findMany({
    where: { tenantId, archived: false },
    include: { stock: true },
  });

  let totalValue = 0;
  const items = products.map((p) => {
    const value = (p.stock?.currentLevel || 0) * (p.cost || p.priceCents);
    totalValue += value;
    return {
      sku: p.sku,
      name: p.name,
      quantity: p.stock?.currentLevel || 0,
      unitCost: p.cost || p.priceCents,
      totalValue: value,
    };
  });

  return {
    totalValue,
    items: items.sort((a, b) => b.totalValue - a.totalValue),
    generatedAt: new Date(),
  };
}

export async function getTurnoverReport(tenantId: string) {
  const products = await prisma.inventoryProduct.findMany({
    where: { tenantId, archived: false },
    select: { id: true, sku: true, name: true, stock: true },
  });

  const items = await Promise.all(
    products.map(async (p) => {
      const sales = await prisma.inventoryMovement.findMany({
        where: {
          tenantId,
          productId: p.id,
          type: "SALE",
        },
      });

      const totalSold = sales.reduce((sum, m) => sum + m.quantity, 0);
      const daysTracked = sales.length > 0
        ? Math.floor((Date.now() - sales[sales.length - 1].createdAt.getTime()) / (1000 * 60 * 60 * 24)) || 1
        : 1;

      const annualTurnover = totalSold / (daysTracked / 365);

      return {
        sku: p.sku,
        name: p.name,
        currentStock: p.stock?.currentLevel || 0,
        totalSold,
        daysTracked,
        annualTurnover: Math.round(annualTurnover * 100) / 100,
      };
    })
  );

  return {
    items: items.sort((a, b) => b.annualTurnover - a.annualTurnover),
    generatedAt: new Date(),
  };
}

export async function getAgingReport(tenantId: string) {
  const stock = await prisma.inventoryStock.findMany({
    where: {
      product: { tenantId, archived: false },
    },
    include: { product: true },
  });

  const items = stock
    .filter((s) => s.currentLevel > 0)
    .map((s) => {
      const lastMovement = s.product.stock?.lastStockCheck || s.product.updatedAt;
      const daysSinceMove = Math.floor((Date.now() - lastMovement.getTime()) / (1000 * 60 * 60 * 24));

      return {
        sku: s.product.sku,
        name: s.product.name,
        quantity: s.currentLevel,
        daysSinceMove,
        age: daysSinceMove > 365 ? "1+ years" : daysSinceMove > 180 ? "6-12 months" : daysSinceMove > 90 ? "3-6 months" : "<3 months",
      };
    });

  return {
    items: items.sort((a, b) => b.daysSinceMove - a.daysSinceMove),
    generatedAt: new Date(),
  };
}

export async function getWasteReport(tenantId: string) {
  const writeOffs = await prisma.inventoryMovement.findMany({
    where: {
      tenantId,
      type: "WRITE_OFF",
    },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  let totalUnits = 0;
  let estimatedCost = 0;

  const items = writeOffs.map((w) => {
    const cost = w.quantity * (w.product.cost || w.product.priceCents);
    totalUnits += w.quantity;
    estimatedCost += cost;

    return {
      sku: w.product.sku,
      name: w.product.name,
      quantity: w.quantity,
      unitCost: w.product.cost || w.product.priceCents,
      totalCost: cost,
      reason: w.notes || "Not specified",
      date: w.createdAt,
    };
  });

  return {
    totalUnits,
    estimatedCost,
    items,
    generatedAt: new Date(),
  };
}

export async function getSupplierAnalysis(tenantId: string) {
  const suppliers = await prisma.inventorySupplier.findMany({
    where: { tenantId },
    include: {
      purchaseOrders: {
        include: { product: true },
      },
    },
  });

  const items = suppliers.map((s) => {
    const totalOrders = s.purchaseOrders.length;
    const totalSpent = s.purchaseOrders.reduce((sum, po) => sum + po.totalCostCents, 0);
    const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;

    return {
      name: s.name,
      contactName: s.contactName || "N/A",
      email: s.email || "N/A",
      totalOrders,
      totalSpent,
      avgOrderValue: Math.round(avgOrderValue),
      leadTimeDays: s.leadTimeDays,
      performance: totalOrders > 0 ? "Active" : "Inactive",
    };
  });

  return {
    items: items.sort((a, b) => b.totalSpent - a.totalSpent),
    generatedAt: new Date(),
  };
}

export async function getCostAnalysis(tenantId: string) {
  const products = await prisma.inventoryProduct.findMany({
    where: { tenantId, archived: false },
    include: { stock: true },
  });

  let totalCost = 0;
  let totalRetailValue = 0;

  const items = products.map((p) => {
    const quantity = p.stock?.currentLevel || 0;
    const cost = quantity * (p.cost || 0);
    const retail = quantity * p.priceCents;

    totalCost += cost;
    totalRetailValue += retail;

    return {
      sku: p.sku,
      name: p.name,
      quantity,
      unitCost: p.cost || 0,
      totalCost: cost,
      unitRetail: p.priceCents,
      totalRetail: retail,
      margin: retail - cost,
      marginPercent: retail > 0 ? Math.round(((retail - cost) / retail) * 100) : 0,
    };
  });

  return {
    summary: {
      totalCost,
      totalRetailValue,
      totalMargin: totalRetailValue - totalCost,
      marginPercent: totalRetailValue > 0 ? Math.round(((totalRetailValue - totalCost) / totalRetailValue) * 100) : 0,
    },
    items: items.sort((a, b) => b.margin - a.margin),
    generatedAt: new Date(),
  };
}

export async function generateReport(tenantId: string, type: string) {
  let data;

  switch (type) {
    case "valuation":
      data = await getStockValuation(tenantId);
      break;
    case "turnover":
      data = await getTurnoverReport(tenantId);
      break;
    case "aging":
      data = await getAgingReport(tenantId);
      break;
    case "waste":
      data = await getWasteReport(tenantId);
      break;
    case "supplier":
      data = await getSupplierAnalysis(tenantId);
      break;
    case "cost":
      data = await getCostAnalysis(tenantId);
      break;
    default:
      throw AppError.validation("Unknown report type");
  }

  return prisma.inventoryReport.create({
    data: {
      tenantId,
      type,
      data,
    },
  });
}
