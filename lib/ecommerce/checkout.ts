import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const addressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().min(1),
});

const checkoutSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  shippingMethod: z.string(),
  paymentMethod: z.string(),
});

export type CheckoutData = z.infer<typeof checkoutSchema>;

export async function validateCheckout(data: CheckoutData) {
  return checkoutSchema.parseAsync(data);
}

export async function getShippingOptions(zipCode: string) {
  return [
    { id: "standard", label: "Standard (5-7 days)", price: 0 },
    { id: "express", label: "Express (2-3 days)", price: 15 },
    { id: "overnight", label: "Overnight", price: 50 },
  ];
}

export async function validateAddress(address: z.infer<typeof addressSchema>) {
  // Simple validation - in production, use real address validation service
  if (!address.zip.match(/^\d{4,5}$/)) {
    throw AppError.validation("Invalid ZIP code format");
  }
  return true;
}

export async function calculateTotals(
  cartItems: Array<{ price: number; quantity: number }>,
  shippingCost: number,
  discountAmount: number
) {
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.21; // 21% VAT
  const total = subtotal + tax + shippingCost - discountAmount;

  return { subtotal, tax, shipping: shippingCost, discount: discountAmount, total };
}

export async function createOrder(data: CheckoutData & { cartId: string }) {
  await validateCheckout(data);

  const cart = await prisma.shoppingCart.findUnique({
    where: { id: data.cartId },
    include: { items: { include: { product: true } }, coupons: true },
  });

  if (!cart || cart.items.length === 0) throw AppError.validation("Cart is empty");

  const shippingCost = data.shippingMethod === "express" ? 15 : data.shippingMethod === "overnight" ? 50 : 0;
  const discountAmount = cart.coupons.length > 0 ? cart.coupons[0].discountAmount : 0;
  const totals = await calculateTotals(
    cart.items.map((item) => ({ price: item.product.price, quantity: item.quantity })),
    shippingCost,
    discountAmount
  );

  const order = await prisma.order.create({
    data: {
      userId: data.userId,
      email: data.email,
      items: { create: cart.items.map((item) => ({ productId: item.productId, quantity: item.quantity, price: item.product.price })) },
      shippingAddress: data.shippingAddress,
      billingAddress: data.billingAddress || data.shippingAddress,
      subtotal: totals.subtotal,
      tax: totals.tax,
      shippingCost: totals.shipping,
      discountAmount: totals.discount,
      total: totals.total,
      status: "PENDING_PAYMENT",
    },
  });

  // Clear cart after order creation
  await prisma.cartItem.deleteMany({ where: { cartId: data.cartId } });
  await prisma.cartCoupon.deleteMany({ where: { cartId: data.cartId } });

  return order;
}

export async function getOrderStatus(orderId: string) {
  return prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
}
