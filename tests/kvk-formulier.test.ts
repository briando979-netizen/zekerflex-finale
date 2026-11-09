import { describe, expect, it } from "vitest";
import { keuzeLabel, regelOnder, vulWaarden } from "@/lib/kvk/formulier";
import { metTijdslimiet, osmNaarTreffer, parseOsmAdres, profielNaarBedrijf, treffNaarBedrijf } from "@/lib/kvk/bronnen";
import type { KvkTreffer } from "@/lib/kvk/types";

const treffer = (over: Partial<KvkTreffer> = {}): KvkTreffer => ({
  kvkNumber: "12345678",
  name: "Acme B.V.",
  city: "Utrecht",
  legalForm: "Besloten Vennootschap",
  street: "Oudegracht",
  houseNumber: "1",
  postalCode: "3511 AA",
  vatNumber: "NL123456789B01",
  source: "register",
  active: true,
  ...over,
});

describe("vulWaarden", () => {
  it("vult naam, KVK, adres, postcode, plaats en btw in", () => {
    expect(vulWaarden(treffer())).toEqual({
      name: "Acme B.V.",
      kvk: "12345678",
      street: "Oudegracht",
      address: "Oudegracht 1",
      houseNumber: "1",
      postalCode: "3511 AA",
      city: "Utrecht",
      vat: "NL123456789B01",
    });
  });
  it("laat onbekende gegevens weg zodat niets wat al getypt is gewist wordt", () => {
    expect(vulWaarden(treffer({ street: null, houseNumber: null, postalCode: null, vatNumber: null }))).toEqual({ name: "Acme B.V.", kvk: "12345678", city: "Utrecht" });
  });
  it("een treffer uit OpenStreetMap heeft geen KVK-nummer en dus geen register-label", () => {
    const t = treffer({ kvkNumber: null, source: "osm" });
    expect(vulWaarden(t).kvk).toBeUndefined();
    expect(keuzeLabel(t).register).toBe(false);
    expect(keuzeLabel(treffer())).toEqual({ tekst: "Gevonden in het handelsregister", register: true });
  });
  it("regelOnder", () => {
    expect(regelOnder(treffer())).toBe("Utrecht · Besloten Vennootschap");
    expect(regelOnder(treffer({ city: null, legalForm: null }))).toBe("");
  });
});

describe("bronnen omzetten", () => {
  it("profielNaarBedrijf: een geldig profiel, ongeldige nummers vallen weg", () => {
    const p = {
      kvkNumber: "12345678",
      legalName: "Acme B.V.",
      tradeName: null,
      legalForm: null,
      status: "DISSOLVED",
      insolvent: false,
      address: { street: null, houseNumber: null, postalCode: null, city: "Gouda" },
      vat: null,
    };
    expect(profielNaarBedrijf(p)).toMatchObject({ kvk: "12345678", actief: false, plaats: "Gouda" });
    expect(profielNaarBedrijf({ ...p, kvkNumber: "1234" })).toBeNull();
    expect(profielNaarBedrijf({ ...p, legalName: "Onbekend" })).toBeNull();
    expect(profielNaarBedrijf({ ...p, status: "ACTIVE", insolvent: true })?.actief).toBe(false);
  });
  it("treffNaarBedrijf", () => {
    expect(treffNaarBedrijf({ kvkNumber: "12345678", name: " Acme ", city: null })?.naam).toBe("Acme");
    expect(treffNaarBedrijf({ kvkNumber: "1", name: "Acme", city: null })).toBeNull();
  });
  it("parseOsmAdres en osmNaarTreffer", () => {
    expect(parseOsmAdres("Oudegracht 1a, 3511 AA Utrecht")).toEqual({ street: "Oudegracht", houseNumber: "1a", postalCode: "3511 AA", city: "Utrecht" });
    expect(parseOsmAdres("")).toEqual({ street: null, houseNumber: null, postalCode: null, city: null });
    const t = osmNaarTreffer({ naam: "Bakkerij", adres: "Oudegracht 1, 3511 AA Utrecht", plaats: "Utrecht" });
    expect(t).toMatchObject({ kvkNumber: null, source: "osm", street: "Oudegracht", postalCode: "3511 AA" });
  });
  it("metTijdslimiet geeft de terugval als de bron te lang duurt", async () => {
    const trage = new Promise<string>((klaar) => setTimeout(() => klaar("laat"), 200));
    expect(await metTijdslimiet(trage, 10, "terugval")).toBe("terugval");
    expect(await metTijdslimiet(Promise.resolve("snel"), 100, "terugval")).toBe("snel");
  });
});
