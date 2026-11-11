import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aandachtLijst,
  berekenCijfers,
  bezoekBlokkade,
  bouwLidmaatschap,
  dagenTussen,
  eindeNaPerioden,
  effectieveStatus,
  euroTekst,
  filterLeden,
  isDag,
  kiesLidmaatschap,
  lidStatus,
  looptAf,
  nlDag,
  omzetPerMaandCent,
  perMaandCent,
  plusDagen,
  plusMaanden,
  stripBijnaOp,
  tegoed,
  teWissenLeden,
  valideerLid,
  valideerVorm,
  vandaagVan,
  wijzigStatus,
  wisLidGegevens,
  type Lid,
  type Lidmaatschap,
  type Vorm,
} from "@/lib/lidmaatschappen/model";

const NU = new Date("2026-03-10T10:00:00Z");

const fout = (f: () => unknown): { status: number; message: string } => {
  try {
    f();
  } catch (e) {
    return e as { status: number; message: string };
  }
  return { status: 0, message: "" };
};

const vorm = (over: Partial<Vorm> = {}): Vorm => ({ id: "aaaaaaaaaaaa", naam: "Maand", soort: "maand", prijsCent: 3000, inschrijfgeldCent: 0, looptijdPerioden: null, strippen: null, geldigheidMaanden: null, gearchiveerd: false, gemaaktOp: "2026-01-01T00:00:00Z", ...over });
const strip = (over: Partial<Vorm> = {}): Vorm => vorm({ id: "bbbbbbbbbbbb", naam: "Tienrittenkaart", soort: "strippenkaart", prijsCent: 8000, strippen: 10, geldigheidMaanden: 6, ...over });
const lm = (over: Partial<Lidmaatschap> = {}): Lidmaatschap => ({
  id: "111111111111",
  lidId: "cccccccccccc",
  vormId: "aaaaaaaaaaaa",
  vormNaam: "Maand",
  soort: "maand",
  prijsCent: 3000,
  status: "actief",
  startdatum: "2026-01-01",
  einddatum: null,
  pauzeSinds: null,
  eindReden: "",
  strippenBegin: null,
  strippenGebruikt: 0,
  gemaaktOp: "2026-01-01T09:00:00Z",
  ...over,
});
const kaart = (over: Partial<Lidmaatschap> = {}): Lidmaatschap => lm({ id: "222222222222", vormNaam: "Tienrittenkaart", soort: "strippenkaart", prijsCent: 8000, strippenBegin: 10, einddatum: "2026-09-09", ...over });
const lid = (over: Partial<Lid> = {}): Lid => ({ id: "cccccccccccc", nummer: "L-0001", naam: "Sanne de Vries", telefoon: "06 12345678", email: "sanne@example.test", notitie: "", laatstGezien: null, gewist: false, gewistOp: null, gemaaktOp: "2026-01-01T09:00:00Z", ...over });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});
afterEach(() => vi.useRealTimers());

