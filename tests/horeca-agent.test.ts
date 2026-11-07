import { describe, expect, it } from "vitest";
import { idemOpslag, leesIdemSleutel, openingstijdenPerDag, reserveringVoorAgent, verzoekAfdruk, zaakVoorAgent } from "@/lib/horeca/agent";

const BASIS = "https://zekerflex.com";

describe("reserveren via AI-assistenten", () => {
  it("toont een zaak met openingstijden per dag en de regels voor reserveren", () => {
    const z = zaakVoorAgent(
      { slug: "de-gouden-leeuw", naam: "De Gouden Leeuw", soort: "restaurant", plaats: "Utrecht", adres: "Oudegracht 1", telefoon: "030 123 4567", openingstijden: { "1": null }, reserveren: { maxGroep: 6, slotMinuten: 15 } },
      BASIS,
    );
    expect(z.website).toBe("https://zekerflex.com/horeca/de-gouden-leeuw");
    expect(z.openingstijden.maandag).toBeNull();
    expect(z.openingstijden.zondag).toEqual({ van: "12:00", tot: "22:00" });
    expect(z.reserveren).toEqual({ groterDanBellen: 6, dagenVooruit: 60, elkeMinuten: 15, tafelBezetMinuten: 120 });
    expect(z.links.reserveren).toBe("https://zekerflex.com/api/agent/horeca/de-gouden-leeuw/reserveringen");
  });

  it("geeft alle zeven dagen, ook zonder eigen tijden", () => {
    expect(Object.keys(openingstijdenPerDag({}))).toEqual(["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"]);
  });

  it("een reservering krijgt het token en de links om hem te bekijken of te annuleren", () => {
    const r = reserveringVoorAgent(
      { id: "res000000001", datum: "2026-12-24", tijd: "19:00", personen: 4, naam: "Fam. Jansen", status: "BEVESTIGD" },
      { slug: "de-gouden-leeuw", naam: "De Gouden Leeuw" },
      "tok.en",
      BASIS,
      "https://zekerflex.com/horeca/de-gouden-leeuw/annuleren/tok.en",
    );
    expect(r.statusTekst).toBe("Bevestigd");
    expect(r.links.bekijken).toBe("https://zekerflex.com/api/agent/horeca/reserveringen/tok.en");
    expect(r.links.annulerenVoorDeGast).toContain("/annuleren/");
  });

  it("accepteert een nette Idempotency-Key en weigert lege of rare", () => {
    expect(leesIdemSleutel(" abc-123 ")).toBe("abc-123");
    expect(leesIdemSleutel("")).toBeNull();
    expect(leesIdemSleutel(null)).toBeNull();
    expect(leesIdemSleutel("met spatie")).toBeNull();
    expect(leesIdemSleutel("x".repeat(201))).toBeNull();
  });

  it("dezelfde sleutel bij een andere zaak telt apart", () => {
    expect(idemOpslag("zaak-a", "k1")).not.toBe(idemOpslag("zaak-b", "k1"));
    expect(idemOpslag("zaak-a", "k1")).toBe(idemOpslag("zaak-a", "k1"));
  });

  it("de vingerafdruk van een verzoek negeert hoofdletters in het e-mailadres, maar niet een andere tijd", () => {
    const r = { datum: "2026-12-24", tijd: "19:00", personen: 4, naam: "Fam. Jansen", email: "jansen@voorbeeld.test", telefoon: "0612345678", opmerking: "" };
    expect(verzoekAfdruk({ ...r, email: "Jansen@Voorbeeld.TEST" })).toBe(verzoekAfdruk(r));
    expect(verzoekAfdruk({ ...r, tijd: "19:30" })).not.toBe(verzoekAfdruk(r));
  });
});
