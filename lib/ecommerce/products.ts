import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { variants: true, reviews: true, recommendations: true },
  });
  if (!product) throw AppError.notFound("Product not found");
  return product;
}

export async function getProductsByCollection(collectionId: string) {
  return prisma.product.findMany({
    where: { collectionId },
    include: { variants: true, reviews: true },
    take: 50,
  });
}

export async function getRelatedProducts(productId: string) {
  const product = await getProduct(productId);
  return prisma.product.findMany({
    where: {
      collectionId: product.collectionId,
      id: { not: productId },
    },
    take: 6,
    include: { reviews: true },
  });
}

export async function getProductRecommendations(productId: string) {
  return prisma.productRecommendation.findMany({
    where: { productId },
    include: { relatedProduct: true },
    take: 8,
  });
}

export async function searchProducts(query: string) {
  return prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
    include: { variants: true, reviews: true },
    take: 20,
  });
}

export async function getProductReviews(productId: string) {
  return prisma.productReview.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function addProductReview(productId: string, userId: string, rating: number, comment: string) {
  if (rating < 1 || rating > 5) throw AppError.validation("Rating must be 1-5");

  return prisma.productReview.create({
    data: { productId, userId, rating, comment },
  });
}

export async function getProductVariant(variantId: string) {
  return prisma.productVariant.findUnique({ where: { id: variantId } });
}

export async function checkInventory(variantId: string, quantity: number) {
  const variant = await getProductVariant(variantId);
  if (!variant) throw AppError.notFound("Variant not found");
  if (variant.stock < quantity) throw AppError.validation("Insufficient inventory");
  return true;
}

export async function getCollections() {
  return prisma.collection.findMany({ include: { _count: { select: { products: true } } } });
}

export async function getCollection(id: string) {
  return prisma.collection.findUnique({
    where: { id },
    include: { products: { take: 50 } },
  });
}
