import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function getCoupon(code: string) {
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) throw AppError.validation("Invalid or inactive coupon");
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw AppError.validation("Coupon has expired");
  }
  return coupon;
}

export async function validateCoupon(code: string, orderTotal: number) {
  const coupon = await getCoupon(code);

  if (coupon.minOrderAmount && orderTotal < coupon.minOrderAmount) {
    throw AppError.validation(`Minimum order amount of €${coupon.minOrderAmount} required`);
  }

  if (coupon.maxUses && coupon.uses >= coupon.maxUses) {
    throw AppError.validation("Coupon usage limit reached");
  }

  return coupon;
}

export async function calculateDiscount(coupon: any, orderTotal: number) {
  if (coupon.type === "PERCENTAGE") {
    return Math.min((orderTotal * coupon.value) / 100, coupon.maxDiscount || Infinity);
  }
  return coupon.value;
}

export async function createCoupon(data: {
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  maxUses?: number;
  expiresAt?: Date;
}) {
  return prisma.coupon.create({
    data: { ...data, active: true, uses: 0 },
  });
}

export async function getActiveCoupons() {
  return prisma.coupon.findMany({
    where: {
      active: true,
      expiresAt: { gt: new Date() },
    },
  });
}

export async function getVolumeDiscounts() {
  return [
    { minQuantity: 5, discount: 0.05, label: "5+ items: 5% off" },
    { minQuantity: 10, discount: 0.1, label: "10+ items: 10% off" },
    { minQuantity: 20, discount: 0.15, label: "20+ items: 15% off" },
  ];
}

export async function calculateVolumeDiscount(items: Array<{ quantity: number }>) {
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const discounts = await getVolumeDiscounts();
  const applicable = discounts.filter((d) => totalQuantity >= d.minQuantity);
  return applicable.length > 0 ? applicable[applicable.length - 1].discount : 0;
}

export async function getBuyXGetY() {
  return prisma.promotion.findMany({
    where: { type: "BUY_X_GET_Y", active: true },
  });
}

export async function getReferralBonus(referrerId: string) {
  return prisma.referral.findMany({
    where: { referrerId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });
}

export async function trackCouponUsage(couponId: string) {
  return prisma.coupon.update({
    where: { id: couponId },
    data: { uses: { increment: 1 } },
  });
}
