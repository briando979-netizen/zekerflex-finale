import { describe, expect, it } from "vitest";
import { STANDAARD_TIJDEN, leesTijden, tijdTekst } from "@/lib/horeca/tijden";
import { aanzettenSchema, beheerActieSchema } from "@/lib/horeca/schema";

describe("horeca-openingstijden", () => {
  it("leeg of onzin wordt de standaard", () => {
    expect(leesTijden(null)).toEqual(STANDAARD_TIJDEN);
    expect(leesTijden({ "2": { van: "25:00", tot: "12:00" }, x: 1 })).toEqual(STANDAARD_TIJDEN);
  });

  it("neemt geldige tijden en dichte dagen over, ook door na middernacht", () => {
    const t = leesTijden({ "1": { van: "17:00", tot: "02:00" }, "0": null });
    expect(t["1"]).toEqual({ van: "17:00", tot: "02:00" });
    expect(t["0"]).toBeNull();
    expect(tijdTekst(t["1"])).toBe("17:00 – 02:00");
    expect(tijdTekst(null)).toBe("Gesloten");
  });

  it("van gelijk aan tot telt niet", () => {
    expect(leesTijden({ "3": { van: "12:00", tot: "12:00" } })["3"]).toEqual(STANDAARD_TIJDEN["3"]);
  });
});

describe("horeca-invoer", () => {
  it("aanzetten vraagt een naam", () => {
    expect(aanzettenSchema.safeParse({ actie: "aanzetten", naam: " ", soort: "cafe" }).success).toBe(false);
    expect(aanzettenSchema.parse({ actie: "aanzetten", naam: "Café De Brug", soort: "cafe" })).toMatchObject({ plaats: "", email: "" });
  });

  it("een gerecht: prijs in centen, station keuken of bar", () => {
    const basis = { actie: "item", categorieId: null, naam: "Soep", omschrijving: "", prijsCent: 695, allergenen: ["gluten"], vegetarisch: true, veganistisch: false, beschikbaar: true, station: "keuken" };
    expect(beheerActieSchema.safeParse(basis).success).toBe(true);
    expect(beheerActieSchema.safeParse({ ...basis, prijsCent: 6.95 }).success).toBe(false);
    expect(beheerActieSchema.safeParse({ ...basis, station: "terras" }).success).toBe(false);
  });

  it("kleuren als #RRGGBB", () => {
    const g = { actie: "gegevens", naam: "Zaak", soort: "bar", plaats: "", adres: "", telefoon: "", email: "", kvk: "", kleur: "#112233", accent: "#ffaa00", kop: "", intro: "" };
    expect(beheerActieSchema.safeParse(g).success).toBe(true);
    expect(beheerActieSchema.safeParse({ ...g, kleur: "rood" }).success).toBe(false);
  });
});
