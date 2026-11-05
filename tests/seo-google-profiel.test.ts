import { describe, expect, it } from "vitest";
import { GOOGLE_PROFIEL, organizationJsonLd } from "@/lib/seo";

// Het Google Bedrijfsprofiel (4 nov 2026): Google herkent de site en het profiel als één bedrijf via `sameAs`.

describe("Google Bedrijfsprofiel", () => {
  it("staat in de bedrijfsgegevens voor zoekmachines, naast de sociale profielen", () => {
    const org = organizationJsonLd() as { sameAs: string[] };
    expect(org.sameAs).toContain(GOOGLE_PROFIEL.kaart);
    expect(org.sameAs).toContain("https://www.instagram.com/zekerflex");
  });

  it("gebruikt het plaats-id van het profiel voor de kaart en voor een review", () => {
    expect(GOOGLE_PROFIEL.kaart).toMatch(/query_place_id=ChIJocGlj_NR36cRC0v8DBFVqgs$/);
    expect(GOOGLE_PROFIEL.review).toBe("https://search.google.com/local/writereview?placeid=ChIJocGlj_NR36cRC0v8DBFVqgs");
  });
});
