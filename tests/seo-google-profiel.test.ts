import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GOOGLE_PROFIEL, organizationJsonLd } from "@/lib/seo";

// Het Google Bedrijfsprofiel (4 nov 2026): Google herkent de site en het profiel als één bedrijf via `sameAs`.

describe("Google Bedrijfsprofiel", () => {
  it("staat in de bedrijfsgegevens voor zoekmachines, naast de sociale profielen", () => {
    const org = organizationJsonLd() as { sameAs: string[] };
    expect(org.sameAs).toContain(GOOGLE_PROFIEL.kaart);
    expect(org.sameAs).toContain("https://www.instagram.com/zekerflex");
  });

  it("de bedrijfsgegevens op elke pagina: naam, adres van de site, logo, de socials zonder LinkedIn en info@ als contact (22 nov 2026)", () => {
    const org = organizationJsonLd() as { name: string; url: string; logo: string; sameAs: string[]; contactPoint: { email: string }[] };
    expect(org.name).toBe("ZekerFlex");
    expect(org.url).toMatch(/^https?:\/\//);
    expect(org.logo).toMatch(/\/icon\.svg$/);
    expect(org.sameAs.some((u) => /linkedin/i.test(u))).toBe(false);
    expect(org.sameAs).toContain("https://www.facebook.com/zekerflex");
    expect(org.contactPoint.map((c) => c.email)).toContain("info@zekerflex.com");
    // het staat in de root-layout, dus op elke pagina
    expect(readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8")).toContain("ldJson([organizationJsonLd(), websiteJsonLd()])");
  });

  it("gebruikt het plaats-id van het profiel voor de kaart en voor een review", () => {
    expect(GOOGLE_PROFIEL.kaart).toMatch(/query_place_id=ChIJocGlj_NR36cRC0v8DBFVqgs$/);
    expect(GOOGLE_PROFIEL.review).toBe("https://search.google.com/local/writereview?placeid=ChIJocGlj_NR36cRC0v8DBFVqgs");
  });
});
