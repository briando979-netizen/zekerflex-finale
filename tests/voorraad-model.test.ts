import { describe, expect, it } from "vitest";
import {
  bestelTekst,
  bestellijst,
  csvTekst,
  filterEnSorteer,
  isBijnaOp,
  isOp,
  leesGetal,
  skuBezet,
  valideerArtikel,
  valideerMutatie,
  voorraadCsv,
  voorraadWaarde,
  type Artikel,
} from "@/lib/voorraad/model";

const art = (over: Partial<Artikel> = {}): Artikel => ({
  id: "aaaaaaaaaaaa",
  naam: "Verf wit",
  sku: "",
  eenheid: "stuk",
  aantal: 10,
  begin: 10,
  minimum: 0,
  kostprijsCent: null,
  leverancier: "",
  locatie: "",
  notitie: "",
  gearchiveerd: false,
  gemaaktOp: "2026-11-12T06:00:00.000Z",
  bijgewerktOp: "2026-11-12T06:00:00.000Z",
  ...over,
});

const fout = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

describe("leesGetal", () => {
  it("leest een Nederlandse komma en weigert onzin", () => {
    expect(leesGetal("12,5")).toBe(12.5);
    expect(leesGetal(3)).toBe(3);
    expect(leesGetal("abc")).toBeNaN();
    expect(leesGetal("1e3")).toBeNaN();
    expect(leesGetal(Infinity)).toBeNaN();
    expect(leesGetal(null)).toBeNaN();
  });
});

describe("valideerArtikel", () => {
  const goed = { naam: "Verf wit", eenheid: "liter", aantal: "2,5", minimum: "1", kostprijsCent: 1250 };
  it("neemt een goed artikel aan en maakt de tekst schoon", () => {
    const v = valideerArtikel({ ...goed, naam: "  Verf   wit ", sku: " ab-1 ", notitie: "x".repeat(300) }, { metAantal: true });
    expect(v).toMatchObject({ naam: "Verf wit", sku: "ab-1", eenheid: "liter", aantal: 2.5, minimum: 1, kostprijsCent: 1250 });
  });
  it("vraagt een naam van 2 tot 80 tekens", () => {
    expect(fout(() => valideerArtikel({ ...goed, naam: "a" }, { metAantal: true }))).toMatch(/minstens 2/);
    expect(fout(() => valideerArtikel({ ...goed, naam: "a".repeat(81) }, { metAantal: true }))).toMatch(/te lang/);
  });
  it("kent alleen de vaste eenheden", () => {
    expect(fout(() => valideerArtikel({ ...goed, eenheid: "pallet" }, { metAantal: true }))).toMatch(/Kies een eenheid/);
  });
  it("staat decimalen alleen toe bij liter, kilo en meter", () => {
    expect(fout(() => valideerArtikel({ ...goed, eenheid: "stuk", aantal: "2,5" }, { metAantal: true }))).toMatch(/heel getal/);
    expect(fout(() => valideerArtikel({ ...goed, eenheid: "doos", minimum: "0,5" }, { metAantal: true }))).toMatch(/heel getal/);
    expect(fout(() => valideerArtikel({ ...goed, aantal: "1,2345" }, { metAantal: true }))).toMatch(/drie cijfers/);
  });
  it("weigert een negatief aantal of minimum en een onzinprijs", () => {
    expect(fout(() => valideerArtikel({ ...goed, aantal: -1 }, { metAantal: true }))).toMatch(/onder nul/);
    expect(fout(() => valideerArtikel({ ...goed, minimum: -1 }, { metAantal: true }))).toMatch(/onder nul/);
    expect(fout(() => valideerArtikel({ ...goed, kostprijsCent: 1.5 }, { metAantal: true }))).toMatch(/kostprijs/);
    expect(fout(() => valideerArtikel({ ...goed, kostprijsCent: -5 }, { metAantal: true }))).toMatch(/kostprijs/);
    expect(fout(() => valideerArtikel({ ...goed, aantal: "abc" }, { metAantal: true }))).toMatch(/getal/);
  });
  it("laat het aantal buiten beschouwing bij bewerken", () => {
    expect(valideerArtikel({ ...goed, aantal: "onzin" }, { metAantal: false }).aantal).toBe(0);
  });
  it("kostprijs, leverancier en locatie zijn niet verplicht", () => {
    const v = valideerArtikel({ naam: "Tape", eenheid: "set" }, { metAantal: true });
    expect(v).toMatchObject({ kostprijsCent: null, leverancier: "", locatie: "", sku: "", aantal: 0, minimum: 0 });
  });
});

describe("skuBezet", () => {
  const lijst = [{ id: "a", sku: "AB-1" }, { id: "b", sku: "" }];
  it("vergelijkt zonder hoofdletters en laat het eigen artikel met rust", () => {
    expect(skuBezet("ab-1", lijst)).toBe(true);
    expect(skuBezet(" Ab-1 ", lijst)).toBe(true);
    expect(skuBezet("ab-1", lijst, "a")).toBe(false);
    expect(skuBezet("ab-2", lijst)).toBe(false);
  });
  it("een leeg nummer botst nooit", () => expect(skuBezet("", lijst)).toBe(false));
});

