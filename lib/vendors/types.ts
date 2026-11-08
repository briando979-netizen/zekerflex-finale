import { z } from "zod";

export const VendorSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  country: z.string(),
  taxId: z.string(),
  paymentTerms: z.enum(["NET30", "NET60", "NET90", "IMMEDIATE"]),
  rating: z.number().min(0).max(5).default(0),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "ONBOARDING"]).default("ONBOARDING"),
  performanceScore: z.number().min(0).max(100).default(0),
  totalSpend: z.number().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Vendor = z.infer<typeof VendorSchema>;

export const RFQSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  title: z.string(),
  description: z.string(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number(),
    unit: z.string(),
  })),
  deadline: z.date(),
  status: z.enum(["DRAFT", "SENT", "RECEIVED", "EVALUATED", "CLOSED"]).default("DRAFT"),
  quotes: z.array(z.object({
    vendorId: z.string(),
    amount: z.number(),
    deliveryDate: z.date(),
    terms: z.string(),
  })).default([]),
});

export type RFQ = z.infer<typeof RFQSchema>;

export const ContractSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  title: z.string(),
  terms: z.string(),
  startDate: z.date(),
  endDate: z.date(),
  amount: z.number(),
  renewalDate: z.date().optional(),
  complianceItems: z.array(z.string()).default([]),
  status: z.enum(["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED"]).default("DRAFT"),
});

export type Contract = z.infer<typeof ContractSchema>;
