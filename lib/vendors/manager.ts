import { prisma } from "@/lib/prisma";
import { Vendor, VendorSchema } from "./types";

export async function createVendor(data: Partial<Vendor>) {
  const validated = VendorSchema.partial().parse(data);
  return prisma.vendor.create({
    data: {
      ...validated,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

export async function getVendor(id: string) {
  return prisma.vendor.findUnique({ where: { id } });
}

export async function listVendors(status?: string) {
  return prisma.vendor.findMany({
    where: status ? { status } : undefined,
    orderBy: { performanceScore: "desc" },
  });
}

export async function updateVendor(id: string, data: Partial<Vendor>) {
  const validated = VendorSchema.partial().parse(data);
  return prisma.vendor.update({
    where: { id },
    data: { ...validated, updatedAt: new Date() },
  });
}

export async function updatePerformanceScore(vendorId: string, score: number) {
  return prisma.vendor.update({
    where: { id: vendorId },
    data: { performanceScore: Math.min(100, Math.max(0, score)) },
  });
}

export async function rateVendor(vendorId: string, rating: number) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new Error("Vendor not found");

  const newRating = (vendor.rating * 0.7 + rating * 0.3);
  return updateVendor(vendorId, { rating: newRating });
}
