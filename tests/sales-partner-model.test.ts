import { describe, expect, it } from "vitest";
import {
  MODEL_B,
  berekenBedrijf,
  centenModelA,
  isAlGeregistreerd,
  laatsteMaanden,
  leesBedrijven,
  leesPartnerSet,
  maandCsv,
  maandVan,
  modelAEinde,
  normaliseerKvk,
  partnerKpi,
  type Dienst,
  type PartnerBedrijf,
} from "@/lib/sales-partners/model";
import { PARTNER_TEKSTEN, partnerTaal, vulIn } from "@/lib/sales-partners/teksten";

// De rekenregels van de sales partners (27 nov 2026, opdracht van de eigenaar): Model A € 1,00 per gewerkt uur de eerste
// 6 maanden, Model B € 100 eenmalig na 40 betaalde uren. Uren in de gratis eerste maand (platformfactuur € 0) leveren niets
// op (eigenaar, 27 nov). Alle datums met een zone, geen klok van de server.

const bedrijf = (extra: Partial<PartnerBedrijf> = {}): PartnerBedrijf => ({
  id: "b1",
  bedrijfsnaam: "Bakkerij De Korst",
  kvk: "12345678",
  contactnaam: "Anna",
  email: "anna@korst.test",
  telefoon: "0612345678",
  model: "A",
  aangemaaktOp: "2026-11-01T10:00:00+01:00",
  tenantId: "t1",
  tenantNaam: "De Korst",
  gekoppeldOp: "2026-11-02T10:00:00+01:00",
  afgewezenOp: null,
  afwijsReden: null,
  ...extra,
});

const dienst = (start: string, uren: number, betaald = true, tenantId = "t1"): Dienst => ({ tenantId, start, minuten: uren * 60, betaald, gratis: false });
/** een dienst in de gratis eerste maand: de platformfactuur was € 0 */
const gratisDienst = (start: string, uren: number): Dienst => ({ tenantId: "t1", start, minuten: uren * 60, betaald: false, gratis: true });

describe("status van een geregistreerd bedrijf", () => {
  it("zonder koppeling: geregistreerd, met koppeling zonder uren: aangemeld, met uren: actief", () => {
    expect(berekenBedrijf(bedrijf({ tenantId: null }), []).status).toBe("geregistreerd");
    expect(berekenBedrijf(bedrijf(), []).status).toBe("aangemeld");
    expect(berekenBedrijf(bedrijf(), [dienst("2026-11-10T09:00:00+01:00", 8)]).status).toBe("actief");
  });

  it("afgewezen verdient niets, ook als er uren zijn", () => {
    const u = berekenBedrijf(bedrijf({ afgewezenOp: "2026-11-03T10:00:00+01:00" }), [dienst("2026-11-10T09:00:00+01:00", 8)]);
    expect(u.status).toBe("afgewezen");
    expect(u.verdiendCents).toBe(0);
  });

  it("uren van andere bedrijven en van vóór de registratie tellen niet", () => {
    const u = berekenBedrijf(bedrijf(), [
      dienst("2026-10-20T09:00:00+02:00", 8),
      dienst("2026-11-10T09:00:00+01:00", 8, true, "ander-bedrijf"),
      dienst("2026-11-12T09:00:00+01:00", 4),
    ]);
    expect(u.minuten).toBe(4 * 60);
  });
});

