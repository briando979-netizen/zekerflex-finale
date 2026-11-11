import { describe, expect, it } from "vitest";
import { STUDIO_BOUWER, bouwerDoorstuurPad } from "@/lib/sites/bouwer-doorsturen";
import { TERUG_PADEN, terugPad } from "@/lib/domeinen/bestelling";

describe("één site-bouwer: de oude pagina stuurt door naar de studio", () => {
  it("zonder zoekopdracht gaat het naar de bouwer van de studio", () => {
    expect(bouwerDoorstuurPad(undefined)).toBe(STUDIO_BOUWER);
    expect(bouwerDoorstuurPad({})).toBe("/studio/website/bouwer");
  });

  it("neemt een gekozen ontwerp en de uitkomst van een domeinbestelling mee", () => {
    expect(bouwerDoorstuurPad({ ontwerp: "bakkerij-warm" })).toBe("/studio/website/bouwer?ontwerp=bakkerij-warm");
    const pad = bouwerDoorstuurPad({ bestelling: "gelukt", domein: "café.nl" });
    expect(pad.startsWith("/studio/website/bouwer?")).toBe(true);
    expect(new URL(`https://x.nl${pad}`).searchParams.get("bestelling")).toBe("gelukt");
    expect(new URL(`https://x.nl${pad}`).searchParams.get("domein")).toBe("café.nl");
  });

  it("neemt van een herhaalde naam de eerste en laat lege waarden weg; het adres blijft altijd binnen de studio", () => {
    expect(bouwerDoorstuurPad({ ontwerp: ["a", "b"], leeg: "", niets: undefined })).toBe("/studio/website/bouwer?ontwerp=a");
    expect(bouwerDoorstuurPad({ x: "https://evil.example" }).startsWith("/studio/website/bouwer")).toBe(true);
  });
});

describe("terug naar de studio na een domeinbestelling", () => {
  it("de nieuwe adressen zijn toegestaan, het oude blijft werken voor betalingen die nog onderweg zijn", () => {
    for (const pad of ["/studio/website/bouwer", "/studio/webshop/paginas", "/werkgever/website/bouwer"]) {
      expect(TERUG_PADEN as readonly string[]).toContain(pad);
      expect(terugPad(pad)).toBe(pad);
    }
  });
});
