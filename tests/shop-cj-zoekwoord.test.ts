import { describe, expect, it } from "vitest";
import { naarEngelsZoekwoord } from "@/lib/shop/cj/zoekwoord";

// Zoeken bij CJ in het Nederlands (18 nov 2026): de eigenaar typt "speelgoed", CJ krijgt "toys".
// Engels blijft Engels; onbekende woorden gaan letterlijk door; stopwoorden vallen weg.

describe("Nederlands zoekwoord → Engels voor CJ", () => {
  it.each([
    ["speelgoed", "toys"],
    ["Speelgoed voor kinderen", "toys for kids"],
    ["oordopjes", "earbuds"],
    ["telefoonhoesje", "phone case"],
    ["tuinslang", "garden hose"],
    ["hondenriem", "dog leash"],
    ["goedkope kerstverlichting", "christmas lights"],
    ["zwarte rugzak", "black backpack"],
    ["gaming stoel", "gaming chair"],
    ["auto's", "cars"],
  ])("%s → %s", (nl, en) => {
    expect(naarEngelsZoekwoord(nl)).toEqual({ q: en, vertaald: true });
  });

  it("laat Engels en onbekende woorden met rust", () => {
    expect(naarEngelsZoekwoord("earbuds")).toEqual({ q: "earbuds", vertaald: false });
    expect(naarEngelsZoekwoord("plush toy")).toEqual({ q: "plush toy", vertaald: false });
    expect(naarEngelsZoekwoord("xyzzy")).toEqual({ q: "xyzzy", vertaald: false });
    expect(naarEngelsZoekwoord("  ")).toEqual({ q: "", vertaald: false });
  });

  it("een zoekopdracht van alleen stopwoorden blijft staan, en 'constructor' is geen woord", () => {
    expect(naarEngelsZoekwoord("de")).toEqual({ q: "de", vertaald: false });
    expect(naarEngelsZoekwoord("constructor")).toEqual({ q: "constructor", vertaald: false });
  });
});
