import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const productSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().min(1),
  priceCents: z.number().int().min(0),
  cost: z.number().int().min(0).optional(),
  variants: z.array(z.string()).optional(),
  isBundled: z.boolean().optional(),
  bundleItems: z.array(z.string()).optional(),
  customFields: z.record(z.unknown()).optional(),
});

type ProductInput = z.infer<typeof productSchema>;

export async function createProduct(tenantId: string, input: ProductInput) {
  const data = productSchema.parse(input);

  const existing = await prisma.inventoryProduct.findUnique({
    where: { sku: data.sku },
  });

  if (existing) {
    throw AppError.validation("SKU already exists");
  }

  return prisma.inventoryProduct.create({
    data: {
      tenantId,
      ...data,
      customFields: data.customFields || {},
    },
  });
}

export async function getProduct(tenantId: string, productId: string) {
  return prisma.inventoryProduct.findUnique({
    where: { id: productId },
    include: { stock: true },
  }).then((p) => {
    if (!p || p.tenantId !== tenantId) throw AppError.notFound("Product not found");
    return p;
  });
}

export async function listProducts(tenantId: string, { category, archived }: { category?: string; archived?: boolean } = {}) {
  return prisma.inventoryProduct.findMany({
    where: {
      tenantId,
      category: category ? { equals: category } : undefined,
      archived: archived !== undefined ? { equals: archived } : { equals: false },
    },
    include: { stock: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateProduct(tenantId: string, productId: string, input: Partial<ProductInput>) {
  const product = await getProduct(tenantId, productId);
  const updates = productSchema.partial().parse(input);

  return prisma.inventoryProduct.update({
    where: { id: productId },
    data: {
      ...updates,
      customFields: updates.customFields ? { ...product.customFields, ...updates.customFields } : undefined,
    },
    include: { stock: true },
  });
}

export async function archiveProduct(tenantId: string, productId: string) {
  await getProduct(tenantId, productId);
  return prisma.inventoryProduct.update({
    where: { id: productId },
    data: { archived: true },
  });
}

export async function deleteProduct(tenantId: string, productId: string) {
  const product = await getProduct(tenantId, productId);

  // Check for active stock movements or POs
  const movement = await prisma.inventoryMovement.findFirst({
    where: { productId },
  });

  if (movement) {
    throw AppError.validation("Cannot delete product with stock history");
  }

  return prisma.inventoryProduct.delete({
    where: { id: productId },
  });
}

export async function searchProducts(tenantId: string, query: string) {
  return prisma.inventoryProduct.findMany({
    where: {
      tenantId,
      archived: false,
      OR: [
        { sku: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
    },
    include: { stock: true },
    take: 20,
  });
}
