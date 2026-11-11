import { describe, expect, it } from "vitest";
import {
  aankomstenOp,
  aantalNachten,
  bezetting,
  boekingInNacht,
  botsingen,
  controleerPlaatsing,
  dagenVanaf,
  isBeschikbaar,
  isDag,
  isInvoerFout,
  kalenderRij,
  minJaren,
  overlapt,
  plusDagen,
  teWissenNaBewaartermijn,
  toekomstigeBoekingen,
  totaalCent,
  valideerBoeking,
  valideerKamer,
  vertrekkenOp,
  vrijeKamers,
  wisGastgegevens,
  wisselStatus,
  type Boeking,
  type BoekingStatus,
  type Kamer,
} from "@/lib/kamers/model";

const NU = new Date("2026-11-12T06:00:00Z");
const K1 = "aaaaaaaaaaaa";
const K2 = "bbbbbbbbbbbb";

const kamer = (over: Partial<Kamer> = {}): Kamer => ({ id: K1, naam: "1", type: "Tweepersoonskamer", capaciteit: 2, prijsCent: 10_000, schoon: "schoon", gearchiveerd: false, notitie: "", gemaaktOp: "x", bijgewerktOp: "x", ...over });
let teller = 0;
const boeking = (aankomst: string, vertrek: string, over: Partial<Boeking> = {}): Boeking => {
  teller += 1;
  return {
    id: `2026-${String(teller).padStart(4, "0")}`,
    nummer: `K-2026-${String(teller).padStart(4, "0")}`,
    kamerId: K1,
    aankomst,
    vertrek,
    naam: "Jansen",
    telefoon: "0612345678",
    email: "j@test.example",
    personen: 2,
    opmerking: "late aankomst",
    status: "gereserveerd",
    prijsPerNachtCent: 10_000,
    prijsOverschrijfCent: null,
    gastGewistOp: null,
    gemaaktOp: "x",
    bijgewerktOp: "x",
    ...over,
  };
};
const fout = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    expect(isInvoerFout(e)).toBe(true);
    return (e as Error).message;
  }
  return "";
};

