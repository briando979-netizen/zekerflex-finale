import { describe, expect, it } from "vitest";
import { controleCijfer, leesMrz, leesMrzUitTekst, naamVoluit, zelfdeNummer, zoekMrz } from "@/lib/kyc/mrz";

// vaste "vandaag": een test met datums mag geen tijdbom zijn (AGENTS.md)
const NU = new Date("2026-11-09T12:00:00+01:00");

// Officiële voorbeelden uit ICAO 9303 (fictief land UTO), met bekende controlecijfers.
const TD3 = ["P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "L898902C36UTO7408122F1204159ZE184226B<<<<<10"];
const TD1 = ["I<UTOD231458907<<<<<<<<<<<<<<<", "7408122F1204159UTO<<<<<<<<<<<6", "ERIKSSON<<ANNA<MARIA<<<<<<<<<<"];

/** Bouwt een Nederlandse ID-kaart-MRZ (TD1) met kloppende controlecijfers. */
function nlKaart(o: { nummer: string; bsn: string; geboren: string; verval: string; naam: string }): string[] {
  const c = (s: string) => String(controleCijfer(s));
  const r1 = `I<NLD${o.nummer}${c(o.nummer)}${o.bsn}`.padEnd(30, "<");
  const kop2 = `${o.geboren}${c(o.geboren)}M${o.verval}${c(o.verval)}NLD`;
  const vrij2 = "<".repeat(11);
  const totaal = c(r1.slice(5, 30) + kop2.slice(0, 7) + kop2.slice(8, 15) + vrij2);
  return [r1, `${kop2}${vrij2}${totaal}`, o.naam.padEnd(30, "<")];
}

const BRIANDO = nlKaart({ nummer: "IXA12B3C4", bsn: "999999990", geboren: "030616", verval: "340312", naam: "VAN<ESSEN<<BRIANDO" });

describe("controlecijfer (ICAO 9303)", () => {
  it("rekent de bekende voorbeelden goed uit", () => {
    expect(controleCijfer("L898902C3")).toBe(6);
    expect(controleCijfer("740812")).toBe(2);
    expect(controleCijfer("120415")).toBe(9);
    expect(controleCijfer("ZE184226B<<<<<")).toBe(1);
    expect(controleCijfer("D23145890")).toBe(7);
  });
});

describe("leesMrz", () => {
  it("leest het ICAO-paspoort (TD3) en ziet dat het verlopen is", () => {
    const u = leesMrz("TD3", TD3, NU)!;
    expect(u).toMatchObject({
      soort: "PASSPORT",
      land: "UTO",
      documentnummer: "L898902C3",
      achternaam: "ERIKSSON",
      voornamen: "ANNA MARIA",
      geboortedatum: "1974-08-12",
      vervaldatum: "2012-04-15",
      geslacht: "V",
      geldig: true,
      verlopen: true,
    });
  });

  it("leest de ICAO-ID-kaart (TD1)", () => {
    const u = leesMrz("TD1", TD1, NU)!;
    expect(u.soort).toBe("ID_CARD");
    expect(u.documentnummer).toBe("D23145890");
    expect(u.controles).toEqual({ documentnummer: true, geboortedatum: true, vervaldatum: true, totaal: true });
  });

  it("leest een geldige Nederlandse ID-kaart en geeft het BSN nergens terug", () => {
    const u = leesMrz("TD1", BRIANDO, NU)!;
    expect(u).toMatchObject({
      land: "NLD",
      documentnummer: "IXA12B3C4",
      geboortedatum: "2003-06-16",
      vervaldatum: "2034-03-12",
      achternaam: "VAN ESSEN",
      voornamen: "BRIANDO",
      geldig: true,
      verlopen: false,
    });
    expect(JSON.stringify(u)).not.toContain("999999990");
  });

  it("ziet een verkeerd controlecijfer", () => {
    const kapot = [BRIANDO[0]!, BRIANDO[1]!.slice(0, 14) + "0" + BRIANDO[1]!.slice(15), BRIANDO[2]!];
    const u = leesMrz("TD1", kapot, NU)!;
    expect(u.controles.vervaldatum).toBe(false);
    expect(u.geldig).toBe(false);
  });

  it("weigert regels van de verkeerde lengte", () => {
    expect(leesMrz("TD1", [BRIANDO[0]!, BRIANDO[1]!], NU)).toBeNull();
  });
});

describe("leesMrzUitTekst (met OCR-ruis)", () => {
  it("vindt de MRZ tussen andere tekst, ondanks spaties, « en weggevallen vulling", () => {
    const ocr = [
      "KONINKRIJK DER NEDERLANDEN",
      "Identiteitskaart",
      BRIANDO[0]!.replace(/<+$/, "").replace(/<</g, "«"),
      BRIANDO[1]!.slice(0, 15) + " " + BRIANDO[1]!.slice(15),
      BRIANDO[2]!.replace(/<+$/, ""),
    ].join("\n");
    const u = leesMrzUitTekst(ocr, NU)!;
    expect(u.geldig).toBe(true);
    expect(u.vervaldatum).toBe("2034-03-12");
  });

  it("herstelt een 0 die als O is gelezen in de datum, en een B die als 8 is gelezen in het nummer", () => {
    const r2 = BRIANDO[1]!.replace(/^03/, "O3");
    const r1 = BRIANDO[0]!.replace("12B3", "1283");
    const u = leesMrzUitTekst([r1, r2, BRIANDO[2]!].join("\n"), NU)!;
    expect(u.geboortedatum).toBe("2003-06-16");
    expect(u.documentnummer).toBe("IXA12B3C4");
    expect(u.geldig).toBe(true);
  });

  it("gokt niet bij een dubbelzinnige verwisseling (I/1 op twee plekken met hetzelfde gewicht)", () => {
    const r1 = BRIANDO[0]!.replace("A12", "AI2");
    const u = leesMrzUitTekst([r1, BRIANDO[1]!, BRIANDO[2]!].join("\n"), NU)!;
    expect(u.documentnummer).toBe("IXAI2B3C4");
    expect(u.controles.documentnummer).toBe(false);
    expect(u.geldig).toBe(false);
  });

  it("maakt van een O in een Nederlands documentnummer een 0", () => {
    const kaart = nlKaart({ nummer: "SPECI2014", bsn: "999999990", geboren: "650310", verval: "310101", naam: "DE<BRUIJN<<WILLEKE<LISELOTTE" });
    const u = leesMrzUitTekst([kaart[0]!.replace("2014", "2O14"), kaart[1]!, kaart[2]!].join("\n"), NU)!;
    expect(u.documentnummer).toBe("SPECI2014");
    expect(u.geldig).toBe(true);
  });

  it("schuift een los teken vóór de middelste regel weg (zoals de echte OCR deed)", () => {
    const u = leesMrzUitTekst([BRIANDO[0]!, "Q" + BRIANDO[1]!, BRIANDO[2]!].join("\n"), NU)!;
    expect(u.geldig).toBe(true);
    expect(u.vervaldatum).toBe("2034-03-12");
  });

  it("een verkeerd gelezen cijfer in het vrije (BSN-)veld: velden geldig, maar niet volledig", () => {
    const r1 = BRIANDO[0]!.replace("999999990", "999999998");
    const u = leesMrzUitTekst([r1, BRIANDO[1]!, BRIANDO[2]!].join("\n"), NU)!;
    expect(u.geldig).toBe(true);
    expect(u.volledig).toBe(false);
    expect(u.controles.totaal).toBe(false);
  });

  it("geeft null bij gewone tekst", () => {
    expect(leesMrzUitTekst("Dit is een bon van de bouwmarkt\nTotaal 12,50\n", NU)).toBeNull();
    expect(zoekMrz("")).toBeNull();
  });

  it("vindt ook een paspoort (TD3) in OCR-tekst", () => {
    const u = leesMrzUitTekst(`PASPOORT\n${TD3[0]}\n${TD3[1]}\n`, NU)!;
    expect(u.formaat).toBe("TD3");
    expect(u.geldig).toBe(true);
  });
});

describe("hulpjes", () => {
  it("vergelijkt documentnummers zonder op O/0 en spaties te struikelen", () => {
    expect(zelfdeNummer("ixa12b3c4", "IXA12B3C4")).toBe(true);
    expect(zelfdeNummer("SPECI2O14", "SPECI2014")).toBe(true);
    expect(zelfdeNummer("SPECI2014", "SPECI2015")).toBe(false);
    expect(zelfdeNummer("", "")).toBe(false);
  });

  it("maakt een leesbare naam", () => {
    expect(naamVoluit({ achternaam: "VAN ESSEN", voornamen: "BRIANDO" })).toBe("Briando Van Essen");
  });
});