describe("Model A: € 1,00 per gewerkt uur, de eerste 6 maanden", () => {
  it("rekent € 1 per uur, per maand, en telt na zes maanden niet meer", () => {
    const u = berekenBedrijf(bedrijf(), [
      dienst("2026-11-10T09:00:00+01:00", 8), // eerste dienst: tot 10 mei 2027
      dienst("2026-12-05T09:00:00+01:00", 7.5),
      dienst("2027-05-09T09:00:00+02:00", 4), // nog binnen
      dienst("2027-05-10T09:00:00+02:00", 6), // erbuiten
    ]);
    expect(u.perMaand["2026-11"]?.verdiendCents).toBe(800);
    expect(u.perMaand["2026-12"]?.verdiendCents).toBe(750);
    expect(u.perMaand["2027-05"]?.verdiendCents).toBe(400);
    expect(u.verdiendCents).toBe(800 + 750 + 400);
    expect(u.minuten).toBe((8 + 7.5 + 4 + 6) * 60); // de uren zelf tellen wel allemaal
  });

  it("uitbetaalbaar is alleen de commissie over betaalde uren", () => {
    const u = berekenBedrijf(bedrijf(), [dienst("2026-11-10T09:00:00+01:00", 8, true), dienst("2026-11-11T09:00:00+01:00", 5, false)]);
    expect(u.verdiendCents).toBe(1300);
    expect(u.uitbetaalbaarCents).toBe(800);
  });

  it("het einde van de zes maanden is middernacht in Amsterdam, ook over de wintertijd heen", () => {
    expect(modelAEinde("2026-11-10T09:00:00+01:00")).toBe("2027-05-09T22:00:00.000Z");
    // een eerste dienst om 23:30 Nederlandse tijd valt op de dag in Amsterdam, niet op de UTC-dag
    expect(modelAEinde("2026-11-10T23:30:00+01:00")).toBe("2027-05-09T22:00:00.000Z");
  });

  it("uren in de gratis eerste maand leveren niets op, maar de zes maanden lopen vanaf de eerste dienst", () => {
    const u = berekenBedrijf(bedrijf(), [
      gratisDienst("2026-11-10T09:00:00+01:00", 8), // eerste dienst, gratis maand: zes maanden tot 10 mei 2027
      gratisDienst("2026-12-01T09:00:00+01:00", 6),
      dienst("2026-12-15T09:00:00+01:00", 5),
      dienst("2027-05-10T09:00:00+02:00", 9), // buiten de zes maanden
    ]);
    expect(u.modelAEinde).toBe("2027-05-09T22:00:00.000Z");
    expect(u.gratisMinuten).toBe((8 + 6) * 60);
    expect(u.perMaand["2026-11"]?.verdiendCents ?? 0).toBe(0);
    expect(u.perMaand["2026-12"]?.verdiendCents).toBe(500);
    expect(u.verdiendCents).toBe(500);
    expect(u.uitbetaalbaarCents).toBe(500);
    expect(u.betaaldeMinuten).toBe((5 + 9) * 60);
    expect(u.minuten).toBe((8 + 6 + 5 + 9) * 60); // gewerkt blijft gewerkt
  });

  it("rondt per maand af op hele centen", () => {
    expect(centenModelA(20)).toBe(33);
    expect(centenModelA(90)).toBe(150);
  });
});

describe("Model B: € 100 eenmalig na 40 betaalde uren", () => {
  const b = bedrijf({ model: "B" });

  it("geen bonus onder de 40 betaalde uren, ook niet met veel onbetaalde uren", () => {
    const u = berekenBedrijf(b, [dienst("2026-11-10T09:00:00+01:00", 30, true), dienst("2026-11-12T09:00:00+01:00", 30, false)]);
    expect(u.verdiendCents).toBe(0);
    expect(u.betaaldeMinuten).toBe(30 * 60);
  });

  it("de bonus valt één keer, in de maand waarin de 40 betaalde uren gehaald worden", () => {
    const u = berekenBedrijf(b, [
      dienst("2026-11-20T09:00:00+01:00", 24),
      dienst("2026-12-03T09:00:00+01:00", 16), // samen 40: hier valt de bonus
      dienst("2026-12-10T09:00:00+01:00", 40),
    ]);
    expect(u.verdiendCents).toBe(MODEL_B.bonusCents);
    expect(u.perMaand["2026-12"]?.verdiendCents).toBe(10_000);
    expect(u.perMaand["2026-11"]?.verdiendCents).toBe(0);
  });

  it("uren in de gratis eerste maand tellen niet voor de 40 betaalde uren", () => {
    const u = berekenBedrijf(b, [gratisDienst("2026-11-10T09:00:00+01:00", 35), dienst("2026-12-15T09:00:00+01:00", 20)]);
    expect(u.verdiendCents).toBe(0);
    expect(u.betaaldeMinuten).toBe(20 * 60);
    const later = berekenBedrijf(b, [gratisDienst("2026-11-10T09:00:00+01:00", 35), dienst("2026-12-15T09:00:00+01:00", 20), dienst("2027-01-12T09:00:00+01:00", 20)]);
    expect(later.perMaand["2027-01"]?.verdiendCents).toBe(MODEL_B.bonusCents);
  });
});

