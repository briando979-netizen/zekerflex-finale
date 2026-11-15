import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { seoSjabloonTitel, SJABLOON_MERK, TITEL_MAX } from "@/lib/seo-tekst";
import { GUIDES, POSTS } from "@/lib/kennis/content";

// De laatste punten van de paginacheck (15 nov 2026): titels voor het sjabloon "%s · ZekerFlex", deelplaatjes die door
// een eigen openGraph verdwenen, en de juridische pagina's met elk een eigen beschrijving.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("titels voor het sjabloon", () => {
  it("past hij met het merk erachter, dan blijft hij heel; anders het deel vóór de dubbele punt of het streepje", () => {
    expect(seoSjabloonTitel("Kennisbank")).toBe("Kennisbank");
    expect(seoSjabloonTitel("Kilometers aftrekken als zzp'er: zo houd je je ritten bij")).toBe("Kilometers aftrekken als zzp'er");
    expect(seoSjabloonTitel("Handhaving Wet DBA in 2026 — wat verandert er echt voor jou als zzp'er?")).toBe("Handhaving Wet DBA in 2026");
    const lang = seoSjabloonTitel("Een heel lange titel zonder scheiding die maar doorgaat en doorgaat tot ver voorbij de grens");
    expect((lang + SJABLOON_MERK).length).toBeLessThanOrEqual(TITEL_MAX);
    expect(lang.endsWith("…")).toBe(true);
  });

  it("alle gidsen en blogs passen nu, met het merk erachter", () => {
    for (const x of [...GUIDES, ...POSTS]) expect((seoSjabloonTitel(x.title) + SJABLOON_MERK).length, x.slug).toBeLessThanOrEqual(TITEL_MAX);
  });
});

describe("deelplaatjes", () => {
  it("een blog houdt het plaatje van canonical() naast zijn eigen openGraph", () => {
    const b = lees("app/(marketing)/kennis/blog/[slug]/page.tsx");
    expect(b).toContain("openGraph: { ...c.openGraph, type: \"article\"");
  });

  it("/uitzendbureau gebruikt canonical(); een pagina met fileImage heeft ook echt een eigen plaatje", () => {
    expect(lees("app/(marketing)/uitzendbureau/page.tsx")).toContain('...canonical("/uitzendbureau")');
    const map = "app/(marketing)/rekentools/btw-nummer-check";
    if (lees(`${map}/page.tsx`).includes("fileImage: true")) expect(existsSync(path.join(process.cwd(), map, "opengraph-image.tsx"))).toBe(true);
  });
});

describe("juridische pagina's", () => {
  const paden = ["cookiebeleid", "copyright", "dsa", "privacy", "toegankelijkheid", "verwerkersovereenkomst", "voorwaarden", "voorwaarden/snelle-uitbetaling"];
  it("elk een eigen beschrijving van Google-lengte", () => {
    const gezien = new Set<string>();
    for (const p of paden) {
      const m = /description: "([^"]+)"/.exec(lees(`app/(marketing)/${p}/page.tsx`));
      expect(m, p).not.toBeNull();
      const tekst = m?.[1] ?? "";
      expect(tekst.length, p).toBeGreaterThanOrEqual(70);
      expect(tekst.length, p).toBeLessThanOrEqual(155);
      expect(gezien.has(tekst), p).toBe(false);
      gezien.add(tekst);
    }
  });
});
