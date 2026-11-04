import { describe, expect, it } from "vitest";
import { normalizeFotoKeuze, normalizeFotoKeuzes } from "@/lib/ontwerp/fotos";
import { MARKETING_PHOTOS, PHOTO_KEYS, isPhotoKey } from "@/lib/marketing/photo-specs";

describe("foto's van de site (Site-ontwerper)", () => {
  it("de vaste plekken zijn dezelfde als vóór de ontwerper", () => {
    expect(PHOTO_KEYS).toEqual(["hero", "freelancer", "employer", "employerHero", "team"]);
    expect(MARKETING_PHOTOS.hero.file).toBe("hero-freelancer.jpg");
    expect(isPhotoKey("hero")).toBe(true);
    expect(isPhotoKey("onbekend")).toBe(false);
  });

  it("alleen geldige media-id's en bekende plekken blijven over", () => {
    const k = normalizeFotoKeuzes({
      hero: { media: "mabc123def456", alt: "  Een   kok  " },
      team: { media: "../../etc/passwd" },
      employer: { media: "javascript:alert(1)" },
      onbekend: { media: "mabc123def456" },
    });
    expect(k).toEqual({ hero: { media: "mabc123def456", alt: "Een kok" } });
    expect(normalizeFotoKeuze(null)).toBeNull();
    expect(normalizeFotoKeuze({ media: "mabc123def456", alt: "x".repeat(500) })?.alt.length).toBe(200);
    expect(normalizeFotoKeuzes("onzin")).toEqual({});
  });
});
