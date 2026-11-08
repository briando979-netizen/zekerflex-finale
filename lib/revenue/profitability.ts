import { prisma } from "@/lib/prisma";

export async function calculateProductProfitability(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, price: true, cost: true, sales: true }
  });
  
  if (!product) throw new Error("Product not found");
  
  const grossProfit = (product.price - product.cost) * product.sales;
  const margin = (product.price - product.cost) / product.price;
  
  return { productId, price: product.price, cost: product.cost, grossProfit, margin, sales: product.sales };
}

export async function calculateCustomerProfitability(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { orders: { select: { total: true, cost: true } } }
  });
  
  if (!customer) throw new Error("Customer not found");
  
  const revenue = customer.orders.reduce((sum, o) => sum + o.total, 0);
  const cost = customer.orders.reduce((sum, o) => sum + (o.cost || 0), 0);
  
  return { customerId, revenue, cost, profit: revenue - cost, margin: (revenue - cost) / revenue };
}

export async function calculateChannelProfitability(channel: string) {
  const orders = await prisma.order.findMany({
    where: { channel },
    select: { total: true, cost: true }
  });
  
  const revenue = orders.reduce((sum, o) => sum + o.total, 0);
  const cost = orders.reduce((sum, o) => sum + (o.cost || 0), 0);
  
  return { channel, revenue, cost, profit: revenue - cost, margin: (revenue - cost) / revenue };
}
