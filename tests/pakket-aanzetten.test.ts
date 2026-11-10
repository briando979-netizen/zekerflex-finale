import { describe, expect, it } from "vitest";
import { aanzetVoorstel } from "@/lib/sites/aanzet-voorstel";
import { soortUitSbi } from "@/lib/horeca/soorten";
import { aanzettenSchema as rijschoolAanzetten, lees } from "@/lib/rijschool/schema";
import { aanzettenSchema as horecaAanzetten } from "@/lib/horeca/schema";
import type { Company } from "@/lib/sites/types";

// De eerste stap van het rijschool- en horecapakket staat al ingevuld met wat het bedrijf
// ZekerFlex al gaf, zodat de beheerder niet alles opnieuw hoeft in te vullen. Onbekend blijft leeg.

const bedrijf: Company = {
  naam: "Rijschool De Bocht",
  kvk: "12345678",
  straat: "Dorpsstraat 1a",
  postcode: "1234 AB",
  plaats: "Utrecht",
  telefoon: "0612345678",
  email: "eigenaar@bedrijf.test",
};

describe("aanzetVoorstel", () => {
  it("neemt naam, plaats, adres, KVK-nummer, telefoon en e-mail over", () => {
    expect(aanzetVoorstel(bedrijf)).toEqual({
      naam: "Rijschool De Bocht",
      plaats: "Utrecht",
      adres: "Dorpsstraat 1a, 1234 AB",
      kvk: "12345678",
      telefoon: "0612345678",
      email: "eigenaar@bedrijf.test",
    });
  });

  it("laat onbekende velden leeg en verzint niets", () => {
    const v = aanzetVoorstel({ ...bedrijf, naam: "", straat: "", postcode: "", plaats: "", telefoon: "", kvk: "" });
    expect(v).toEqual({ naam: "", plaats: "", adres: "", kvk: "", telefoon: "", email: "eigenaar@bedrijf.test" });
    expect(aanzetVoorstel({ ...bedrijf, straat: "", postcode: " 1234 AB " }).adres).toBe("1234 AB");
  });

  it("laat een KVK-nummer zonder acht cijfers leeg (het formulier zou het afkeuren)", () => {
    expect(aanzetVoorstel({ ...bedrijf, kvk: "1234567" }).kvk).toBe("");
  });

  it("past in de eerste stap van de rijschool en van de zaak", () => {
    const v = aanzetVoorstel(bedrijf);
    expect(lees(rijschoolAanzetten, v)).toEqual(v);
    expect(horecaAanzetten.parse({ actie: "aanzetten", ...v, soort: "cafe" })).toMatchObject({ adres: v.adres, kvk: v.kvk });
  });
});

describe("eerste stap: adres en KVK-nummer", () => {
  it("zijn niet verplicht (een tabblad van vóór de uitrol stuurt ze niet mee)", () => {
    expect(lees(rijschoolAanzetten, { naam: "De Bocht", plaats: "", telefoon: "", email: "" })).toMatchObject({ adres: "", kvk: "" });
    expect(horecaAanzetten.parse({ actie: "aanzetten", naam: "Café De Brug", soort: "cafe" })).toMatchObject({ adres: "", kvk: "" });
  });

  it("keurt een KVK-nummer van de rijschool zonder acht cijfers af", () => {
    expect(() => lees(rijschoolAanzetten, { naam: "De Bocht", plaats: "", telefoon: "", email: "", kvk: "123" })).toThrow("Een KVK-nummer heeft 8 cijfers.");
  });
});

describe("soortUitSbi", () => {
  it("leidt de soort af uit de SBI-groep", () => {
    expect(soortUitSbi(["56101"])).toBe("restaurant");
    expect(soortUitSbi(["56102"])).toBe("restaurant");
    expect(soortUitSbi(["5630"])).toBe("cafe");
    expect(soortUitSbi(["55.10.1"])).toBe("hotel");
  });

  it("neemt de eerste code die iets aanwijst", () => {
    expect(soortUitSbi(["55101", "56101"])).toBe("hotel");
    expect(soortUitSbi(["47111", "56300"])).toBe("cafe");
  });

  it("geeft null als de codes geen soort aanwijzen", () => {
    expect(soortUitSbi([])).toBeNull();
    expect(soortUitSbi(["8553", "56210", "5520"])).toBeNull();
  });
});
