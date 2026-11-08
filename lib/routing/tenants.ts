import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

export const domainSchema = z.object({
  tenantId: z.string(),
  domain: z.string().regex(/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i),
  isVerified: z.boolean().default(false),
  dnsTxtRecord: z.string().optional(),
  sslCertificateUrl: z.string().optional(),
  expiresAt: z.date().optional(),
});

export async function mapCustomDomain(
  tenantId: string,
  domain: string
) {
  const validated = domainSchema.parse({
    tenantId,
    domain,
  });

  const existingDomain = await prisma.tenantDomain.findUnique({
    where: { domain },
  });

  if (existingDomain && existingDomain.tenantId !== tenantId) {
    throw AppError.validation("Domain already mapped to another tenant");
  }

  const dnsRecord = generateDnsTxtRecord(tenantId);

  return await prisma.tenantDomain.upsert({
    where: { domain },
    update: {
      dnsTxtRecord: dnsRecord,
      isVerified: false,
    },
    create: {
      tenantId,
      domain,
      dnsTxtRecord: dnsRecord,
      isVerified: false,
    },
  });
}

export async function verifyDomain(domain: string) {
  const tenantDomain = await prisma.tenantDomain.findUnique({
    where: { domain },
  });

  if (!tenantDomain) {
    throw AppError.notFound("Domain mapping not found");
  }

  // In production, would check DNS records
  const isValid = true; // TODO: implement actual DNS check

  if (isValid) {
    return await prisma.tenantDomain.update({
      where: { domain },
      data: { isVerified: true },
    });
  }

  throw AppError.validation("DNS verification failed");
}

export function generateDnsTxtRecord(tenantId: string): string {
  return `zekerflex-verification=${tenantId}`;
}

export async function getTenantByDomain(domain: string) {
  const tenantDomain = await prisma.tenantDomain.findUnique({
    where: { domain },
    include: { tenant: true },
  });

  if (!tenantDomain || !tenantDomain.isVerified) {
    return null;
  }

  return tenantDomain.tenant;
}

export async function getTenantBySubdomain(subdomain: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { subdomain },
  });

  return tenant;
}

export async function listCustomDomains(tenantId: string) {
  return await prisma.tenantDomain.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export async function removeDomain(domain: string) {
  return await prisma.tenantDomain.delete({
    where: { domain },
  });
}

export async function generateSSLCertificate(domain: string) {
  // In production, would use Let's Encrypt or similar
  return {
    certificateUrl: `https://certs.zekerflex.local/${domain}`,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  };
}
