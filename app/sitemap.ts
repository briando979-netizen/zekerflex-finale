import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";
import { GUIDES, POSTS } from "@/lib/kennis/content";
import { WHITEPAPERS } from "@/lib/kennis/whitepapers";

type Freq = "never" | "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";

export default function sitemap(): MetadataRoute.Sitemap {
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
    entry("/prijzen", 0.8, "monthly"),
    entry("/app", 0.6, "monthly"),
    entry("/demo", 0.6, "monthly"),
    entry("/over-ons", 0.6, "monthly"),

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
    entry("/verwerkersovereenkomst", 0.3, "yearly"),
  ];
}
