import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { prisma } from "@/lib/prisma";
import { GUIDES, POSTS } from "@/lib/kennis/content";
import { WHITEPAPERS } from "@/lib/kennis/whitepapers";
import { CITIES } from "@/lib/seo-cities";
import { publicOpenShifts } from "@/lib/public-shifts";

type Freq = "never" | "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entry = (
    path: string,
    priority: number,
    changeFrequency: Freq,
    lastModified: Date | string = now,
  ): MetadataRoute.Sitemap[number] => ({
    url: `${SITE.url}${path}`,
    lastModified: typeof lastModified === "string" ? new Date(lastModified) : lastModified,
    changeFrequency,
    priority,
  });

  return [
    // Pillars
    entry("/", 1, "weekly"),
    entry("/voor-freelancers", 0.9, "monthly"),
    entry("/uitzendbureau", 0.9, "weekly"),
    entry("/voor-bedrijven", 0.9, "monthly"),

    // Open klussen (Google for Jobs) + per-city landing pages
    entry("/klussen", 0.9, "hourly"),
    entry("/open-diensten", 0.8, "hourly"),
    entry("/freelance-werk", 0.9, "daily"),
    entry("/personeel-inhuren", 0.8, "weekly"),
    ...CITIES.map((c) => entry(`/freelance-werk/${c.slug}`, 0.8, "daily")),
    ...CITIES.map((c) => entry(`/personeel-inhuren/${c.slug}`, 0.7, "weekly")),
    entry("/horeca-personeel-inhuren", 0.8, "weekly"),
    ...CITIES.map((c) => entry(`/horeca-personeel-inhuren/${c.slug}`, 0.7, "weekly")),
    ...(await publicOpenShifts({ take: 500 }).catch(() => [])).map((s) => entry(`/klussen/${s.id}`, 0.6, "daily", s.createdAt)),
    entry("/prijzen", 0.8, "monthly"),
    entry("/app", 0.6, "monthly"),
    entry("/demo", 0.6, "monthly"),
    entry("/over-ons", 0.6, "monthly"),
    entry("/contact", 0.5, "yearly"),
    entry("/developers", 0.6, "monthly"),

    // Knowledge hub — the long-tail keyword surface
    entry("/kennis", 0.7, "weekly"),
    entry("/kennis/wet-dba", 0.8, "monthly"),
    entry("/kennis/werkgevers", 0.7, "monthly"),
    entry("/kennis/faq", 0.6, "monthly"),
    entry("/kennis/blog", 0.6, "weekly"),
    entry("/kennis/whitepapers", 0.6, "monthly"),
    entry("/uitleg", 0.5, "monthly"),
    ...GUIDES.map((g) => entry(`/kennis/${g.slug}`, 0.6, "monthly", g.updated)),
    ...POSTS.map((p) => entry(`/kennis/blog/${p.slug}`, 0.5, "yearly", p.date)),
    ...WHITEPAPERS.map((w) => entry(`/kennis/whitepapers/${w.slug}`, 0.5, "monthly", w.updated)),

    // Status + legal
    entry("/status", 0.4, "daily"),
    entry("/privacy", 0.3, "yearly"),
    entry("/voorwaarden", 0.3, "yearly"),
    entry("/cookiebeleid", 0.3, "yearly"),
    entry("/toegankelijkheid", 0.3, "yearly"),
    entry("/verwerkersovereenkomst", 0.3, "yearly"),

    // Shop — the storefront and every active product's own page
    entry("/shop", 0.7, "daily"),
    ...(await prisma.shopProduct.findMany({
      where: { active: true },
      select: { slug: true, updatedAt: true },
    })).map((p) => entry(`/shop/${p.slug}`, 0.6, "weekly", p.updatedAt)),
  ];
}
