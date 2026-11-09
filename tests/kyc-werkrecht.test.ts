import { describe, expect, it } from "vitest";
import { landcode, leeftijdOp, leeftijdsgroep, werkrechtVan } from "@/lib/kyc/werkrecht";

describe("recht om te werken (Wet arbeid vreemdelingen)", () => {
  it("EU, EER en Zwitserland: vrij", () => {
    for (const c of ["NLD", "POL", "ROU", "BEL", "NOR", "ISL", "LIE", "CHE", "D<<", "D"]) expect(werkrechtVan(c)).toBe("vrij");
  });
  it("daarbuiten (ook het VK na de Brexit, Oekraïne, staatloos): een document nodig", () => {
    for (const c of ["GBR", "UKR", "TUR", "MAR", "USA", "XXA"]) expect(werkrechtVan(c)).toBe("controle");
  });
  it("onbekend: geen uitspraak", () => {
    expect(werkrechtVan("")).toBeNull();
    expect(werkrechtVan(null)).toBeNull();
    expect(landcode("D<<")).toBe("DEU");
  });
});

describe("leeftijd", () => {
  it("telt pas op de verjaardag een jaar erbij", () => {
    expect(leeftijdOp("2008-11-10", "2026-11-09")).toBe(17);
    expect(leeftijdOp("2008-11-09", "2026-11-09")).toBe(18);
  });
  it("deelt in: volwassen, minderjarig, te jong", () => {
    expect(leeftijdsgroep("2003-06-16", "2026-11-09")).toBe("volwassen");
    expect(leeftijdsgroep("2009-01-01", "2026-11-09")).toBe("minderjarig");
    expect(leeftijdsgroep("2011-01-01", "2026-11-09")).toBe("te-jong");
    expect(leeftijdsgroep(null, "2026-11-09")).toBeNull();
    expect(leeftijdsgroep("onzin", "2026-11-09")).toBeNull();
  });
});
