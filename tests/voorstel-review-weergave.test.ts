import { describe, expect, it } from "vitest";
import { gemiddelde, publiekeNaam, sterren } from "@/lib/voorstel/review-weergave";

describe("beoordelingen tonen", () => {
  it("toont alleen voornaam en eerste letter van de achternaam", () => {
    expect(publiekeNaam("Klaas de Vries")).toBe("Klaas V.");
    expect(publiekeNaam("  Anita  ")).toBe("Anita");
    expect(publiekeNaam("")).toBe("Gast");
  });

  it("rekent het gemiddelde en tekent sterren", () => {
    expect(gemiddelde([{ score: 5 }, { score: 4 }, { score: 4 }])).toBe(4.3);
    expect(gemiddelde([])).toBeNull();
    expect(sterren(4)).toBe("★★★★☆");
    expect(sterren(9)).toBe("★★★★★");
  });
});
