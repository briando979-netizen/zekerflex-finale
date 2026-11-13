import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bewaarKnopTekst, bewaardMelding, nuLiveTekst, serverKeuze } from "@/lib/shop/media-keuze";

const media = [{ id: "a1", naam: "Winterfoto" }];

describe("Beheer Webshop-media: duidelijk wat waar live staat", () => {
  it("toont wat nu live staat, uit de serverstand", () => {
    expect(nuLiveTekst(null, media)).toBe("Nu live: Geen");
    expect(nuLiveTekst({ media: "a1" }, media)).toBe("Nu live: Winterfoto");
    expect(nuLiveTekst({ media: "weg" }, media)).toMatch(/niet meer in de bibliotheek/);
  });

  it("de knoppen en meldingen noemen steeds één pagina", () => {
    expect(bewaarKnopTekst("shop")).toBe("Bewaren voor Webshop");
    expect(bewaarKnopTekst("home")).toBe("Bewaren voor Homepage");
    expect(bewaardMelding("shop", { media: "a1" })).toContain("alleen op de Webshop");
    expect(bewaardMelding("home", { media: "a1" })).toContain("alleen op de Homepage");
    expect(bewaardMelding("home", null)).toContain("alleen van de Homepage");
  });

  it("neemt de teruggegeven serverversie over, anders de verstuurde keuze", () => {
    expect(serverKeuze({ achtergrond: { shop: { media: "a1" }, home: null } }, "shop", { media: "x" })).toEqual({ media: "a1" });
    expect(serverKeuze({ achtergrond: { shop: { media: "a1" }, home: null } }, "home", { media: "x" })).toBeNull();
    expect(serverKeuze(null, "shop", { media: "x" })).toEqual({ media: "x" });
  });

  it("het scherm volgt de serverstand na het laden en meldt zonder window.alert", () => {
    const bron = readFileSync(new URL("../components/admin/ShopMedia.tsx", import.meta.url), "utf8");
    expect(bron).toMatch(/useEffect\(\(\) => \{\s*setGekozen\(serverMedia\);/);
    expect(bron).toContain("[serverMedia, serverPoster]");
    expect(bron).toContain("nuLiveTekst(keuze, media)");
    expect(bron).toContain("serverKeuze(d, pagina, body.keuze)");
    expect(bron).not.toMatch(/window\.alert|\balert\(/);
  });
});