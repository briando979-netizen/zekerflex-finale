// White-label and custom branding

export interface BrandConfig {
  id: string;
  name: string;
  domain: string;
  logo: string;
  favicon: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  fonts: {
    primary: string;
    secondary: string;
  };
  customCSS?: string;
  customJS?: string;
  emails: {
    fromName: string;
    fromEmail: string;
    logo: string;
  };
  legal: {
    privacyUrl?: string;
    termsUrl?: string;
    companyName: string;
  };
}

export async function createBrandConfig(data: Partial<BrandConfig>): Promise<BrandConfig> {
  return {
    id: `brand_${Date.now()}`,
    name: data.name || "Default Brand",
    domain: data.domain || "shop.example.com",
    logo: data.logo || "/logos/default.png",
    favicon: data.favicon || "/favicon.ico",
    colors: {
      primary: "#004E89",
      secondary: "#F72585",
      accent: "#FF6B35",
      ...data.colors,
    },
    fonts: {
      primary: "Inter, sans-serif",
      secondary: "Courier, monospace",
      ...data.fonts,
    },
    emails: {
      fromName: data.emails?.fromName || "Shop",
      fromEmail: data.emails?.fromEmail || "noreply@shop.com",
      logo: data.emails?.logo || "/logos/email.png",
    },
    legal: {
      companyName: data.legal?.companyName || "Company Name",
      ...data.legal,
    },
    ...data,
  };
}

export function getBrandCSS(brand: BrandConfig): string {
  return `
    :root {
      --color-primary: ${brand.colors.primary};
      --color-secondary: ${brand.colors.secondary};
      --color-accent: ${brand.colors.accent};
      --font-primary: ${brand.fonts.primary};
      --font-secondary: ${brand.fonts.secondary};
    }
    ${brand.customCSS || ""}
  `;
}
