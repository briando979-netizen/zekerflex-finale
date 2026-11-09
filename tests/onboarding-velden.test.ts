import { describe, expect, it } from "vitest";
import { controleerVeld, controleerVelden, ibanKlopt } from "@/lib/onboarding/velden";
import { controleerVestiging, controleerVestigingVeld } from "@/lib/onboarding/vestiging";
import { AUTH_DICTS } from "@/lib/i18n/auth";

const NU = new Date("2026-11-09T10:00:00+01:00");

describe("ibanKlopt", () => {
  it("accepteert geldige IBAN's, ook met spaties en kleine letters", () => {
    expect(ibanKlopt("NL91ABNA0417164300")).toBe(true);
    expect(ibanKlopt("nl91 abna 0417 1643 00")).toBe(true);
    expect(ibanKlopt("PL61109010140000071219812874")).toBe(true);
  });
  it("weigert een fout controlecijfer of vorm", () => {
    expect(ibanKlopt("NL91ABNA0417164301")).toBe(false);
    expect(ibanKlopt("12345")).toBe(false);
    expect(ibanKlopt("")).toBe(false);
  });
});

describe("controleerVeld", () => {
  it("postcode", () => {
    expect(controleerVeld("postal", "1012 AB", NU)).toBeNull();
    expect(controleerVeld("postal", "1012ab", NU)).toBeNull();
    expect(controleerVeld("postal", "10122", NU)).toBe("postal");
  });
  it("kvk heeft 8 cijfers", () => {
    expect(controleerVeld("kvk", "12345678", NU)).toBeNull();
    expect(controleerVeld("kvk", "1234567", NU)).toBe("kvk");
  });
  it("btw begint met een landcode", () => {
    expect(controleerVeld("vat", "PL1234567890", NU)).toBeNull();
    expect(controleerVeld("vat", "1234567890", NU)).toBe("vat");
  });
  it("documentdatum moet in de toekomst liggen en bestaan", () => {
    expect(controleerVeld("expiry", "2030-05-01", NU)).toBeNull();
    expect(controleerVeld("expiry", "2025-05-01", NU)).toBe("expiry");
    expect(controleerVeld("expiry", "2030-02-31", NU)).toBe("expiry");
    expect(controleerVeld("expiry", "", NU)).toBe("expiry");
  });
  it("documentnummer en naam", () => {
    expect(controleerVeld("docNumber", "SPECI2014", NU)).toBeNull();
    expect(controleerVeld("docNumber", "ab", NU)).toBe("docNumber");
    expect(controleerVeld("name", "J", NU)).toBe("name");
    expect(controleerVeld("name", "Jan Kowalski", NU)).toBeNull();
  });
  it("controleerVelden geeft alleen de foute velden", () => {
    expect(controleerVelden({ postal: "1012 AB", iban: "fout" }, NU)).toEqual({ iban: "iban" });
  });
});

describe("vestiging (werkgever)", () => {
  const goed = { kvkNumber: "12345678", branchName: "Amsterdam Centrum", addressLine: "Damstraat 1", postalCode: "1012 AB", houseNumber: "1" };
  it("goede gegevens geven geen fouten", () => {
    expect(controleerVestiging(goed)).toEqual({});
  });
  it("elke fout krijgt een Nederlandse melding per veld", () => {
    const f = controleerVestiging({ kvkNumber: "12", branchName: "A", addressLine: "x", postalCode: "12", houseNumber: "" });
    expect(Object.keys(f).sort()).toEqual(["addressLine", "branchName", "houseNumber", "kvkNumber", "postalCode"]);
    for (const m of Object.values(f)) expect(m).toMatch(/Vul|Geef/);
  });
  it("enkel veld", () => {
    expect(controleerVestigingVeld("postalCode", "1012AB")).toBeNull();
    expect(controleerVestigingVeld("houseNumber", " ")).not.toBeNull();
  });
});

describe("verificatieformulier i18n", () => {
  it("meldingen en bewaar-later-teksten bestaan in alle vijf talen", () => {
    for (const [taal, d] of Object.entries(AUTH_DICTS)) {
      for (const [k, v] of Object.entries(d.onb.err)) expect(v.length, `${taal}.err.${k}`).toBeGreaterThan(5);
      for (const [k, v] of Object.entries(d.onb.later)) expect(v.length, `${taal}.later.${k}`).toBeGreaterThan(5);
    }
  });
});