describe("valideerMutatie", () => {
  it("inkoop telt erbij, verkoop, gebruikt en verlies halen eraf", () => {
    expect(valideerMutatie("stuk", 5, { reden: "inkoop", hoeveelheid: 3 })).toMatchObject({ verschil: 3, nieuw: 8 });
    for (const reden of ["verkoop", "gebruikt", "verlies"]) expect(valideerMutatie("stuk", 5, { reden, hoeveelheid: 2 })).toMatchObject({ verschil: -2, nieuw: 3 });
  });
  it("laat het aantal niet onder nul komen", () => {
    expect(fout(() => valideerMutatie("stuk", 1, { reden: "verkoop", hoeveelheid: 2 }))).toMatch(/Zo veel ligt er niet/);
    expect(valideerMutatie("stuk", 2, { reden: "verkoop", hoeveelheid: 2 }).nieuw).toBe(0);
  });
  it("een telling zet een absolute waarde en logt het verschil", () => {
    expect(valideerMutatie("stuk", 7, { reden: "telling", hoeveelheid: 4 })).toMatchObject({ verschil: -3, nieuw: 4 });
    expect(valideerMutatie("stuk", 7, { reden: "telling", hoeveelheid: 0 })).toMatchObject({ verschil: -7, nieuw: 0 });
    expect(fout(() => valideerMutatie("stuk", 7, { reden: "telling", hoeveelheid: -1 }))).toMatch(/onder nul/);
  });
  it("een correctie heeft een teken en mag onder nul uitkomen", () => {
    expect(valideerMutatie("stuk", 1, { reden: "correctie", hoeveelheid: -3 })).toMatchObject({ verschil: -3, nieuw: -2 });
    expect(fout(() => valideerMutatie("stuk", 1, { reden: "correctie", hoeveelheid: 0 }))).toMatch(/verandert niets/);
  });
  it("weigert 0 of negatief bij een gewone reden en een onbekende reden", () => {
    expect(fout(() => valideerMutatie("stuk", 5, { reden: "inkoop", hoeveelheid: 0 }))).toMatch(/groter dan 0/);
    expect(fout(() => valideerMutatie("stuk", 5, { reden: "inkoop", hoeveelheid: -2 }))).toMatch(/groter dan 0/);
    expect(fout(() => valideerMutatie("stuk", 5, { reden: "weggegeven", hoeveelheid: 2 }))).toMatch(/Kies een reden/);
  });
  it("decimalen bij stuks worden geweigerd, bij liters niet; de som blijft schoon", () => {
    expect(fout(() => valideerMutatie("stuk", 5, { reden: "inkoop", hoeveelheid: "1,5" }))).toMatch(/heel getal/);
    expect(valideerMutatie("liter", 0.1, { reden: "inkoop", hoeveelheid: "0,2" }).nieuw).toBe(0.3);
  });
  it("kapt de opmerking af op 200 tekens", () => {
    expect(valideerMutatie("stuk", 5, { reden: "inkoop", hoeveelheid: 1, opmerking: "x".repeat(300) }).opmerking).toHaveLength(200);
  });
});

describe("bijna op en op", () => {
  it("bijna op: aantal gelijk aan of onder het minimum, en minimum groter dan 0", () => {
    expect(isBijnaOp(art({ aantal: 5, minimum: 5 }))).toBe(true);
    expect(isBijnaOp(art({ aantal: 6, minimum: 5 }))).toBe(false);
    expect(isBijnaOp(art({ aantal: 0, minimum: 0 }))).toBe(false);
  });
  it("op: aantal 0 (of lager)", () => {
    expect(isOp(art({ aantal: 0 }))).toBe(true);
    expect(isOp(art({ aantal: -1 }))).toBe(true);
    expect(isOp(art({ aantal: 1 }))).toBe(false);
  });
});

describe("voorraadWaarde", () => {
  it("telt alleen artikelen met kostprijs en zegt hoeveel er zonder zijn", () => {
    const w = voorraadWaarde([art({ aantal: 4, kostprijsCent: 250 }), art({ id: "b", aantal: 2, kostprijsCent: null }), art({ id: "c", aantal: 1.5, eenheid: "kilo", kostprijsCent: 333 })]);
    expect(w).toEqual({ totaalCent: 1000 + 500, metPrijs: 2, zonderPrijs: 1 });
  });
  it("een negatief aantal en een gearchiveerd artikel tellen niet mee", () => {
    expect(voorraadWaarde([art({ aantal: -3, kostprijsCent: 100 }), art({ id: "b", aantal: 5, kostprijsCent: 100, gearchiveerd: true })])).toEqual({ totaalCent: 0, metPrijs: 1, zonderPrijs: 0 });
  });
});

