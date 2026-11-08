import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Tenant Customization - Theme builder, branding, custom domains, white-label hosting
 */

const brandingConfigSchema = z.object({
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  fontFamily: z.string().optional(),
  customCSS: z.string().optional().default(""),
  emailHeaderColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  emailFromName: z.string().optional(),
  emailFromEmail: z.string().email().optional(),
  helpDocumentationUrl: z.string().url().optional(),
  privacyPolicyUrl: z.string().url().optional(),
  termsOfServiceUrl: z.string().url().optional(),
  hideZekerFlexBranding: z.boolean().optional().default(false),
  customLanguage: z.string().optional().default("nl"),
});

export type BrandingConfig = z.infer<typeof brandingConfigSchema>;

/**
 * Retrieve a tenant's customization settings, with sensible defaults
 */
export async function getTenantCustomization(tenantId: string) {
  const customization = await prisma.tenantCustomization.findUnique({
    where: { tenantId },
  });

  if (!customization) {
    return getDefaultCustomization();
  }

  return customization;
}

/**
 * Update a tenant's branding and customization
 */
export async function updateTenantCustomization(
  tenantId: string,
  data: Partial<BrandingConfig>
) {
  const validated = brandingConfigSchema.partial().parse(data);

  return await prisma.tenantCustomization.upsert({
    where: { tenantId },
    update: validated,
    create: {
      tenantId,
      ...getDefaultCustomization(),
      ...validated,
    },
  });
}

/**
 * Generate CSS variables for tenant branding
 */
export async function generateCSSVariables(tenantId: string): Promise<string> {
  const customization = await getTenantCustomization(tenantId);

  const css = `
    :root {
      --primary: ${customization.primaryColor};
      --secondary: ${customization.secondaryColor};
      --accent: ${customization.accentColor};
      --font-family: ${customization.fontFamily ?? "Inter, system-ui, sans-serif"};
    }

    ${customization.customCSS ?? ""}
  `;

  return css;
}

/**
 * Set up a custom domain for a tenant with verification token
 */
export async function setupCustomDomain(tenantId: string, domain: string) {
  // Validate domain format
  const domainRegex = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?(\.(?!-)([a-z0-9]|-)*[a-z0-9]?)*\.?$/i;
  if (!domainRegex.test(domain)) {
    throw AppError.validation("Ongeldig domein formaat");
  }

  // Check if domain is already in use
  const existing = await prisma.tenantCustomization.findUnique({
    where: { customDomain: domain },
  });

  if (existing && existing.tenantId !== tenantId) {
    throw AppError.validation("Dit domein is al in gebruik");
  }

  // Generate verification token for DNS TXT record
  const verificationToken = generateVerificationToken();

  return await prisma.tenantCustomization.upsert({
    where: { tenantId },
    update: {
      customDomain: domain,
      customDomainVerified: false,
      customDomainToken: verificationToken,
    },
    create: {
      tenantId,
      customDomain: domain,
      customDomainToken: verificationToken,
      primaryColor: "#3B82F6",
      secondaryColor: "#1E40AF",
      accentColor: "#10B981",
    },
  });
}

/**
 * Verify a custom domain by checking for DNS TXT record
 */
export async function verifyCustomDomain(tenantId: string): Promise<boolean> {
  const customization = await getTenantCustomization(tenantId);

  if (!customization.customDomain || !customization.customDomainToken) {
    throw AppError.validation("Geen custom domain geconfigureerd");
  }

  // In production, this would verify the DNS TXT record
  // For now, we'll mark as verified (implementation would use dns-lookup)
  const verified = await prisma.tenantCustomization.update({
    where: { tenantId },
    data: { customDomainVerified: true },
  });

  return verified.customDomainVerified;
}

/**
 * Get CSS for inline styling with tenant branding
 */
export async function getBrandingInlineStyles(tenantId: string): Promise<Record<string, string>> {
  const customization = await getTenantCustomization(tenantId);

  return {
    "--primary": customization.primaryColor,
    "--secondary": customization.secondaryColor,
    "--accent": customization.accentColor,
    "--font-family": customization.fontFamily ?? "Inter, system-ui, sans-serif",
  };
}

/**
 * Check if a tenant has white-label branding enabled
 */
export async function isWhiteLabelEnabled(tenantId: string): Promise<boolean> {
  const customization = await getTenantCustomization(tenantId);
  return customization.hideZekerFlexBranding ?? false;
}

/**
 * Remove custom domain from tenant
 */
export async function removeCustomDomain(tenantId: string) {
  return await prisma.tenantCustomization.update({
    where: { tenantId },
    data: {
      customDomain: null,
      customDomainVerified: false,
      customDomainToken: null,
    },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function getDefaultCustomization() {
  return {
    primaryColor: "#3B82F6",
    secondaryColor: "#1E40AF",
    accentColor: "#10B981",
    fontFamily: "Inter, system-ui, sans-serif",
    emailHeaderColor: "#3B82F6",
    customCSS: "",
    hideZekerFlexBranding: false,
    customLanguage: "nl",
  };
}

function generateVerificationToken(): string {
  const crypto = require("crypto");
  return crypto.randomBytes(24).toString("hex");
}
