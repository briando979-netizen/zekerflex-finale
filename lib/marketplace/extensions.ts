import { z } from "zod";

export const extensionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().max(1000),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  author: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
  }),
  category: z.enum([
    "analytics",
    "integrations",
    "automation",
    "security",
    "productivity",
    "finance",
    "communication",
  ]),
  price: z.number().min(0),
  billing: z.enum(["one_time", "monthly", "yearly"]).optional(),
  icon: z.string().url(),
  images: z.array(z.string().url()),
  documentation: z.string().url().optional(),
  repositoryUrl: z.string().url().optional(),
  tags: z.array(z.string()).max(10),
  rating: z.number().min(0).max(5),
  reviews: z.number().min(0),
  installs: z.number().min(0),
  createdAt: z.date(),
  updatedAt: z.date(),
  published: z.boolean(),
  verified: z.boolean(),
});

export type Extension = z.infer<typeof extensionSchema>;

export const installationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  extensionId: z.string().uuid(),
  teamId: z.string().uuid(),
  apiKey: z.string(),
  config: z.record(z.unknown()).optional(),
  active: z.boolean(),
  installedAt: z.date(),
  updatedAt: z.date(),
});

export type Installation = z.infer<typeof installationSchema>;

export const reviewSchema = z.object({
  id: z.string().uuid(),
  extensionId: z.string().uuid(),
  userId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  title: z.string(),
  comment: z.string(),
  helpful: z.number().default(0),
  createdAt: z.date(),
});

export type Review = z.infer<typeof reviewSchema>;

export const developmentGrant = {
  revenue_share: 0.7,
  support_included: true,
  featured_promotion: true,
  analytics_api: true,
};

export async function publishExtension(extension: Partial<Extension>) {
  // In production: validate, scan for security, create store listing
  return {
    ...extension,
    id: crypto.randomUUID(),
    published: false,
    verified: false,
    rating: 0,
    reviews: 0,
    installs: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function installExtension(userId: string, extensionId: string, teamId: string) {
  const apiKey = `ext_${crypto.randomBytes(32).toString("hex")}`;
  return {
    id: crypto.randomUUID(),
    userId,
    extensionId,
    teamId,
    apiKey,
    active: true,
    installedAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function uninstallExtension(installationId: string) {
  // In production: clean up API keys, revoke access
  return { success: true };
}

export async function submitReview(
  extensionId: string,
  userId: string,
  rating: number,
  title: string,
  comment: string,
) {
  return {
    id: crypto.randomUUID(),
    extensionId,
    userId,
    rating,
    title,
    comment,
    helpful: 0,
    createdAt: new Date(),
  };
}

export async function calculateRevenue(extensionId: string, period: "month" | "year") {
  // In production: aggregate payments, apply revenue share
  return {
    total: 0,
    yourShare: 0,
    platformFee: 0,
    period,
  };
}
