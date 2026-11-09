import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buitenlandPostcode, gebiedVan, isThuisland, postcodeGeldig, thuisbasisReden, THUISLANDEN } from "@/lib/geo/thuisland";
import { controleerThuisbasis, thuisbasisVelden } from "@/lib/onboarding/thuisbasis-schema";
import { ondernemingGeldig, zzpGeschikt } from "@/lib/matching/onderneming";
import { VRIJ_VERKEER } from "@/lib/werkrecht/landen";

describe("thuisland", () => {
  it("heeft Nederland eerst en alleen ISO-codes van twee letters", () => {
    expect(THUISLANDEN[0]).toBe("NL");
    expect(THUISLANDEN.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
    expect(new Set(THUISLANDEN).size).toBe(THUISLANDEN.length);
    expect(isThuisland("BE")).toBe(true);
    expect(isThuisland("XX")).toBe(false);
    expect(isThuisland("nl")).toBe(false);
  });

  it("blijft binnen de EU/EER/CH van het werkrecht, plus het VK", () => {
    const buiten = THUISLANDEN.filter((c) => !VRIJ_VERKEER.has(c) && c !== "GB");
    expect(buiten).toEqual([]);
  });

  it("past de Nederlandse postcoderegel alleen in Nederland toe", () => {
    expect(postcodeGeldig("NL", "1012 AB")).toBe(true);
    expect(postcodeGeldig("NL", " 1012AB ")).toBe(true);
    expect(postcodeGeldig("NL", "2000")).toBe(false);
    expect(postcodeGeldig("BE", "2000")).toBe(true);
    expect(postcodeGeldig("DE", "10115")).toBe(true);
    expect(postcodeGeldig("PL", "00-950")).toBe(true);
    expect(postcodeGeldig("GB", "SW1A 1AA")).toBe(true);
    expect(postcodeGeldig("IE", "D02 X285")).toBe(true);
  });

  it("weigert in het buitenland te korte, te lange en vreemde postcodes", () => {
    expect(postcodeGeldig("BE", "1")).toBe(false);
    expect(postcodeGeldig("BE", "1234567890123")).toBe(false);
    expect(postcodeGeldig("BE", "-2000")).toBe(false);
    expect(postcodeGeldig("BE", "20<0>")).toBe(false);
  });

  it("bewaart een buitenlandse postcode met de landcode ervoor", () => {
    expect(buitenlandPostcode("BE", " 2000 ")).toBe("BE-2000");
    expect(buitenlandPostcode("GB", "sw1a  1aa")).toBe("GB-SW1A 1AA");
  });

  it("toont een opdrachtgever in NL de vier cijfers, in het buitenland de hele postcode", () => {
    expect(gebiedVan("1012 AB")).toBe("1012");
    expect(gebiedVan("BE-2000")).toBe("BE-2000");
    expect(gebiedVan("")).toBeNull();
    expect(gebiedVan(null)).toBeNull();
  });

  it("herkent de thuisbasis-fouten van de server", () => {
    expect(thuisbasisReden({ error: { details: { reden: "thuisbasis-niet-gevonden" } } })).toBe("nietGevonden");
    expect(thuisbasisReden({ error: { details: { reden: "thuisbasis-onbereikbaar" } } })).toBe("onbereikbaar");
    expect(thuisbasisReden({ error: { message: "iets anders" } })).toBeNull();
    expect(thuisbasisReden(null)).toBeNull();
  });
});

describe("thuisbasis-schema", () => {
  const schema = z.object(thuisbasisVelden).superRefine(controleerThuisbasis);
  const fout = (v: unknown) => {
    const r = schema.safeParse(v);
    return r.success ? null : r.error.issues[0]?.message;
  };

  it("laat een Nederlandse postcode zonder land toe (standaard NL)", () => {
    expect(fout({ postalCode: "1012 AB" })).toBeNull();
    expect(fout({ postalCode: "2000" })).toBe("Gebruik een geldige postcode, bijv. 1012 AB");
  });

  it("laat een buitenlandse postcode toe, met woonplaats", () => {
    expect(fout({ country: "be", postalCode: "2000", city: "Antwerpen" })).toBeNull();
    expect(fout({ country: "BE", postalCode: "2000" })).toBe("Vul je woonplaats in");
    expect(fout({ country: "BE", postalCode: "x", city: "Antwerpen" })).toBe("Vul een geldige postcode in (2 tot 12 letters of cijfers)");
  });

  it("weigert een land buiten de lijst, in het Nederlands", () => {
    expect(fout({ country: "US", postalCode: "10001", city: "New York" })).toBe("Kies een land uit de lijst");
  });
});

describe("onderneming (matching)", () => {
  it("een Nederlandse zzp'er heeft een actieve KVK nodig", () => {
    expect(ondernemingGeldig({ kvkValid: true, vatValid: false, country: "NL" })).toBe(true);
    expect(ondernemingGeldig({ kvkValid: false, vatValid: true, country: "NL" })).toBe(false);
    expect(zzpGeschikt({ kvkValid: true, vatValid: true, country: "NL" })).toBe(true);
    expect(zzpGeschikt({ kvkValid: true, vatValid: false, country: "NL" })).toBe(false);
  });

  it("een zzp'er uit het buitenland telt mee met een geldig EU-btw-nummer", () => {
    expect(ondernemingGeldig({ kvkValid: false, vatValid: true, country: "PL" })).toBe(true);
    expect(zzpGeschikt({ kvkValid: false, vatValid: true, country: "PL" })).toBe(true);
    expect(zzpGeschikt({ kvkValid: false, vatValid: false, country: "PL" })).toBe(false);
  });
});
