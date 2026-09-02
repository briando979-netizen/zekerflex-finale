import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  type Freq = "never" | "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";
  const entry = (path: string, priority: number, changeFrequency: Freq): MetadataRoute.Sitemap[number] => ({
    url: `${SITE.url}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });

  return [
    entry("/", 1, "weekly"),
    entry("/voor-freelancers", 0.9, "monthly"),
    entry("/uitzendbureau", 0.9, "monthly"),
    entry("/voor-bedrijven", 0.9, "monthly"),
    entry("/prijzen", 0.8, "monthly"),
    entry("/over-ons", 0.6, "monthly"),
    entry("/status", 0.4, "daily"),
    entry("/privacy", 0.3, "yearly"),
    entry("/voorwaarden", 0.3, "yearly"),
    entry("/verwerkersovereenkomst", 0.3, "yearly"),
  ];
}