describe("tellers en invoer", () => {
  it("de vier tellers laten afgewezen bedrijven weg", () => {
    const a = berekenBedrijf(bedrijf(), [dienst("2026-11-10T09:00:00+01:00", 10)]);
    const g = berekenBedrijf(bedrijf({ tenantId: null }), []);
    const x = berekenBedrijf(bedrijf({ afgewezenOp: "2026-11-03T10:00:00+01:00" }), []);
    expect(partnerKpi([a, g, x])).toEqual({ bedrijven: 2, actief: 1, minuten: 600, verdiendCents: 1000, uitbetaalbaarCents: 1000 });
  });

  it("KvK-nummer: alleen 8 cijfers", () => {
    expect(normaliseerKvk(" 1234 5678 ")).toBe("12345678");
    expect(normaliseerKvk("1234")).toBeNull();
    expect(normaliseerKvk("")).toBeNull();
  });

  it("een bedrijf kan maar één keer geregistreerd worden (KvK of e-mail), tenzij het eerder werd afgewezen", () => {
    const alle = [bedrijf(), bedrijf({ id: "b2", kvk: null, email: "info@ander.test", afgewezenOp: "2026-11-03T10:00:00+01:00" })];
    expect(isAlGeregistreerd(alle, { kvk: "12345678", email: "nieuw@x.test" })).toBe(true);
    expect(isAlGeregistreerd(alle, { kvk: null, email: "ANNA@korst.test" })).toBe(true);
    expect(isAlGeregistreerd(alle, { kvk: null, email: "info@ander.test" })).toBe(false);
  });

  it("leest de opslag soepel: een kapotte regel valt weg", () => {
    expect(leesBedrijven({ bedrijven: [bedrijf(), { id: "x" }, null, bedrijf({ id: "b3", model: "B" })] }).map((b) => b.id)).toEqual(["b1", "b3"]);
    expect(leesBedrijven(null)).toEqual([]);
    expect(leesPartnerSet({ u1: "2026-11-27T10:00:00Z", u2: 5 })).toEqual({ u1: "2026-11-27T10:00:00Z" });
  });

  it("maanden in Amsterdamse tijd", () => {
    expect(maandVan("2026-11-30T23:30:00Z")).toBe("2026-12");
    expect(laatsteMaanden(new Date("2026-11-27T12:00:00+01:00"), 3)).toEqual(["2026-11", "2026-10", "2026-09"]);
  });
});

describe("maandoverzicht (CSV)", () => {
  it("toont per bedrijf de uren en de commissie van die maand, met een totaal", () => {
    const b = bedrijf({ bedrijfsnaam: 'Bakkerij "De Korst"; Zuid' });
    const csv = maandCsv({ naam: "Kunal", email: "k@x.test" }, "2026-11", [{ bedrijf: b, uitkomst: berekenBedrijf(b, [dienst("2026-11-10T09:00:00+01:00", 8)]) }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Bakkerij ""De Korst""; Zuid";12345678;A: € 1,00 per uur;Actief;8,0;8,0;€ 8,00;€ 8,00');
    expect(csv).toContain("Totaal;;;;;;€ 8,00;€ 8,00");
  });

  it("in het Engels voor een partner die Engels leest", () => {
    const b = bedrijf();
    const csv = maandCsv({ naam: "Kunal", email: "k@x.test" }, "2026-11", [{ bedrijf: b, uitkomst: berekenBedrijf(b, [dienst("2026-11-10T09:00:00+01:00", 8)]) }], "en");
    expect(csv).toContain("Monthly overview sales partner November 2026");
    expect(csv).toContain("Company;KvK;Model;Status;Hours worked;Paid hours");
    expect(csv).toContain("Bakkerij De Korst;12345678;A: € 1.00 per hour;Active;8,0;8,0;€ 8,00;€ 8,00");
    expect(csv).toContain("Total;;;;;;€ 8,00;€ 8,00");
  });
});

describe("teksten van het partnerdashboard (Nederlands en Engels)", () => {
  it("de taal volgt het cookie: Nederlands bij nl of zonder keuze, anders Engels", () => {
    expect(partnerTaal("nl")).toBe("nl");
    expect(partnerTaal(undefined)).toBe("nl");
    expect(partnerTaal("en")).toBe("en");
    expect(partnerTaal("pl")).toBe("en");
  });

  it("beide talen hebben dezelfde teksten en plaatshouders", () => {
    const sleutels = (o: unknown, pad = ""): string[] =>
      o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => sleutels(v, `${pad}.${k}`)) : [pad];
    expect(sleutels(PARTNER_TEKSTEN.en)).toEqual(sleutels(PARTNER_TEKSTEN.nl));
    expect(PARTNER_TEKSTEN.en.hoeStappen.length).toBe(PARTNER_TEKSTEN.nl.hoeStappen.length);
    expect(PARTNER_TEKSTEN.en.regels.length).toBe(PARTNER_TEKSTEN.nl.regels.length);
    const holders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of ["geregistreerdOp", "tot", "betaaldeUrenVan", "uitbetaalbaar", "gratisUren"] as const) {
      expect(holders(PARTNER_TEKSTEN.en[k])).toEqual(holders(PARTNER_TEKSTEN.nl[k]));
    }
    expect(holders(PARTNER_TEKSTEN.en.kpi.commissieSub)).toEqual(holders(PARTNER_TEKSTEN.nl.kpi.commissieSub));
  });

  it("vulIn vult de plaatshouders in en laat onbekende staan", () => {
    expect(vulIn("{naam} is geregistreerd.", { naam: "Bakkerij" })).toBe("Bakkerij is geregistreerd.");
    expect(vulIn("{uren} of {n} paid hours", { uren: "12,0", n: 40 })).toBe("12,0 of 40 paid hours");
    expect(vulIn("{constructor} {x}", { x: 1 })).toBe("{constructor} 1");
  });
});
