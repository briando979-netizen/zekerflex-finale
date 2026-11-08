import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  addedAt: Date;
}

export interface SavedItem {
  productId: string;
  variantId?: string;
  savedAt: Date;
}

export async function getCart(userId: string) {
  const cart = await prisma.shoppingCart.findUnique({
    where: { userId },
    include: { items: true, coupons: true },
  });
  return cart || { userId, items: [], coupons: [], total: 0, subtotal: 0 };
}

export async function addToCart(
  userId: string,
  productId: string,
  quantity: number,
  variantId?: string
) {
  const cart = await prisma.shoppingCart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  await prisma.cartItem.upsert({
    where: {
      cartId_productId_variantId: { cartId: cart.id, productId, variantId: variantId || "" },
    },
    update: { quantity: { increment: quantity } },
    create: { cartId: cart.id, productId, variantId, quantity },
  });

  return getCart(userId);
}

export async function removeFromCart(userId: string, productId: string, variantId?: string) {
  const cart = await getCart(userId);
  if (!cart) throw AppError.notFound("Cart not found");

  await prisma.cartItem.delete({
    where: {
      cartId_productId_variantId: {
        cartId: cart.id,
        productId,
        variantId: variantId || "",
      },
    },
  });

  return getCart(userId);
}

export async function updateQuantity(
  userId: string,
  productId: string,
  quantity: number,
  variantId?: string
) {
  if (quantity <= 0) return removeFromCart(userId, productId, variantId);

  const cart = await getCart(userId);
  if (!cart) throw AppError.notFound("Cart not found");

  await prisma.cartItem.update({
    where: {
      cartId_productId_variantId: {
        cartId: cart.id,
        productId,
        variantId: variantId || "",
      },
    },
    data: { quantity },
  });

  return getCart(userId);
}

export async function saveForLater(userId: string, productId: string, variantId?: string) {
  await removeFromCart(userId, productId, variantId);

  await prisma.savedItem.upsert({
    where: { userId_productId: { userId, productId } },
    update: { variantId },
    create: { userId, productId, variantId },
  });

  return { success: true };
}

export async function getSavedItems(userId: string) {
  return prisma.savedItem.findMany({ where: { userId } });
}

export async function applyCoupon(userId: string, code: string) {
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) throw AppError.validation("Invalid coupon code");

  const cart = await getCart(userId);
  if (!cart) throw AppError.notFound("Cart not found");

  await prisma.cartCoupon.upsert({
    where: { cartId_couponId: { cartId: cart.id, couponId: coupon.id } },
    update: {},
    create: { cartId: cart.id, couponId: coupon.id },
  });

  return getCart(userId);
}

export async function removeCoupon(userId: string, couponId: string) {
  const cart = await getCart(userId);
  if (!cart) throw AppError.notFound("Cart not found");

  await prisma.cartCoupon.delete({
    where: { cartId_couponId: { cartId: cart.id, couponId } },
  });

  return getCart(userId);
}

export async function clearCart(userId: string) {
  const cart = await getCart(userId);
  if (!cart) return { success: true };

  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  await prisma.cartCoupon.deleteMany({ where: { cartId: cart.id } });

  return { success: true };
}