describe("kalenderdagen", () => {
  it("herkent echte dagen en schrikkeljaren", () => {
    expect(isDag("2028-02-29")).toBe(true);
    expect(isDag("2026-02-29")).toBe(false);
    expect(isDag("2100-02-29")).toBe(false);
    expect(isDag("2026-13-01")).toBe(false);
    expect(isDag("2026-1-1")).toBe(false);
    expect(isDag(20260101)).toBe(false);
    expect(isDag("1999-12-31")).toBe(false);
  });
  it("telt nachten over maandovergangen, jaarwisseling en schrikkeldag", () => {
    expect(aantalNachten("2026-01-31", "2026-02-02")).toBe(2);
    expect(aantalNachten("2026-12-30", "2027-01-02")).toBe(3);
    expect(aantalNachten("2028-02-28", "2028-03-01")).toBe(2);
    expect(aantalNachten("2026-02-28", "2026-03-01")).toBe(1);
    expect(aantalNachten("2026-05-02", "2026-05-01")).toBe(-1);
    expect(plusDagen("2028-02-28", 1)).toBe("2028-02-29");
    expect(plusDagen("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDagen("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("zomer- en wintertijd verschuiven de nachten niet", () => {
    // 29 maart 2026 (zomertijd begint, 23 uur) en 25 oktober 2026 (wintertijd, 25 uur)
    expect(aantalNachten("2026-03-28", "2026-03-30")).toBe(2);
    expect(aantalNachten("2026-03-29", "2026-03-30")).toBe(1);
    expect(aantalNachten("2026-10-24", "2026-10-26")).toBe(2);
    expect(dagenVanaf("2026-10-24", 4)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
    expect(dagenVanaf("2026-03-28", 3)).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(totaalCent(boeking("2026-10-24", "2026-10-26"))).toBe(20_000);
  });
  it("minJaren kapt 29 februari af", () => {
    expect(minJaren("2028-02-29", 2)).toBe("2026-02-28");
    expect(minJaren("2026-11-12", 2)).toBe("2024-11-12");
  });
  it("aansluitende verblijven overlappen niet", () => {
    expect(overlapt("2026-05-01", "2026-05-03", "2026-05-03", "2026-05-05")).toBe(false);
    expect(overlapt("2026-05-03", "2026-05-05", "2026-05-01", "2026-05-03")).toBe(false);
    expect(overlapt("2026-05-01", "2026-05-04", "2026-05-03", "2026-05-05")).toBe(true);
    expect(overlapt("2026-05-01", "2026-05-10", "2026-05-03", "2026-05-04")).toBe(true);
  });
});

describe("kamer controleren", () => {
  it("een goede kamer", () => {
    expect(valideerKamer({ naam: " 12 ", type: "Suite", capaciteit: "4", prijsCent: 15_000, notitie: "" })).toEqual({ naam: "12", type: "Suite", capaciteit: 4, prijsCent: 15_000, notitie: "" });
    expect(valideerKamer({ naam: "A", capaciteit: 1 }).prijsCent).toBeNull();
  });
  it("weigert foute invoer met een Nederlandse tekst", () => {
    expect(fout(() => valideerKamer({ naam: "", capaciteit: 2 }))).toMatch(/verplicht/);
    expect(fout(() => valideerKamer({ naam: "A", capaciteit: 0 }))).toMatch(/capaciteit/);
    expect(fout(() => valideerKamer({ naam: "A", capaciteit: 21 }))).toMatch(/capaciteit/);
    expect(fout(() => valideerKamer({ naam: "A", capaciteit: 2, prijsCent: -1 }))).toMatch(/prijs/);
    expect(fout(() => valideerKamer({ naam: "A", capaciteit: 2, prijsCent: 12.5 }))).toMatch(/prijs/);
    expect(fout(() => valideerKamer({ naam: "A", capaciteit: 2, notitie: "x".repeat(301) }))).toMatch(/300/);
    expect(fout(() => valideerKamer({ naam: { a: 1 }, capaciteit: 2 }))).toMatch(/tekst/);
  });
});

describe("boeking controleren", () => {
  const goed = { kamerId: K1, aankomst: "2026-05-01", vertrek: "2026-05-03", naam: "Jansen", personen: 2 };
  it("een goede boeking", () => {
    const v = valideerBoeking({ ...goed, telefoon: "+31 6 1234 5678", email: "a@b.nl", opmerking: "hond", prijsOverschrijfCent: 25_000 });
    expect(v.prijsOverschrijfCent).toBe(25_000);
    expect(valideerBoeking(goed).prijsOverschrijfCent).toBeNull();
  });
  it("vertrek vóór of op aankomst is niet toegestaan", () => {
    expect(fout(() => valideerBoeking({ ...goed, vertrek: "2026-05-01" }))).toMatch(/na de aankomstdatum/);
    expect(fout(() => valideerBoeking({ ...goed, vertrek: "2026-04-30" }))).toMatch(/na de aankomstdatum/);
  });
  it("weigert ongeldige datums, een te lang verblijf, geen naam, rare contactgegevens", () => {
    expect(fout(() => valideerBoeking({ ...goed, aankomst: "2026-02-30" }))).toMatch(/aankomstdatum/);
    expect(fout(() => valideerBoeking({ ...goed, vertrek: "morgen" }))).toMatch(/vertrekdatum/);
    expect(fout(() => valideerBoeking({ ...goed, vertrek: "2028-01-01" }))).toMatch(/366/);
    expect(fout(() => valideerBoeking({ ...goed, naam: "  " }))).toMatch(/verplicht/);
    expect(fout(() => valideerBoeking({ ...goed, kamerId: "constructor" }))).toMatch(/kamer/);
    expect(fout(() => valideerBoeking({ ...goed, personen: 0 }))).toMatch(/personen/);
    expect(fout(() => valideerBoeking({ ...goed, personen: 21 }))).toMatch(/personen/);
    expect(fout(() => valideerBoeking({ ...goed, email: "geen" }))).toMatch(/e-mail/);
    expect(fout(() => valideerBoeking({ ...goed, telefoon: "abc" }))).toMatch(/telefoon/);
    expect(fout(() => valideerBoeking({ ...goed, prijsOverschrijfCent: -5 }))).toMatch(/totaalprijs/);
  });
  it("bij gewiste gastgegevens is een naam niet verplicht en blijven de velden leeg", () => {
    const v = valideerBoeking({ ...goed, naam: "", telefoon: "0612345678" }, { gewist: true });
    expect(v.naam).toBe("");
    expect(v.telefoon).toBe("");
  });
});

describe("dubbele boeking en plaatsing", () => {
  const bestaand = boeking("2026-05-10", "2026-05-13");
  it("weigert overlap van nachten in dezelfde kamer", () => {
    const p = controleerPlaatsing({ kamerId: K1, aankomst: "2026-05-12", vertrek: "2026-05-15", personen: 2 }, kamer(), [bestaand]);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.fout).toContain(bestaand.nummer);
  });
  it("vertrek en aankomst op dezelfde dag botsen niet, aan beide kanten", () => {
    expect(controleerPlaatsing({ kamerId: K1, aankomst: "2026-05-13", vertrek: "2026-05-15", personen: 2 }, kamer(), [bestaand]).ok).toBe(true);
    expect(controleerPlaatsing({ kamerId: K1, aankomst: "2026-05-08", vertrek: "2026-05-10", personen: 2 }, kamer(), [bestaand]).ok).toBe(true);
  });
  it("een andere kamer en een geannuleerde boeking blokkeren niet", () => {
    expect(isBeschikbaar([bestaand], K2, "2026-05-10", "2026-05-13")).toBe(true);
    expect(isBeschikbaar([boeking("2026-05-10", "2026-05-13", { status: "geannuleerd" })], K1, "2026-05-10", "2026-05-13")).toBe(true);
  });
  it("een boeking botst niet met zichzelf bij bewerken", () => {
    expect(botsingen([bestaand], K1, "2026-05-10", "2026-05-14", bestaand.id)).toHaveLength(0);
  });
  it("weigert meer personen dan de capaciteit, een gearchiveerde kamer en een onbekende kamer", () => {
    const p = controleerPlaatsing({ kamerId: K1, aankomst: "2026-06-01", vertrek: "2026-06-02", personen: 3 }, kamer(), []);
    expect(p).toEqual({ ok: false, fout: expect.stringMatching(/hoogstens 2 personen/) });
    expect(controleerPlaatsing({ kamerId: K1, aankomst: "2026-06-01", vertrek: "2026-06-02", personen: 1 }, kamer({ gearchiveerd: true }), [])).toEqual({ ok: false, fout: expect.stringMatching(/gearchiveerd/) });
    expect(controleerPlaatsing({ kamerId: K1, aankomst: "2026-06-01", vertrek: "2026-06-02", personen: 1 }, undefined, []).ok).toBe(false);
  });
  it("een boeking over de jaarwisseling blokkeert beide jaren", () => {
    const b = boeking("2026-12-30", "2027-01-03");
    expect(isBeschikbaar([b], K1, "2026-12-31", "2027-01-01")).toBe(false);
    expect(isBeschikbaar([b], K1, "2027-01-02", "2027-01-04")).toBe(false);
    expect(isBeschikbaar([b], K1, "2027-01-03", "2027-01-04")).toBe(true);
  });
});

describe("vrije kamers", () => {
  const kamers = [kamer({ id: K1, naam: "10", capaciteit: 4 }), kamer({ id: K2, naam: "2", capaciteit: 2 }), kamer({ id: "cccccccccccc", naam: "3", capaciteit: 2, gearchiveerd: true })];
  it("filtert op vrij, capaciteit en archief; de kleinste kamer eerst", () => {
    expect(vrijeKamers(kamers, [], "2026-05-01", "2026-05-03", 2).map((k) => k.naam)).toEqual(["2", "10"]);
    expect(vrijeKamers(kamers, [], "2026-05-01", "2026-05-03", 3).map((k) => k.naam)).toEqual(["10"]);
    expect(vrijeKamers(kamers, [boeking("2026-05-02", "2026-05-04", { kamerId: K2 })], "2026-05-01", "2026-05-03", 2).map((k) => k.naam)).toEqual(["10"]);
    expect(vrijeKamers(kamers, [boeking("2026-05-01", "2026-05-03", { kamerId: K2 })], "2026-05-03", "2026-05-05", 2).map((k) => k.naam)).toEqual(["2", "10"]);
    expect(vrijeKamers(kamers, [], "2026-05-01", "2026-05-03", 5)).toEqual([]);
  });
});

describe("bezetting", () => {
  const kamers = [kamer({ id: K1 }), kamer({ id: K2, naam: "2" })];
  it("bezette kamer-nachten gedeeld door beschikbare, geannuleerd telt niet", () => {
    const b = [boeking("2026-05-01", "2026-05-04"), boeking("2026-05-02", "2026-05-03", { kamerId: K2 }), boeking("2026-05-05", "2026-05-09", { status: "geannuleerd" })];
    const r = bezetting(kamers, b, "2026-05-01", "2026-05-10");
    expect(r).toEqual({ ok: true, waarde: { dagen: 10, beschikbaar: 20, bezet: 4, procent: 20 } });
  });
  it("een boeking buiten de periode telt niet en een aankomst voor de periode telt gedeeltelijk", () => {
    const r = bezetting(kamers, [boeking("2026-04-29", "2026-05-02")], "2026-05-01", "2026-05-02");
    expect(r).toEqual({ ok: true, waarde: { dagen: 2, beschikbaar: 4, bezet: 1, procent: 25 } });
  });
  it("een dubbel ingevulde nacht telt één keer; één decimaal", () => {
    const r = bezetting([kamer()], [boeking("2026-05-01", "2026-05-02"), boeking("2026-05-01", "2026-05-02")], "2026-05-01", "2026-05-03");
    expect(r).toEqual({ ok: true, waarde: { dagen: 3, beschikbaar: 3, bezet: 1, procent: 33.3 } });
  });
  it("geen kamers geeft 0 procent", () => {
    expect(bezetting([], [], "2026-05-01", "2026-05-02")).toEqual({ ok: true, waarde: { dagen: 2, beschikbaar: 0, bezet: 0, procent: 0 } });
  });
  it("hoogstens 31 dagen, met schrikkeljaar en jaarwisseling", () => {
    expect(bezetting(kamers, [], "2026-05-01", "2026-05-31").ok).toBe(true);
    expect(bezetting(kamers, [], "2026-05-01", "2026-06-01").ok).toBe(false);
    expect(bezetting(kamers, [], "2026-05-02", "2026-05-01").ok).toBe(false);
    expect(bezetting(kamers, [], "2026-05-01", "2026-05-xx").ok).toBe(false);
    const feb = bezetting([kamer()], [boeking("2028-02-28", "2028-03-02")], "2028-02-27", "2028-03-02");
    expect(feb).toEqual({ ok: true, waarde: { dagen: 5, beschikbaar: 5, bezet: 3, procent: 60 } });
    const wisseling = bezetting([kamer()], [boeking("2026-12-30", "2027-01-02")], "2026-12-29", "2027-01-02");
    expect(wisseling).toEqual({ ok: true, waarde: { dagen: 5, beschikbaar: 5, bezet: 3, procent: 60 } });
  });
});

describe("totaalprijs", () => {
  it("nachten × prijs per nacht, een overschrijving wint, zonder prijs is het null", () => {
    expect(totaalCent(boeking("2026-05-01", "2026-05-04"))).toBe(30_000);
    expect(totaalCent(boeking("2026-05-01", "2026-05-04", { prijsOverschrijfCent: 25_000 }))).toBe(25_000);
    expect(totaalCent(boeking("2026-05-01", "2026-05-04", { prijsOverschrijfCent: 0 }))).toBe(0);
    expect(totaalCent(boeking("2026-05-01", "2026-05-04", { prijsPerNachtCent: null }))).toBeNull();
  });
});

describe("status", () => {
  const b = boeking("2026-05-01", "2026-05-03");
  const wissel = (van: BoekingStatus, naar: BoekingStatus) => wisselStatus({ ...b, status: van }, naar, kamer(), [], NU);
  it("de toegestane overgangen", () => {
    for (const [van, naar] of [["gereserveerd", "ingecheckt"], ["gereserveerd", "geannuleerd"], ["ingecheckt", "uitgecheckt"], ["ingecheckt", "gereserveerd"], ["uitgecheckt", "ingecheckt"], ["geannuleerd", "gereserveerd"]] as const) {
      expect(wissel(van, naar).ok, `${van} -> ${naar}`).toBe(true);
    }
  });
  it("de niet-toegestane overgangen", () => {
    for (const [van, naar] of [["gereserveerd", "uitgecheckt"], ["ingecheckt", "geannuleerd"], ["uitgecheckt", "gereserveerd"], ["uitgecheckt", "geannuleerd"], ["geannuleerd", "ingecheckt"], ["geannuleerd", "uitgecheckt"]] as const) {
      expect(wissel(van, naar).ok, `${van} -> ${naar}`).toBe(false);
    }
  });
  it("dezelfde status verandert niets", () => {
    const r = wissel("gereserveerd", "gereserveerd");
    expect(r.ok && r.waarde.status).toBe("gereserveerd");
  });
  it("een geannuleerde boeking terugzetten moet opnieuw passen", () => {
    const geannuleerd = { ...b, status: "geannuleerd" as const };
    const ander = boeking("2026-05-02", "2026-05-04");
    expect(wisselStatus(geannuleerd, "gereserveerd", kamer(), [geannuleerd, ander], NU).ok).toBe(false);
    expect(wisselStatus(geannuleerd, "gereserveerd", kamer({ gearchiveerd: true }), [geannuleerd], NU).ok).toBe(false);
    expect(wisselStatus(geannuleerd, "gereserveerd", kamer(), [geannuleerd], NU).ok).toBe(true);
  });
});

describe("dagoverzicht en kalender", () => {
  const dag = "2026-05-10";
  const lijst = [
    boeking(dag, "2026-05-12"),
    boeking(dag, "2026-05-12", { status: "ingecheckt" }),
    boeking("2026-05-08", dag, { status: "ingecheckt" }),
    boeking("2026-05-08", dag, { status: "uitgecheckt" }),
    boeking(dag, "2026-05-12", { status: "geannuleerd" }),
  ];
  it("aankomsten zijn gereserveerd, vertrekken zijn ingecheckt", () => {
    expect(aankomstenOp(lijst, dag)).toHaveLength(1);
    expect(vertrekkenOp(lijst, dag)).toHaveLength(1);
  });
  it("de kalenderrij toont de nachten en niet de vertrekdag", () => {
    const b = boeking("2026-05-11", "2026-05-13");
    const rij = kalenderRij([b], K1, dagenVanaf("2026-05-10", 5));
    expect(rij.map((c) => c.boeking?.id ?? null)).toEqual([null, b.id, b.id, null, null]);
    expect(rij.map((c) => c.begin)).toEqual([false, true, false, false, false]);
    expect(boekingInNacht([b], K1, "2026-05-13")).toBeUndefined();
  });
  it("twee aansluitende boekingen zijn twee blokken", () => {
    const a = boeking("2026-05-10", "2026-05-12");
    const c = boeking("2026-05-12", "2026-05-14");
    expect(kalenderRij([a, c], K1, dagenVanaf("2026-05-10", 4)).map((x) => x.begin)).toEqual([true, false, true, false]);
  });
  it("toekomstige boekingen: gereserveerd of ingecheckt met vertrek na vandaag", () => {
    const l = [boeking("2026-11-10", "2026-11-14", { status: "ingecheckt" }), boeking("2026-11-01", "2026-11-12"), boeking("2026-12-01", "2026-12-03", { status: "geannuleerd" }), boeking("2026-12-01", "2026-12-03", { kamerId: K2 })];
    expect(toekomstigeBoekingen(l, K1, "2026-11-12")).toHaveLength(1);
  });
});

describe("persoonsgegevens", () => {
  it("wissen laat de boeking staan als lege regel", () => {
    const b = boeking("2026-05-01", "2026-05-03");
    const w = wisGastgegevens(b, NU);
    expect(w).toMatchObject({ naam: "", telefoon: "", email: "", opmerking: "", kamerId: K1, aankomst: "2026-05-01", vertrek: "2026-05-03", personen: 2, gastGewistOp: NU.toISOString() });
    expect(wisGastgegevens(w, new Date("2027-01-01T00:00:00Z"))).toBe(w);
    expect(bezetting([kamer()], [w], "2026-05-01", "2026-05-02")).toMatchObject({ ok: true, waarde: { bezet: 2 } });
  });
  it("bewaartermijn: alleen uitgecheckt, langer dan twee jaar geleden vertrokken, nog niet gewist", () => {
    const vandaag = "2026-11-12";
    const oud = boeking("2024-11-01", "2024-11-03", { status: "uitgecheckt" });
    const randGrens = boeking("2024-11-10", "2024-11-12", { status: "uitgecheckt" });
    const net = boeking("2024-11-11", "2024-11-13", { status: "uitgecheckt" });
    const gewist = wisGastgegevens(boeking("2023-01-01", "2023-01-03", { status: "uitgecheckt" }), NU);
    const nietUit = boeking("2023-01-01", "2023-01-03", { status: "geannuleerd" });
    const r = teWissenNaBewaartermijn([oud, randGrens, net, gewist, nietUit], vandaag);
    expect(r.map((b) => b.id)).toEqual([oud.id]);
  });
});
