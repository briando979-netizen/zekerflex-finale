import { prisma } from "@/lib/prisma";

export interface WebsiteConfig {
  naam: string;
  beschrijving: string;
  logo: string;
  kleuren: Record<string, string>;
  fonts: string[];
  layout: "modern" | "classic" | "minimalist" | "corporate";
  headerType: "full" | "compact" | "sticky";
  footerType: "standard" | "extended" | "minimal";
}

export interface WebsitePage {
  slug: string;
  titel: string;
  content: string;
  template: "home" | "about" | "services" | "portfolio" | "contact" | "blog" | "pricing" | "custom";
  order: number;
  visible: boolean;
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
}

export async function createWebsite(tenantId: string, config: WebsiteConfig) {
  const website = await prisma.website.create({
    data: {
      tenantId,
      naam: config.naam,
      beschrijving: config.beschrijving,
      logo: config.logo,
      config: JSON.stringify(config),
      status: "DRAFT",
      customDomain: null,
      subdomain: generateSubdomain(config.naam),
    },
  });

  // Create default pages
  await createDefaultPages(website.id);

  return website;
}

export async function createDefaultPages(websiteId: string) {
  const defaultPages: WebsitePage[] = [
    {
      slug: "",
      titel: "Home",
      content: "<h1>Welkom</h1><p>Beschrijving van uw bedrijf</p>",
      template: "home",
      order: 1,
      visible: true,
      seo: { title: "Home", description: "", keywords: [] },
    },
    {
      slug: "over-ons",
      titel: "Over Ons",
      content: "<h1>Over Ons</h1><p>Meer informatie over uw bedrijf</p>",
      template: "about",
      order: 2,
      visible: true,
      seo: { title: "Over Ons", description: "", keywords: [] },
    },
    {
      slug: "diensten",
      titel: "Diensten",
      content: "<h1>Onze Diensten</h1>",
      template: "services",
      order: 3,
      visible: true,
      seo: { title: "Diensten", description: "", keywords: [] },
    },
    {
      slug: "contact",
      titel: "Contact",
      content: "<h1>Contact</h1>",
      template: "contact",
      order: 4,
      visible: true,
      seo: { title: "Contact", description: "", keywords: [] },
    },
  ];

  for (const page of defaultPages) {
    await prisma.websitePage.create({
      data: {
        websiteId,
        ...page,
        seoJson: JSON.stringify(page.seo),
      },
    });
  }
}

function generateSubdomain(naam: string): string {
  return naam
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function updateWebsiteConfig(websiteId: string, config: Partial<WebsiteConfig>) {
  const website = await prisma.website.findUnique({
    where: { id: websiteId },
  });

  if (!website) {
    throw new Error("Website not found");
  }

  const currentConfig = JSON.parse(website.config || "{}");
  const updated = { ...currentConfig, ...config };

  return await prisma.website.update({
    where: { id: websiteId },
    data: { config: JSON.stringify(updated) },
  });
}

export async function publishWebsite(websiteId: string) {
  return await prisma.website.update({
    where: { id: websiteId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
}