describe("kalenderdagen", () => {
  it("herkent echte dagen, ook 29 februari alleen in een schrikkeljaar", () => {
    expect(isDag("2028-02-29")).toBe(true);
    expect(isDag("2026-02-29")).toBe(false);
    expect(isDag("2100-02-29")).toBe(false);
    expect(isDag("2026-13-01")).toBe(false);
    expect(isDag("2026-2-1")).toBe(false);
    expect(isDag(20260101)).toBe(false);
    expect(isDag(undefined)).toBe(false);
  });

  it("maanden erbij: het einde van de maand wordt de laatste dag van de doelmaand", () => {
    expect(plusMaanden("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMaanden("2028-01-31", 1)).toBe("2028-02-29");
    expect(plusMaanden("2026-03-31", 1)).toBe("2026-04-30");
    expect(plusMaanden("2028-02-29", 12)).toBe("2029-02-28");
    expect(plusMaanden("2026-12-15", 2)).toBe("2027-02-15");
    expect(plusMaanden("2026-01-15", -2)).toBe("2025-11-15");
    expect(plusMaanden("2028-02-29", -24)).toBe("2026-02-28");
  });

  it("dagen erbij en dagen tussen kennen geen zomer- of wintertijd", () => {
    expect(plusDagen("2026-03-28", 2)).toBe("2026-03-30");
    expect(dagenTussen("2026-03-28", "2026-03-30")).toBe(2);
    expect(dagenTussen("2026-10-24", "2026-10-26")).toBe(2);
    expect(plusDagen("2026-02-28", 1)).toBe("2026-03-01");
    expect(plusDagen("2028-02-28", 1)).toBe("2028-02-29");
    expect(dagenTussen("2026-03-10", "2026-03-09")).toBe(-1);
  });

  it("het tijdstip van de server wordt de Nederlandse dag, ook rond de overgangen", () => {
    expect(vandaagVan(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29"); // 00:30 wintertijd
    expect(vandaagVan(new Date("2026-03-29T22:30:00Z"))).toBe("2026-03-30"); // 00:30 zomertijd
    expect(vandaagVan(new Date("2026-03-29T21:30:00Z"))).toBe("2026-03-29"); // 23:30 zomertijd
    expect(vandaagVan(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25"); // 00:30 zomertijd
    expect(vandaagVan(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-25"); // 23:30 wintertijd
    expect(vandaagVan(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26"); // 00:30 wintertijd
    expect(vandaagVan(new Date("2028-02-28T23:30:00Z"))).toBe("2028-02-29");
  });

  it("de einddatum na perioden is de dag voor het begin van de volgende periode", () => {
    expect(eindeNaPerioden("2026-01-01", "maand", 1)).toBe("2026-01-31");
    expect(eindeNaPerioden("2026-01-15", "maand", 1)).toBe("2026-02-14");
    expect(eindeNaPerioden("2026-01-31", "maand", 1)).toBe("2026-02-27");
    expect(eindeNaPerioden("2028-01-31", "maand", 1)).toBe("2028-02-28");
    expect(eindeNaPerioden("2026-03-01", "week", 2)).toBe("2026-03-14");
    expect(eindeNaPerioden("2026-03-25", "week", 1)).toBe("2026-03-31"); // over de zomertijd heen: nog steeds zeven dagen
    expect(eindeNaPerioden("2026-01-01", "jaar", 1)).toBe("2026-12-31");
    expect(eindeNaPerioden("2028-02-29", "jaar", 1)).toBe("2029-02-27");
  });
});

describe("vorm controleren", () => {
  it("een looptijdvorm met prijs, optioneel inschrijfgeld en aantal perioden", () => {
    expect(valideerVorm({ naam: " Maand  fit ", soort: "maand", prijsCent: 2950, inschrijfgeldCent: 1500, looptijdPerioden: "12" })).toEqual({ naam: "Maand fit", soort: "maand", prijsCent: 2950, inschrijfgeldCent: 1500, looptijdPerioden: 12, strippen: null, geldigheidMaanden: null });
    expect(valideerVorm({ naam: "Jaar", soort: "jaar", prijsCent: 30000 })).toMatchObject({ looptijdPerioden: null, inschrijfgeldCent: 0 });
  });
  it("een strippenkaart met aantal bezoeken en geldigheid", () => {
    expect(valideerVorm({ naam: "Tienrittenkaart", soort: "strippenkaart", strippen: 10, geldigheidMaanden: 6 })).toMatchObject({ prijsCent: 0, strippen: 10, geldigheidMaanden: 6, looptijdPerioden: null });
  });
  it("geeft Nederlandse fouten", () => {
    expect(fout(() => valideerVorm({ naam: "a", soort: "maand", prijsCent: 1 })).message).toMatch(/naam/);
    expect(fout(() => valideerVorm({ naam: "Goed", soort: "dag", prijsCent: 1 })).message).toMatch(/soort/);
    expect(fout(() => valideerVorm({ naam: "Goed", soort: "maand" })).message).toMatch(/prijs/);
    expect(fout(() => valideerVorm({ naam: "Goed", soort: "maand", prijsCent: -1 })).message).toMatch(/prijs/);
    expect(fout(() => valideerVorm({ naam: "Goed", soort: "maand", prijsCent: 12.5 })).message).toMatch(/prijs/);
    expect(fout(() => valideerVorm({ naam: "Goed", soort: "maand", prijsCent: 100, looptijdPerioden: 0 })).message).toMatch(/perioden/);
    expect(fout(() => valideerVorm({ naam: "Goed", soort: "strippenkaart", geldigheidMaanden: 6 })).message).toMatch(/bezoeken/);
    expect(fout(() => valideerVorm({ naam: "Goed", soort: "strippenkaart", strippen: 0, geldigheidMaanden: 6 })).status).toBe(422);
    expect(fout(() => valideerVorm({ naam: "Goed", soort: "strippenkaart", strippen: 10 })).message).toMatch(/maanden/);
    expect(fout(() => valideerVorm({ naam: "x".repeat(61), soort: "maand", prijsCent: 1 })).message).toMatch(/te lang/);
  });
});

describe("lid controleren", () => {
  it("naam plus telefoon of e-mail; e-mail wordt kleine letters", () => {
    expect(valideerLid({ naam: "Sanne", telefoon: "06 12345678" })).toEqual({ naam: "Sanne", telefoon: "06 12345678", email: "", notitie: "" });
    expect(valideerLid({ naam: "Sanne", email: "Sanne@Voorbeeld.NL" }).email).toBe("sanne@voorbeeld.nl");
  });
  it("bewaart nooit een geboortedatum of ander onbekend veld", () => {
    const l = valideerLid({ naam: "Sanne", email: "s@voorbeeld.nl", geboortedatum: "1990-01-01", geboorte: "x", bsn: "123" });
    expect(Object.keys(l).sort()).toEqual(["email", "naam", "notitie", "telefoon"]);
    expect(JSON.stringify(l)).not.toContain("1990");
  });
  it("geeft Nederlandse fouten", () => {
    expect(fout(() => valideerLid({ naam: "S", email: "s@voorbeeld.nl" })).message).toMatch(/naam/);
    expect(fout(() => valideerLid({ naam: "Sanne" })).message).toMatch(/telefoonnummer of een e-mailadres/);
    expect(fout(() => valideerLid({ naam: "Sanne", email: "geen-mail" })).message).toMatch(/e-mailadres/);
    expect(fout(() => valideerLid({ naam: "Sanne", telefoon: "abc" })).message).toMatch(/telefoonnummer/);
    expect(fout(() => valideerLid({ naam: "Sanne", telefoon: "123" })).message).toMatch(/telefoonnummer/);
    expect(fout(() => valideerLid({ naam: "Sanne", telefoon: "06 12345678", notitie: "n".repeat(301) })).message).toMatch(/notitie/);
    expect(valideerLid({ naam: "Sanne", telefoon: "06 12345678", notitie: "n".repeat(300) }).notitie).toHaveLength(300);
  });
  it("wissen haalt alle persoonsgegevens weg en laat het nummer staan", () => {
    const g = wisLidGegevens(lid({ notitie: "allergisch" }), NU);
    expect(g).toMatchObject({ naam: "", telefoon: "", email: "", notitie: "", gewist: true, nummer: "L-0001", id: "cccccccccccc" });
    expect(g.gewistOp).toBe(NU.toISOString());
  });
});

describe("lidmaatschap bouwen", () => {
  it("een doorlopend abonnement heeft een open einde en onthoudt de prijs", () => {
    const l = bouwLidmaatschap(vorm(), "cccccccccccc", "dddddddddddd", undefined, NU);
    expect(l).toMatchObject({ startdatum: "2026-03-10", einddatum: null, status: "actief", prijsCent: 3000, vormNaam: "Maand", strippenBegin: null });
  });
  it("een abonnement met een vast aantal perioden krijgt een afgeleide einddatum", () => {
    expect(bouwLidmaatschap(vorm({ looptijdPerioden: 3 }), "c", "d", "2026-03-10", NU).einddatum).toBe("2026-06-09");
    expect(bouwLidmaatschap(vorm({ soort: "week", looptijdPerioden: 4 }), "c", "d", "2026-03-10", NU).einddatum).toBe("2026-04-06");
    expect(bouwLidmaatschap(vorm({ soort: "jaar", looptijdPerioden: 1 }), "c", "d", "2028-02-29", new Date("2028-03-01T10:00:00Z")).einddatum).toBe("2029-02-27");
  });
  it("een strippenkaart krijgt tegoed en een laatste geldige dag", () => {
    const l = bouwLidmaatschap(strip(), "c", "d", "2026-03-10", NU);
    expect(l).toMatchObject({ strippenBegin: 10, strippenGebruikt: 0, einddatum: "2026-09-09", soort: "strippenkaart" });
    expect(tegoed(l)).toBe(10);
    expect(bouwLidmaatschap(strip({ geldigheidMaanden: 1 }), "c", "d", "2026-01-31", NU).einddatum).toBe("2026-02-27");
  });
  it("de startdatum: niet in de toekomst, niet verzonnen, hoogstens vijf jaar terug", () => {
    expect(fout(() => bouwLidmaatschap(vorm(), "c", "d", "2026-03-11", NU)).message).toMatch(/toekomst/);
    expect(fout(() => bouwLidmaatschap(vorm(), "c", "d", "2026-02-30", NU)).message).toMatch(/klopt niet/);
    expect(fout(() => bouwLidmaatschap(vorm(), "c", "d", "morgen", NU)).message).toMatch(/klopt niet/);
    expect(fout(() => bouwLidmaatschap(vorm(), "c", "d", "2021-03-09", NU)).message).toMatch(/te ver terug/);
    expect(bouwLidmaatschap(vorm(), "c", "d", "2021-03-10", NU).startdatum).toBe("2021-03-10");
  });
  it("de startdatum volgt de Nederlandse dag: vlak na middernacht is het al de volgende dag", () => {
    const na = new Date("2026-03-29T22:30:00Z"); // 30 maart 00:30 zomertijd
    expect(bouwLidmaatschap(vorm(), "c", "d", undefined, na).startdatum).toBe("2026-03-30");
  });
});

describe("strippen en effectieve status", () => {
  it("het tegoed gaat nooit onder nul", () => {
    expect(tegoed(kaart({ strippenGebruikt: 4 }))).toBe(6);
    expect(tegoed(kaart({ strippenGebruikt: 10 }))).toBe(0);
    expect(tegoed(kaart({ strippenGebruikt: 12 }))).toBe(0);
    expect(tegoed(lm())).toBeNull();
  });
  it("een abonnement loopt t/m de einddatum en is daarna afgelopen", () => {
    const l = lm({ einddatum: "2026-03-31" });
    expect(effectieveStatus(l, "2026-03-31")).toBe("actief");
    expect(effectieveStatus(l, "2026-04-01")).toBe("afgelopen");
  });
  it("een kaart die op is of verlopen is, is afgelopen; een beëindigd lidmaatschap blijft beëindigd", () => {
    expect(effectieveStatus(kaart({ strippenGebruikt: 10 }), "2026-03-10")).toBe("afgelopen");
    expect(effectieveStatus(kaart(), "2026-09-09")).toBe("actief");
    expect(effectieveStatus(kaart(), "2026-09-10")).toBe("afgelopen");
    expect(effectieveStatus(lm({ status: "beeindigd", einddatum: "2026-02-01" }), "2026-03-10")).toBe("beeindigd");
    expect(effectieveStatus(lm({ status: "gepauzeerd", pauzeSinds: "2026-03-01" }), "2026-03-10")).toBe("gepauzeerd");
  });
  it("een bezoek wordt geweigerd met een Nederlandse uitleg", () => {
    expect(bezoekBlokkade(lm(), "2026-03-10")).toBeNull();
    expect(bezoekBlokkade(kaart({ strippenGebruikt: 10 }), "2026-03-10")).toMatch(/is op/);
    expect(bezoekBlokkade(kaart(), "2026-09-10")).toMatch(/verlopen op 9 sep 2026/);
    expect(bezoekBlokkade(lm({ einddatum: "2026-03-01" }), "2026-03-10")).toMatch(/afgelopen op 1 mrt 2026/);
    expect(bezoekBlokkade(lm({ status: "gepauzeerd", pauzeSinds: "2026-03-01" }), "2026-03-10")).toMatch(/gepauzeerd/);
    expect(bezoekBlokkade(lm({ status: "beeindigd", einddatum: "2026-03-01" }), "2026-03-10")).toMatch(/beëindigd/);
  });
  it("zonder gekozen lidmaatschap gaat een abonnement voor en verloopt de eerstvolgende kaart het eerst", () => {
    const k1 = kaart({ id: "333333333333", einddatum: "2026-12-01" });
    const k2 = kaart({ id: "444444444444", einddatum: "2026-06-01" });
    expect(kiesLidmaatschap([k1, k2, lm()], "2026-03-10")).toMatchObject({ lm: { id: "111111111111" } });
    expect(kiesLidmaatschap([k1, k2], "2026-03-10")).toMatchObject({ lm: { id: "444444444444" } });
    expect(kiesLidmaatschap([kaart({ strippenGebruikt: 10 }), k1], "2026-03-10")).toMatchObject({ lm: { id: "333333333333" } });
  });
  it("zonder bruikbaar lidmaatschap komt er een uitleg", () => {
    expect(kiesLidmaatschap([], "2026-03-10")).toMatchObject({ fout: expect.stringMatching(/nog geen lidmaatschap/) });
    expect(kiesLidmaatschap([kaart({ strippenGebruikt: 10 })], "2026-03-10")).toMatchObject({ fout: expect.stringMatching(/is op/) });
  });
});

describe("statusovergangen", () => {
  it("pauzeren en hervatten schuift de einddatum op met de duur van de pauze", () => {
    const l = lm({ einddatum: "2026-03-31" });
    const p = wijzigStatus(l, { actie: "pauzeren" }, NU);
    expect(p).toMatchObject({ status: "gepauzeerd", pauzeSinds: "2026-03-10" });
    const h = wijzigStatus(p, { actie: "hervatten" }, new Date("2026-03-20T10:00:00Z"));
    expect(h).toMatchObject({ status: "actief", pauzeSinds: null, einddatum: "2026-04-10" });
  });
  it("een pauze over de zomertijd telt hele kalenderdagen", () => {
    const p = wijzigStatus(lm({ einddatum: "2026-04-30" }), { actie: "pauzeren", datum: "2026-03-27" }, new Date("2026-03-27T10:00:00Z"));
    const h = wijzigStatus(p, { actie: "hervatten" }, new Date("2026-03-30T10:00:00Z"));
    expect(h.einddatum).toBe("2026-05-03");
  });
  it("een open einde blijft open en een kaart schuift mee", () => {
    const p = wijzigStatus(lm(), { actie: "pauzeren" }, NU);
    expect(wijzigStatus(p, { actie: "hervatten" }, new Date("2026-03-15T10:00:00Z")).einddatum).toBeNull();
    const k = wijzigStatus(kaart(), { actie: "pauzeren" }, NU);
    expect(wijzigStatus(k, { actie: "hervatten" }, new Date("2026-03-15T10:00:00Z")).einddatum).toBe("2026-09-14");
  });
  it("pauzeren: niet dubbel, niet in de toekomst, niet voor de start, niet als het afgelopen is", () => {
    const p = wijzigStatus(lm(), { actie: "pauzeren" }, NU);
    expect(fout(() => wijzigStatus(p, { actie: "pauzeren" }, NU)).status).toBe(409);
    expect(fout(() => wijzigStatus(lm(), { actie: "pauzeren", datum: "2026-03-11" }, NU)).message).toMatch(/toekomst/);
    expect(fout(() => wijzigStatus(lm(), { actie: "pauzeren", datum: "2025-12-31" }, NU)).message).toMatch(/startdatum/);
    expect(fout(() => wijzigStatus(lm(), { actie: "pauzeren", datum: "2026-02-30" }, NU)).message).toMatch(/klopt niet/);
    expect(fout(() => wijzigStatus(lm({ einddatum: "2026-03-01" }), { actie: "pauzeren" }, NU)).status).toBe(409);
  });
  it("hervatten kan alleen bij een gepauzeerd lidmaatschap", () => {
    expect(fout(() => wijzigStatus(lm(), { actie: "hervatten" }, NU)).message).toMatch(/niet gepauzeerd/);
  });
  it("beëindigen vraagt een reden en zet de einddatum op de dag van het einde", () => {
    const e = wijzigStatus(lm(), { actie: "beeindigen", reden: " Verhuisd " }, NU);
    expect(e).toMatchObject({ status: "beeindigd", einddatum: "2026-03-10", eindReden: "Verhuisd", pauzeSinds: null });
    expect(wijzigStatus(lm(), { actie: "beeindigen", reden: "Blessure", datum: "2026-03-01" }, NU).einddatum).toBe("2026-03-01");
    expect(wijzigStatus(lm({ status: "gepauzeerd", pauzeSinds: "2026-03-05" }), { actie: "beeindigen", reden: "Blessure" }, NU).status).toBe("beeindigd");
  });
  it("beëindigen: reden verplicht, geen toekomst, niet voor de start, en daarna is het klaar", () => {
    expect(fout(() => wijzigStatus(lm(), { actie: "beeindigen" }, NU)).message).toMatch(/reden/);
    expect(fout(() => wijzigStatus(lm(), { actie: "beeindigen", reden: "x" }, NU)).message).toMatch(/reden/);
    expect(fout(() => wijzigStatus(lm(), { actie: "beeindigen", reden: "r".repeat(201) }, NU)).message).toMatch(/te lang/);
    expect(fout(() => wijzigStatus(lm(), { actie: "beeindigen", reden: "Klaar", datum: "2026-03-11" }, NU)).message).toMatch(/niet vooruit/);
    expect(fout(() => wijzigStatus(lm(), { actie: "beeindigen", reden: "Klaar", datum: "2025-12-31" }, NU)).message).toMatch(/startdatum/);
    const e = wijzigStatus(lm(), { actie: "beeindigen", reden: "Klaar" }, NU);
    for (const actie of ["pauzeren", "hervatten", "beeindigen"] as const) expect(fout(() => wijzigStatus(e, { actie, reden: "nog eens" }, NU)).status).toBe(409);
  });
  it("een onbekende actie geeft 422", () => {
    expect(fout(() => wijzigStatus(lm(), { actie: "weg" as never }, NU)).status).toBe(422);
  });
});

describe("loopt af en bijna op", () => {
  const vandaag = "2026-03-10";
  it("loopt af: vandaag t/m 30 dagen, alleen een lopend lidmaatschap met einde", () => {
    expect(looptAf(lm({ einddatum: "2026-03-10" }), vandaag)).toBe(true);
    expect(looptAf(lm({ einddatum: "2026-04-09" }), vandaag)).toBe(true);
    expect(looptAf(lm({ einddatum: "2026-04-10" }), vandaag)).toBe(false);
    expect(looptAf(lm({ einddatum: "2026-03-09" }), vandaag)).toBe(false);
    expect(looptAf(lm(), vandaag)).toBe(false);
    expect(looptAf(lm({ einddatum: "2026-03-20", status: "gepauzeerd", pauzeSinds: "2026-03-01" }), vandaag)).toBe(false);
    expect(looptAf(lm({ einddatum: "2026-03-20", status: "beeindigd" }), vandaag)).toBe(false);
  });
  it("strippenkaart bijna op: hoogstens twee over (ook nul), niet als verlopen", () => {
    expect(stripBijnaOp(kaart({ strippenGebruikt: 7 }), vandaag)).toBe(false); // 3 over
    expect(stripBijnaOp(kaart({ strippenGebruikt: 8 }), vandaag)).toBe(true); // 2 over
    expect(stripBijnaOp(kaart({ strippenGebruikt: 10 }), vandaag)).toBe(true); // op
    expect(stripBijnaOp(kaart({ strippenGebruikt: 8, einddatum: "2026-03-09" }), vandaag)).toBe(false);
    expect(stripBijnaOp(lm(), vandaag)).toBe(false);
  });
  it("de aandachtslijst: wat het eerst speelt bovenaan, gewiste leden nooit", () => {
    const leden = [lid(), lid({ id: "eeeeeeeeeeee", nummer: "L-0002", naam: "Piet", telefoon: "0612345678" }), lid({ id: "ffffffffffff", nummer: "L-0003", gewist: true, naam: "" })];
    const lijst = aandachtLijst(
      leden,
      [lm({ einddatum: "2026-03-20" }), kaart({ id: "555555555555", lidId: "eeeeeeeeeeee", strippenGebruikt: 9 }), kaart({ id: "666666666666", lidId: "ffffffffffff", strippenGebruikt: 9 })],
      vandaag,
    );
    expect(lijst.map((a) => a.soort)).toEqual(["bijna-op", "loopt-af"]);
    expect(lijst[0]?.tekst).toBe("Piet (L-0002): Tienrittenkaart, nog 1 bezoek over");
    expect(lijst[1]?.tekst).toBe("Sanne de Vries (L-0001): Maand loopt over 10 dagen af (20 mrt 2026)");
  });
});

describe("omzetschatting", () => {
  it("legt de omrekening vast: maand ×1, week × 52 ÷ 12, jaar ÷ 12, strippenkaart telt niet", () => {
    expect(perMaandCent("maand", 3000)).toBe(3000);
    expect(perMaandCent("week", 1200)).toBe(5200);
    expect(perMaandCent("jaar", 12000)).toBe(1000);
    expect(perMaandCent("strippenkaart", 8000)).toBe(0);
  });
  it("telt alleen lopende abonnementen en rondt één keer af over de som", () => {
    const lms = [
      lm({ prijsCent: 3000 }),
      lm({ id: "a1a1a1a1a1a1", soort: "week", prijsCent: 1000 }), // 4333,33
      lm({ id: "a2a2a2a2a2a2", soort: "jaar", prijsCent: 12000 }), // 1000
      kaart(),
      lm({ id: "a3a3a3a3a3a3", prijsCent: 9999, status: "gepauzeerd", pauzeSinds: "2026-03-01" }),
      lm({ id: "a4a4a4a4a4a4", prijsCent: 9999, status: "beeindigd", einddatum: "2026-02-01" }),
      lm({ id: "a5a5a5a5a5a5", prijsCent: 9999, einddatum: "2026-03-09" }),
    ];
    expect(omzetPerMaandCent(lms, "2026-03-10")).toBe(8333);
    expect(omzetPerMaandCent([lm({ soort: "week", prijsCent: 1001 })], "2026-03-10")).toBe(4338);
    expect(omzetPerMaandCent([], "2026-03-10")).toBe(0);
  });
  it("de cijfers: actieve en gepauzeerde leden, omzet, loopt af en bijna op", () => {
    const leden = [lid(), lid({ id: "eeeeeeeeeeee", nummer: "L-0002", naam: "Piet" }), lid({ id: "ffffffffffff", nummer: "L-0003", naam: "Kees" }), lid({ id: "999999999999", nummer: "L-0004", naam: "Els" })];
    const lms = [
      lm({ einddatum: "2026-03-20" }),
      lm({ id: "b1b1b1b1b1b1", lidId: "eeeeeeeeeeee", status: "gepauzeerd", pauzeSinds: "2026-03-01" }),
      lm({ id: "b2b2b2b2b2b2", lidId: "ffffffffffff", status: "beeindigd", einddatum: "2026-01-01" }),
    ];
    expect(berekenCijfers(leden, lms, "2026-03-10")).toEqual({ actieveLeden: 1, gepauzeerdeLeden: 1, omzetPerMaandCent: 3000, looptAf: 1, stripBijnaOp: 0 });
  });
});

describe("leden zoeken en filteren", () => {
  const leden = [lid(), lid({ id: "eeeeeeeeeeee", nummer: "L-0002", naam: "Piet Jansen", telefoon: "", email: "piet@example.test" }), lid({ id: "ffffffffffff", nummer: "L-0003", naam: "Anna" }), lid({ id: "999999999999", nummer: "L-0004", naam: "Zonder" }), lid({ id: "888888888888", nummer: "L-0005", naam: "", telefoon: "", email: "", gewist: true })];
  const lms = [
    lm({ einddatum: "2026-03-20" }),
    kaart({ id: "c1c1c1c1c1c1", lidId: "eeeeeeeeeeee", strippenGebruikt: 8 }),
    lm({ id: "c2c2c2c2c2c2", lidId: "ffffffffffff", status: "gepauzeerd", pauzeSinds: "2026-03-01" }),
    lm({ id: "c3c3c3c3c3c3", lidId: "888888888888", status: "beeindigd", einddatum: "2025-01-01" }),
  ];
  const namen = (o: Parameters<typeof filterLeden>[2]) => filterLeden(leden, lms, o, "2026-03-10").map((l) => l.nummer);

  it("zoekt op naam, nummer, telefoon en e-mail, zonder hoofdletters", () => {
    expect(namen({ zoek: "piet" })).toEqual(["L-0002"]);
    expect(namen({ zoek: "l-0003" })).toEqual(["L-0003"]);
    expect(namen({ zoek: "06 12" })).toEqual(["L-0003", "L-0001", "L-0004"]);
    expect(namen({ zoek: "PIET@EXAMPLE" })).toEqual(["L-0002"]);
    expect(namen({ zoek: "bestaatniet" })).toEqual([]);
  });
  it("filtert op status, loopt af en strippenkaart bijna op", () => {
    expect(namen({ filter: "actief" })).toEqual(["L-0002", "L-0001"]);
    expect(namen({ filter: "gepauzeerd" })).toEqual(["L-0003"]);
    expect(namen({ filter: "beeindigd" })).toEqual(["L-0005"]);
    expect(namen({ filter: "loopt-af" })).toEqual(["L-0001"]);
    expect(namen({ filter: "bijna-op" })).toEqual(["L-0002"]);
    expect(namen({})).toHaveLength(5);
  });
  it("gewiste leden staan onderaan en zijn niet te vinden op een naam", () => {
    expect(namen({}).at(-1)).toBe("L-0005");
    expect(namen({ zoek: "gewist" })).toEqual([]);
  });
  it("de status van een lid volgt zijn lidmaatschappen", () => {
    expect(lidStatus([], "2026-03-10")).toBe("zonder");
    expect(lidStatus([lm({ status: "gepauzeerd", pauzeSinds: "2026-03-01" }), lm()], "2026-03-10")).toBe("actief");
    expect(lidStatus([lm({ status: "gepauzeerd", pauzeSinds: "2026-03-01" })], "2026-03-10")).toBe("gepauzeerd");
    expect(lidStatus([lm({ einddatum: "2026-03-01" })], "2026-03-10")).toBe("beeindigd");
  });
});

describe("bewaartermijn", () => {
  const vandaag = "2028-02-29"; // de grens is dan 28 februari 2026
  it("beëindigde leden ouder dan twee jaar komen aan de beurt, precies twee jaar nog niet", () => {
    const leden = [lid(), lid({ id: "eeeeeeeeeeee", nummer: "L-0002" })];
    const oud = lm({ status: "beeindigd", einddatum: "2026-02-27" });
    const net = lm({ id: "d1d1d1d1d1d1", lidId: "eeeeeeeeeeee", status: "beeindigd", einddatum: "2026-02-28" });
    expect(teWissenLeden(leden, [oud, net], vandaag)).toEqual(["cccccccccccc"]);
  });
  it("een lopend of gepauzeerd lidmaatschap of een recent bezoek houdt het lid vast", () => {
    const oud = lm({ status: "beeindigd", einddatum: "2020-01-01" });
    expect(teWissenLeden([lid()], [oud, lm({ id: "d2d2d2d2d2d2" })], vandaag)).toEqual([]);
    expect(teWissenLeden([lid()], [oud, lm({ id: "d2d2d2d2d2d2", status: "gepauzeerd", pauzeSinds: "2027-01-01" })], vandaag)).toEqual([]);
    expect(teWissenLeden([lid({ laatstGezien: "2027-12-01T10:00:00Z" })], [oud], vandaag)).toEqual([]);
  });
  it("een lid zonder lidmaatschap telt vanaf de dag van aanmaken; een al gewist lid niet meer", () => {
    expect(teWissenLeden([lid({ gemaaktOp: "2025-06-01T10:00:00Z" })], [], vandaag)).toEqual(["cccccccccccc"]);
    expect(teWissenLeden([lid({ gemaaktOp: "2027-06-01T10:00:00Z" })], [], vandaag)).toEqual([]);
    expect(teWissenLeden([lid({ gemaaktOp: "2020-06-01T10:00:00Z", gewist: true })], [], vandaag)).toEqual([]);
  });
});

describe("weergave", () => {
  it("datums en bedragen", () => {
    expect(nlDag("2028-02-29")).toBe("29 feb 2028");
    expect(nlDag("kapot")).toBe("kapot");
    expect(euroTekst(1250)).toBe("€ 12,50");
    expect(euroTekst(123456)).toBe("€ 1.234,56");
    expect(euroTekst(5)).toBe("€ 0,05");
    expect(euroTekst(0)).toBe("€ 0,00");
  });
});
