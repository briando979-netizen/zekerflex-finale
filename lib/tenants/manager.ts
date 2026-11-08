import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

export const tenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  email: z.string().email(),
  plan: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]),
  status: z.enum(["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"]),
  customDomain: z.string().optional(),
  usageLimit: z.number().positive().optional(),
});

export async function createTenant(data: z.infer<typeof tenantSchema>) {
  const validated = tenantSchema.parse(data);

  const existingSlug = await prisma.tenant.findUnique({
    where: { slug: validated.slug },
  });

  if (existingSlug) {
    throw AppError.validation("Slug already exists");
  }

  return await prisma.tenant.create({
    data: {
      ...validated,
      subdomain: validated.slug,
      createdAt: new Date(),
    },
  });
}

export async function getTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw AppError.notFound("Tenant not found");
  }

  return tenant;
}

export async function getTenantBySlug(slug: string) {
  return await prisma.tenant.findUnique({
    where: { slug },
  });
}

export async function updateTenant(
  tenantId: string,
  data: Partial<z.infer<typeof tenantSchema>>
) {
  return await prisma.tenant.update({
    where: { id: tenantId },
    data,
  });
}

export async function suspendTenant(tenantId: string) {
  return await updateTenant(tenantId, { status: "SUSPENDED" });
}

export async function reactivateTenant(tenantId: string) {
  return await updateTenant(tenantId, { status: "ACTIVE" });
}

export async function listTenants(limit = 50, offset = 0) {
  return await prisma.tenant.findMany({
    take: limit,
    skip: offset,
    orderBy: { createdAt: "desc" },
  });
}

export async function getTenantUsage(tenantId: string) {
  const tenant = await getTenant(tenantId);

  const userCount = await prisma.user.count({
    where: { tenantId },
  });

  const apiCallsMonth = await prisma.auditLog.count({
    where: {
      tenantId,
      createdAt: {
        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    },
  });

  return {
    users: userCount,
    apiCallsMonth,
    limit: tenant.usageLimit,
    percentUsed: tenant.usageLimit ? (userCount / tenant.usageLimit) * 100 : null,
  };
}