describe("bestellijst", () => {
  const lijst = [
    art({ id: "a", naam: "Schroeven", aantal: 2, minimum: 10, leverancier: "Bouwmarkt", sku: "S-1" }),
    art({ id: "b", naam: "Kit", aantal: 1, minimum: 1, leverancier: "" }),
    art({ id: "c", naam: "Plug", aantal: 50, minimum: 10, leverancier: "Bouwmarkt" }),
    art({ id: "d", naam: "Boor", aantal: 0, minimum: 2, leverancier: "Bouwmarkt", gearchiveerd: true }),
  ];
  it("groepeert per leverancier met het tekort, onbekend onderaan, zonder gearchiveerde", () => {
    const g = bestellijst(lijst);
    expect(g.map((x) => x.leverancier)).toEqual(["Bouwmarkt", "Leverancier onbekend"]);
    expect(g[0]!.regels).toHaveLength(1);
    expect(g[0]!.regels[0]).toMatchObject({ tekort: 8 });
    expect(g[1]!.regels[0]!.tekort).toBe(0);
  });
  it("maakt kopieerbare tekst", () => {
    expect(bestelTekst(bestellijst(lijst))).toBe("Bouwmarkt\n- Schroeven (S-1): nu 2, minimum 10, tekort 8 stuks\n\nLeverancier onbekend\n- Kit: nu 1, minimum 1, op het minimum");
    expect(bestelTekst([])).toBe("Niets te bestellen.");
  });
});

describe("filterEnSorteer", () => {
  const lijst = [
    art({ id: "a", naam: "Appel", aantal: 5, minimum: 5, sku: "X1", leverancier: "Fruitco", kostprijsCent: 100 }),
    art({ id: "b", naam: "Banaan", aantal: 0, kostprijsCent: 500 }),
    art({ id: "c", naam: "Citroen", aantal: 20 }),
    art({ id: "d", naam: "Druif", aantal: 3, gearchiveerd: true }),
  ];
  it("verbergt gearchiveerde artikelen tenzij gevraagd", () => {
    expect(filterEnSorteer(lijst).map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(filterEnSorteer(lijst, { metGearchiveerd: true })).toHaveLength(4);
  });
  it("zoekt op naam, artikelnummer en leverancier zonder hoofdletters", () => {
    expect(filterEnSorteer(lijst, { zoek: "ban" }).map((a) => a.id)).toEqual(["b"]);
    expect(filterEnSorteer(lijst, { zoek: "x1" }).map((a) => a.id)).toEqual(["a"]);
    expect(filterEnSorteer(lijst, { zoek: "FRUIT" }).map((a) => a.id)).toEqual(["a"]);
  });
  it("filtert op bijna op en op", () => {
    expect(filterEnSorteer(lijst, { filter: "bijna" }).map((a) => a.id)).toEqual(["a"]);
    expect(filterEnSorteer(lijst, { filter: "op" }).map((a) => a.id)).toEqual(["b"]);
  });
  it("sorteert op aantal en waarde, ook aflopend", () => {
    expect(filterEnSorteer(lijst, { sortering: "aantal", aflopend: true }).map((a) => a.id)).toEqual(["c", "a", "b"]);
    expect(filterEnSorteer(lijst, { sortering: "waarde", aflopend: true }).map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(filterEnSorteer(lijst, { aflopend: true }).map((a) => a.id)).toEqual(["c", "b", "a"]);
  });
});

describe("CSV", () => {
  it("zet een cel die met = + - @ begint een apostrof voor (CSV-injectie)", () => {
    for (const s of ["=1+1", "+31", "-2", "@SOM(A1)", "\t=x"]) expect(csvTekst(s).startsWith("'")).toBe(true);
    expect(csvTekst("gewoon")).toBe("gewoon");
  });
  it("zet cellen met ; \" of een regeleinde tussen aanhalingstekens", () => {
    expect(csvTekst("a;b")).toBe('"a;b"');
    expect(csvTekst('zeg "hoi"')).toBe('"zeg ""hoi"""');
    expect(csvTekst("regel1\nregel2")).toBe('"regel1\nregel2"');
    expect(csvTekst("=a;b")).toBe(`"'=a;b"`);
  });
  it("bouwt een bestand voor Excel: BOM, puntkomma, Nederlandse komma's, CRLF", () => {
    const csv = voorraadCsv([art({ naam: "=HYPERLINK(x)", aantal: 2.5, eenheid: "kilo", minimum: 3, kostprijsCent: 199, leverancier: "A;B" }), art({ id: "b", naam: "Oud", gearchiveerd: true })]);
    expect(csv.startsWith("﻿Naam;Artikelnummer;")).toBe(true);
    const regels = csv.trim().split("\r\n");
    expect(regels).toHaveLength(2);
    expect(regels[1]).toBe(`'=HYPERLINK(x);;kilo;2,5;3;1,99;4,98;Bijna op;"A;B";;`);
  });
  it("een negatief aantal blijft een getal, zonder apostrof", () => {
    const csv = voorraadCsv([art({ aantal: -2 })]);
    expect(csv).toContain(";stuk;-2;");
  });
});
