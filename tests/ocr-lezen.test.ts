import { describe, expect, it } from "vitest";
import { alleDatums, leesBtw, leesDatum, leesDocument, leesKvk, leesNummer } from "@/lib/ocr/lezen";

// Documenten lezen (lib/ocr/lezen.ts): de velden uit de tekst die tesseract
// teruggeeft. De twee lange teksten zijn letterlijk wat de OCR van een
// gerenderd proefdiploma en een proefbon maakte (4 nov 2026), inclusief de
// leesfout "NLO01234567BOl1".

const DIPLOMA = `STICHTING SAMENWERKEN VOOR VEILIGHEID
Basisveiligheid VCA (B-VCA)

Hierbij wordt verklaard dat

N. van Dijk

geboren op 14-03-1991, met goed gevolg het examen heeft afgelegd.
Diplomanummer: 28837.5591.4

Examendatum: 12 mei 2024

Geldig tot: 12-05-2034
`;

const BON = `TANKSTATION DE VAART
Stationsweg 12, Zonnedorp
Datum: 03-11-2026 14:52
Pomp 4 Euro 95 E10
38,21 L x 2,019
TOTAAL EUR 77,15
BTW 21% 13,39
Betaald: PIN
KVK 12345678 BTW NLO01234567BOl1
`;

describe("datums", () => {
  it("leest Nederlandse en Engelse datums in alle gangbare vormen", () => {
    expect(leesDatum("12-05-2034")).toBe("2034-05-12");
    expect(leesDatum("12/05/2034")).toBe("2034-05-12");
    expect(leesDatum("12.05.2034")).toBe("2034-05-12");
    expect(leesDatum("2034-05-12")).toBe("2034-05-12");
    expect(leesDatum("12 mei 2034")).toBe("2034-05-12");
    expect(leesDatum("1 maart 2030")).toBe("2030-03-01");
    expect(leesDatum("3 Sept. 2027")).toBe("2027-09-03");
    expect(leesDatum("12 May 2034")).toBe("2034-05-12");
    expect(leesDatum("geen datum")).toBeNull();
    expect(leesDatum("31-13-2030")).toBeNull();
  });

  it("herstelt een O of l die de OCR voor een 0 of 1 aanzag", () => {
    expect(leesDatum("12-O5-2O34")).toBe("2034-05-12");
    expect(leesDatum("l2-05-2034")).toBe("2034-05-12");
  });

  it("vindt alle datums in volgorde", () => {
    expect(alleDatums(DIPLOMA)).toEqual(["1991-03-14", "2024-05-12", "2034-05-12"]);
  });
});

describe("nummers", () => {
  it("leest het diplomanummer, KVK en btw-id", () => {
    expect(leesNummer(DIPLOMA)).toBe("28837.5591.4");
    expect(leesNummer("Certificaatnr.: AB-12345/7")).toBe("AB-12345/7");
    expect(leesNummer("zonder label 12345")).toBeNull();
    expect(leesKvk(BON)).toBe("12345678");
    expect(leesKvk("KvK-nummer: 87654321")).toBe("87654321");
    expect(leesBtw(BON)).toBe("NL001234567B01");
    expect(leesBtw("btw: NL 001.234.567 B 01")).toBe("NL001234567B01");
    expect(leesBtw("niets")).toBeNull();
  });
});

describe("het hele document", () => {
  it("herkent een VCA-diploma met nummer, examendatum en vervaldatum", () => {
    const g = leesDocument(DIPLOMA);
    expect(g.soort).toBe("certificaat");
    expect(g.certType).toBe("VCA_BASIS");
    expect(g.nummer).toBe("28837.5591.4");
    expect(g.afgegevenOp).toBe("2024-05-12");
    expect(g.geldigTot).toBe("2034-05-12");
    expect(g.bedragCents).toBeNull();
  });

  it("herkent een bon met totaal, datum, KVK en btw", () => {
    const g = leesDocument(BON);
    expect(g.soort).toBe("bon");
    expect(g.bedragCents).toBe(7715);
    expect(g.bonDatum).toBe("2026-11-03");
    expect(g.kvk).toBe("12345678");
    expect(g.btw).toBe("NL001234567B01");
    expect(g.certType).toBeNull();
  });

  it("kent VCA VOL, BHV, heftruck en rijbewijs C", () => {
    expect(leesDocument("Diploma VCA VOL\nGeldig tot 1-1-2030").certType).toBe("VCA_VOL");
    expect(leesDocument("Certificaat Bedrijfshulpverlener\nverloopt op 01-02-2027").geldigTot).toBe("2027-02-01");
    expect(leesDocument("BHV").certType).toBe("BHV");
    expect(leesDocument("Veilig werken met de vorkheftruck").certType).toBe("HEFTRUCK");
    expect(leesDocument("Rijbewijs C + Code 95").certType).toBe("RIJBEWIJS_C");
  });

  it("valt bij een certificaat zonder labels terug op de eerste en laatste datum", () => {
    const g = leesDocument("EHBO-diploma\n01-06-2025\n01-06-2027");
    expect(g.afgegevenOp).toBe("2025-06-01");
    expect(g.geldigTot).toBe("2027-06-01");
  });

  it("geeft onbekend terug bij een tekst zonder houvast", () => {
    const g = leesDocument("Lorem ipsum dolor sit amet");
    expect(g.soort).toBe("onbekend");
    expect(g.datums).toEqual([]);
    expect(g.nummer).toBeNull();
  });
});
