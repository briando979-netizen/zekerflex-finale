// Multi-vendor marketplace features

export interface Vendor {
  id: string;
  name: string;
  email: string;
  description?: string;
  logo?: string;
  website?: string;
  verified: boolean;
  rating: number; // 1-5
  totalSales: number;
  commissionRate: number; // percentage
  bankAccount?: {
    accountHolder: string;
    iban: string;
  };
  status: "active" | "pending" | "suspended";
  createdAt: Date;
}

export interface VendorProduct {
  productId: string;
  vendorId: string;
  vendorSKU?: string;
  costPrice: number; // cents
  sellPrice: number; // cents
  stock: number;
  status: "active" | "inactive" | "delisted";
}

export interface VendorPayout {
  id: string;
  vendorId: string;
  period: string; // "2024-11"
  salesAmount: number; // cents
  commissionAmount: number; // cents (what we take)
  payoutAmount: number; // cents (what vendor gets)
  status: "pending" | "processed" | "paid";
  paidDate?: Date;
}

export async function registerVendor(data: Partial<Vendor>): Promise<Vendor> {
  return {
    id: `vendor_${Date.now()}`,
    name: data.name || "",
    email: data.email || "",
    verified: false,
    rating: 5,
    totalSales: 0,
    commissionRate: data.commissionRate || 15,
    status: "pending",
    createdAt: new Date(),
    ...data,
  };
}

export async function verifyVendor(vendorId: string): Promise<Vendor> {
  // TODO: Verify bank account, company info
  return { id: vendorId, name: "", email: "", verified: true, rating: 5, totalSales: 0, commissionRate: 15, status: "active", createdAt: new Date() };
}

export async function getVendorProducts(vendorId: string): Promise<VendorProduct[]> {
  // TODO: Fetch from database
  return [];
}

export async function calculateVendorPayout(vendorId: string, period: string): Promise<VendorPayout> {
  // TODO: Calculate from orders in period
  return { id: `payout_${Date.now()}`, vendorId, period, salesAmount: 0, commissionAmount: 0, payoutAmount: 0, status: "pending" };
}

export async function listVendors(verified?: boolean): Promise<Vendor[]> {
  // TODO: Fetch from database
  return [];
}
