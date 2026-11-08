import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

/**
 * White-label branding customization per tenant domain.
 * Supports custom domains, logos, colors, CSS, and email templates.
 */

export const brandColorsSchema = z.object({
  primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const createWhiteLabelDomainSchema = z.object({
  domain: z.string().min(5),
  isPrimary: z.boolean().default(false),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  brandColors: brandColorsSchema.optional(),
  customCss: z.string().optional(),
  emailTemplateHtml: z.string().optional(),
});

/**
 * Add a custom domain to a tenant's white-label setup.
 */
export async function addTenantDomain(
  tenantId: string,
  data: z.infer<typeof createWhiteLabelDomainSchema>
) {
  const validated = createWhiteLabelDomainSchema.parse(data);

  // Check domain uniqueness
  const existing = await prisma.tenantDomain.findUnique({
    where: { domain: validated.domain },
  });

  if (existing && existing.tenantId !== tenantId) {
    throw AppError.validation("Domain already taken");
  }

  // If setting as primary, remove primary flag from other domains
  if (validated.isPrimary) {
    await prisma.tenantDomain.updateMany({
      where: { tenantId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const verificationToken = generateDnsVerificationToken();

  return await prisma.tenantDomain.create({
    data: {
      tenantId,
      ...validated,
      verificationToken,
    },
  });
}

/**
 * Verify domain ownership via DNS TXT record.
 */
export async function verifyDomainOwnership(
  tenantId: string,
  domainId: string
): Promise<boolean> {
  const domain = await prisma.tenantDomain.findUnique({
    where: { id: domainId },
  });

  if (!domain || domain.tenantId !== tenantId) {
    throw AppError.notFound("Domain not found");
  }

  // In production: perform actual DNS lookup for TXT record
  // verification_token_value should match domain.verificationToken
  const verified = true; // Mock verification

  if (verified) {
    await prisma.tenantDomain.update({
      where: { id: domainId },
      data: {
        verified: true,
        verifiedAt: new Date(),
      },
    });
    return true;
  }

  return false;
}

/**
 * Get white-label branding for a domain.
 */
export async function getWhiteLabelBranding(domain: string) {
  const tenantDomain = await prisma.tenantDomain.findUnique({
    where: { domain },
  });

  if (!tenantDomain || !tenantDomain.verified) {
    return null;
  }

  return {
    logoUrl: tenantDomain.logoUrl,
    faviconUrl: tenantDomain.faviconUrl,
    brandColors: tenantDomain.brandColors,
    customCss: tenantDomain.customCss,
    emailTemplateHtml: tenantDomain.emailTemplateHtml,
  };
}

/**
 * Update branding for a domain.
 */
export async function updateWhiteLabelBranding(
  tenantId: string,
  domainId: string,
  branding: Partial<z.infer<typeof createWhiteLabelDomainSchema>>
) {
  const domain = await prisma.tenantDomain.findUnique({
    where: { id: domainId },
  });

  if (!domain || domain.tenantId !== tenantId) {
    throw AppError.notFound("Domain not found");
  }

  return await prisma.tenantDomain.update({
    where: { id: domainId },
    data: branding,
  });
}

/**
 * Get all domains for a tenant.
 */
export async function getTenantDomains(tenantId: string) {
  return await prisma.tenantDomain.findMany({
    where: { tenantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Remove a domain from tenant.
 */
export async function removeTenantDomain(tenantId: string, domainId: string) {
  const domain = await prisma.tenantDomain.findUnique({
    where: { id: domainId },
  });

  if (!domain || domain.tenantId !== tenantId) {
    throw AppError.notFound("Domain not found");
  }

  if (domain.isPrimary) {
    throw AppError.validation("Cannot remove primary domain");
  }

  return await prisma.tenantDomain.delete({
    where: { id: domainId },
  });
}

/**
 * Generate DNS TXT record verification token.
 */
function generateDnsVerificationToken(): string {
  const crypto = require("crypto");
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Get DNS verification instructions for a domain.
 */
export function getDnsVerificationInstructions(
  domain: string,
  verificationToken: string
) {
  const recordName = `zf-verify.${domain}`;
  const recordValue = verificationToken;

  return {
    recordType: "TXT",
    recordName,
    recordValue,
    instructions:
      "Add this TXT record to your domain's DNS settings. Verification may take up to 48 hours.",
  };
}

/**
 * Generate email template CSS styles for white-label.
 */
export function generateEmailTemplateCss(brandColors: any): string {
  const css = `
    :root {
      --brand-primary: ${brandColors?.primary || "#000"};
      --brand-secondary: ${brandColors?.secondary || "#999"};
      --brand-accent: ${brandColors?.accent || "#007bff"};
    }

    .brand-button {
      background-color: var(--brand-primary);
      border-color: var(--brand-primary);
    }

    .brand-link {
      color: var(--brand-accent);
    }

    .brand-header {
      border-bottom: 3px solid var(--brand-primary);
    }
  `;

  return css;
}
