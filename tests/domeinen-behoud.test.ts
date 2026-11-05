import { describe, expect, it } from "vitest";
import { EXTENSIES, MARGE_MINIMUM_CENT, extensie, verkoopPrijs } from "@/lib/domeinen/extensies";
import { blijfAanbod, codeMagNu, margeTeKort, slotMagOpen, wijstNaarOns, VERHUISCODE_NA_UREN } from "@/lib/domeinen/behoud-core";
import { houderContact, rechtsvormCode, splitsNaam } from "@/lib/domeinen/houder";

describe("prijzen: inkoop plus een kleine marge", () => {
  it("rekent inkoop + 15%, minstens € 2, afgerond op ,95", () => {
    expect(verkoopPrijs(49)).toBe(295);
    expect(verkoopPrijs(1650)).toBe(1995);
    expect(verkoopPrijs(899)).toBe(1195);
    expect(verkoopPrijs(2799)).toBe(3295);
    expect(verkoopPrijs(10250)).toBe(11795);
  });

  it("geen enkele extensie onder de inkoop, eerste jaar of verlenging", () => {
    for (const e of EXTENSIES) {
      expect(e.prijsCent - e.inkoopEersteCent, `.${e.tld} eerste jaar`).toBeGreaterThanOrEqual(MARGE_MINIMUM_CENT);
      expect(e.verlengCent - e.inkoopVerlengCent, `.${e.tld} verlenging`).toBeGreaterThanOrEqual(MARGE_MINIMUM_CENT);
      expect(e.prijsCent % 100, `.${e.tld} eindigt op ,95`).toBe(95);
    }
  });

  it(".nl: goedkoop eerste jaar, eerlijke verlenging", () => {
    expect(extensie("nl")).toMatchObject({ prijsCent: 295, verlengCent: 1995 });
  });
});

describe("blijfaanbod en verhuiscode", () => {
  it("volgend jaar tegen de inkoopprijs, nooit met verlies", () => {
    expect(blijfAanbod(1995, 1650)).toEqual({ normaalCent: 1995, aanbodCent: 1650 });
    expect(blijfAanbod(1650, 1650)).toBeNull();
    expect(blijfAanbod(1000, 0)).toBeNull();
  });

  it("de verhuiscode pas na de wachttijd, en alleen na 'toch verhuizen'", () => {
    const op = new Date("2026-11-05T10:00:00Z");
    const later = (uren: number) => new Date(op.getTime() + uren * 3_600_000);
    const v = { stap: "code-wacht" as const, reden: "te-duur" as const, op: op.toISOString(), bevestigdOp: op.toISOString() };
    expect(codeMagNu(v, later(VERHUISCODE_NA_UREN - 1))).toBe(false);
    expect(codeMagNu(v, later(VERHUISCODE_NA_UREN))).toBe(true);
    expect(codeMagNu({ ...v, stap: "aanbod" }, later(48))).toBe(false);
    expect(codeMagNu({ ...v, bevestigdOp: undefined }, later(48))).toBe(false);
  });

  it("het verhuisslot mag alleen open als de klant zijn code kreeg", () => {
    expect(slotMagOpen(null)).toBe(false);
    expect(slotMagOpen({ stap: "aanbod", reden: "anders", op: "" })).toBe(false);
    expect(slotMagOpen({ stap: "code-verstuurd", reden: "anders", op: "" })).toBe(true);
  });

  it("merkt het als een domein niet meer naar onze server wijst", () => {
    expect(wijstNaarOns(["37.97.226.24"], "37.97.226.24")).toBe(true);
    expect(wijstNaarOns(["1.2.3.4"], "37.97.226.24")).toBe(false);
    expect(wijstNaarOns([], "37.97.226.24")).toBeNull();
  });

  it("waarschuwt als het register duurder wordt dan onze prijs", () => {
    expect(margeTeKort({ prijsCent: 295, verlengCent: 1995 }, { price: 49, recurringPrice: 1650 })).toBe(false);
    expect(margeTeKort({ prijsCent: 295, verlengCent: 1995 }, { price: 49, recurringPrice: 2100 })).toBe(true);
  });
});

describe("houder: het bedrijf van de klant", () => {
  const voorbeeld = { phoneNumber: "+31.201234567", country: "nl" };
  const gegevens = {
    bedrijf: "Bakkerij Jansen B.V.",
    kvk: "12345678",
    rechtsvorm: "Besloten Vennootschap",
    straat: "Dorpsstraat",
    huisnummer: "12a",
    postcode: "1234ab",
    plaats: "Utrecht",
    land: "NL",
    persoon: "Jan van der Berg",
    email: "jan@bakkerijjansen.nl",
  };

  it("rechtsvorm naar de code van het register", () => {
    expect(rechtsvormCode("Besloten Vennootschap")).toBe("BV");
    expect(rechtsvormCode("Eenmanszaak")).toBe("EENMANSZAAK");
    expect(rechtsvormCode("Vennootschap onder firma")).toBe("VOF");
    expect(rechtsvormCode("Stichting")).toBe("STICHTING");
    expect(rechtsvormCode(null)).toBe("ANDERS");
  });

  it("splitst voor- en achternaam", () => {
    expect(splitsNaam("Jan van der Berg")).toEqual({ firstName: "Jan", lastName: "van der Berg" });
    expect(splitsNaam("Cher")).toEqual({ firstName: "Cher", lastName: "Cher" });
  });

  it("maakt het houdercontact, in het formaat van ons eigen contact", () => {
    expect(houderContact(gegevens, voorbeeld)).toMatchObject({
      type: "registrant",
      companyName: "Bakkerij Jansen B.V.",
      companyKvk: "12345678",
      companyType: "BV",
      number: "12a",
      postalCode: "1234AB",
      country: "nl",
      firstName: "Jan",
      lastName: "van der Berg",
      email: "jan@bakkerijjansen.nl",
      phoneNumber: "+31.201234567",
    });
  });

  it("te weinig gegevens: geen houdercontact (dan wordt ZekerFlex houder)", () => {
    expect(houderContact({ ...gegevens, straat: null }, voorbeeld)).toBeNull();
    expect(houderContact({ ...gegevens, persoon: "" }, voorbeeld)).toBeNull();
  });
});
