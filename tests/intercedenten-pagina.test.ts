import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AANBOD } from "@/lib/marketing/aanbod";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { paginaFoto } from "@/lib/marketing/fotos";

// /intercedenten (16 nov): de pagina over het werk van een intercedent. Alles waar hij naar verwijst moet bestaan, en er staan
// geen cijfers over klanten of tijdwinst op.

const bron = readFileSync(path.join(process.cwd(), "app/(marketing)/intercedenten/page.tsx"), "utf8");

describe("de pagina voor intercedenten", () => {
  it("staat in de sitemap en in de rondgang, en heeft een foto", () => {
    expect(readFileSync(path.join(process.cwd(), "app/sitemap.ts"), "utf8")).toContain('"/intercedenten"');
    expect(APP_PAGES.map((p) => p.route)).toContain("/intercedenten");
    expect(paginaFoto("intercedenten")).toBeDefined();
  });

  it("elke verwijzing naar een aanbodpagina of vaste pagina bestaat", () => {
    const hrefs = [...bron.matchAll(/href: "(\/[a-z0-9/-]+)"/g)].map((m) => m[1] as string);
    expect(hrefs.length).toBeGreaterThanOrEqual(6);
    for (const h of hrefs) {
      const slug = h.startsWith("/aanbod/") ? h.slice("/aanbod/".length) : null;
      if (slug) expect(AANBOD.some((a) => a.slug === slug), h).toBe(true);
      else expect(existsSync(path.join(process.cwd(), "app/(marketing)" + h, "page.tsx")), h).toBe(true);
    }
  });

  it("belooft geen tijdwinst en noemt geen aantal klanten, en zegt wat een mens blijft doen", () => {
    expect(bron).not.toMatch(/\d+\s*%/);
    expect(bron).not.toMatch(/\d+\s*(uur|uren)\s*(per|minder|bespaar)/i);
    expect(bron).not.toMatch(/\d+\s*(klanten|bureaus|intercedenten)/i);
    expect(bron).toContain("Wat een mens blijft doen");
  });
});
