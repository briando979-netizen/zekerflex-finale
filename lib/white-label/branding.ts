import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const brandingSchema = z.object({
  tenantId: z.string(),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  secondaryColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  accentColor: z.string().regex(/^#[0-9A-F]{6}$/i),
  fontFamily: z.string().optional(),
  customCSS: z.string().optional(),
  emailHeaderColor: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  emailFromName: z.string().optional(),
  emailFromEmail: z.string().email().optional(),
  helpDocumentationUrl: z.string().url().optional(),
  privacyPolicyUrl: z.string().url().optional(),
  termsOfServiceUrl: z.string().url().optional(),
});

export async function getBranding(tenantId: string) {
  const branding = await prisma.tenantBranding.findUnique({
    where: { tenantId },
  });

  if (!branding) {
    return getDefaultBranding();
  }

  return branding;
}

export async function updateBranding(
  tenantId: string,
  data: Partial<z.infer<typeof brandingSchema>>
) {
  const validated = brandingSchema.partial().parse(data);

  return await prisma.tenantBranding.upsert({
    where: { tenantId },
    update: validated,
    create: {
      tenantId,
      primaryColor: "#3B82F6",
      secondaryColor: "#1E40AF",
      accentColor: "#10B981",
      ...validated,
    },
  });
}

export async function uploadLogo(tenantId: string, logoUrl: string) {
  return await updateBranding(tenantId, { logoUrl });
}

export async function uploadFavicon(tenantId: string, faviconUrl: string) {
  return await updateBranding(tenantId, { faviconUrl });
}

export function getDefaultBranding() {
  return {
    primaryColor: "#3B82F6",
    secondaryColor: "#1E40AF",
    accentColor: "#10B981",
    fontFamily: "Inter, system-ui, sans-serif",
    emailHeaderColor: "#3B82F6",
  };
}

export async function getCSSVariables(tenantId: string) {
  const branding = await getBranding(tenantId);

  const css = `
    :root {
      --primary: ${branding.primaryColor};
      --secondary: ${branding.secondaryColor};
      --accent: ${branding.accentColor};
      --font-family: ${branding.fontFamily || "Inter, system-ui, sans-serif"};
    }

    ${branding.customCSS || ""}
  `;

  return css;
}
