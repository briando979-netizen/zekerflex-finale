import { describe, expect, it } from "vitest";
import {
  emmerSleutel,
  emmerWoord,
  emmersVoorNaam,
  isAnders,
  leesBedrijf,
  leesVraag,
  normaliseer,
  plaatsSleutel,
  rangschik,
  schoonKvk,
  schoonVestiging,
  scoor,
  voegSamen,
  voegToe,
} from "@/lib/kvk/normaliseer";
import type { KvkBedrijf } from "@/lib/kvk/types";

const bedrijf = (over: Partial<KvkBedrijf> = {}): KvkBedrijf => ({
  kvk: "12345678",
  naam: "Bakkerij Jansen B.V.",
  handelsnaam: null,
  rechtsvorm: null,
  straat: null,
  huisnummer: null,
  postcode: null,
  plaats: "Utrecht",
  btw: null,
  actief: null,
  bron: "kvkbase",
  bijgewerkt: "2026-11-01T10:00:00.000Z",
  ...over,
});

describe("normaliseer", () => {
  it("is hoofdletter- en accentongevoelig", () => {
    expect(normaliseer("Café Zoë B.V.")).toBe("cafe zoe bv");
    expect(normaliseer("  'T Hoekje & Zn. ")).toBe("t hoekje en zn");
  });
});

describe("schoonKvk en schoonVestiging", () => {
  it("leest een KVK-nummer met spaties, punten en streepjes", () => {
    expect(schoonKvk("12345678")).toBe("12345678");
    expect(schoonKvk("1234 5678")).toBe("12345678");
    expect(schoonKvk("12.34.56.78")).toBe("12345678");
    expect(schoonKvk("1234-5678")).toBe("12345678");
    expect(schoonKvk("KVK: 12345678")).toBe("12345678");
  });
  it("weigert alles wat geen 8 cijfers is", () => {
    expect(schoonKvk("1234567")).toBeNull();
    expect(schoonKvk("123456789")).toBeNull();
    expect(schoonKvk("Bakker 12345678")).toBeNull();
    expect(schoonKvk("")).toBeNull();
  });
  it("leest een vestigingsnummer van 12 cijfers", () => {
    expect(schoonVestiging("0000 1234 5678")).toBe("000012345678");
    expect(schoonVestiging("12345678")).toBeNull();
  });
});

describe("leesVraag", () => {
  it("onderscheidt nummer, vestiging, naam en te kort", () => {
    expect(leesVraag("1234 5678")).toEqual({ soort: "kvk", kvk: "12345678" });
    expect(leesVraag("000012345678")).toEqual({ soort: "vestiging", vestiging: "000012345678" });
    expect(leesVraag("Bakkerij Utrecht")).toEqual({ soort: "naam", woorden: ["bakkerij", "utrecht"] });
    expect(leesVraag("ab")).toEqual({ soort: "leeg" });
    expect(leesVraag("   ")).toEqual({ soort: "leeg" });
  });
});

describe("emmers", () => {
  it("een naam komt in een emmer per woord van minstens 3 tekens, hooguit 4", () => {
    expect(emmersVoorNaam("Bakkerij Jansen B.V.")).toEqual(["kvk-index:n:bak", "kvk-index:n:jan"]);
    expect(emmersVoorNaam("a b c dd een twee drie vier vijf zes")).toEqual(["kvk-index:n:een", "kvk-index:n:twe", "kvk-index:n:dri", "kvk-index:n:vie"]);
  });
  it("een emmer blijft begrensd en vervangt hetzelfde nummer", () => {
    let emmer = [{ k: "00000001", n: "a", p: "" }];
    for (let i = 2; i <= 6; i++) emmer = voegToe(emmer, { k: `0000000${i}`, n: "x", p: "" }, 3);
    expect(emmer.map((e) => e.k)).toEqual(["00000004", "00000005", "00000006"]);
    emmer = voegToe(emmer, { k: "00000005", n: "nieuw", p: "" }, 3);
    expect(emmer.map((e) => e.k)).toEqual(["00000004", "00000006", "00000005"]);
    expect(emmer.at(-1)?.n).toBe("nieuw");
  });
  it("het langste woord kiest de emmer", () => {
    expect(emmerWoord(["bakkerij", "ut", "jansen"])).toBe("bakkerij");
    expect(emmerWoord(["ab"])).toBeNull();
    expect(emmerSleutel("bakkerij")).toBe("kvk-index:n:bak");
    expect(plaatsSleutel("Den Haag")).toBe("kvk-index:p:denhaag");
  });
});

describe("zoeken en rangschikken", () => {
  const lijst = [
    { n: "Jansen Bakkerij", p: "Gouda" },
    { n: "Bakkerij Jansen B.V.", p: "Utrecht" },
    { n: "Bakkersgilde", p: "Utrecht" },
    { n: "Slagerij Jansen", p: "Utrecht" },
  ];
  it("voorvoegsel en plaats werken samen", () => {
    expect(rangschik(lijst, ["bakk", "utr"], 8).map((i) => i.n).sort()).toEqual(["Bakkerij Jansen B.V.", "Bakkersgilde"]);
  });
  it("een naam die begint zoals ingetikt staat voorop", () => {
    expect(rangschik(lijst, ["bakkerij", "jansen"], 8)[0]?.n).toBe("Bakkerij Jansen B.V.");
  });
  it("alleen een plaats vindt alles daar", () => {
    expect(rangschik(lijst, ["utrecht"], 8)).toHaveLength(3);
  });
  it("is accentongevoelig en een woord moet kloppen", () => {
    expect(scoor({ n: "Café Zoë", p: "" }, ["cafe"])).not.toBeNull();
    expect(scoor({ n: "Café Zoë", p: "" }, ["zoe", "rotterdam"])).toBeNull();
  });
  it("een plaats van twee woorden telt per woord", () => {
    expect(scoor({ n: "Visje", p: "Den Haag" }, ["vis", "haag"])).not.toBeNull();
  });
  it("kapt af op het maximum", () => {
    expect(rangschik(lijst, ["jansen"], 2)).toHaveLength(2);
  });
});

describe("records", () => {
  it("leest alleen een geldig record", () => {
    expect(leesBedrijf(null)).toBeNull();
    expect(leesBedrijf({ kvk: "123", naam: "X" })).toBeNull();
    expect(leesBedrijf({ kvk: "12345678", naam: "" })).toBeNull();
    const b = leesBedrijf({ kvk: "12345678", naam: "Acme", postcode: "1012ab", btw: "nl123", bron: "x" });
    expect(b?.postcode).toBe("1012 AB");
    expect(b?.btw).toBeNull();
    expect(b?.bron).toBe("kvkbase");
  });
  it("voegSamen: nieuw wint, leeg wist niets, een tenantnaam wint niet van het register", () => {
    const oud = bedrijf({ straat: "Oudegracht", huisnummer: "1" });
    const nieuw = bedrijf({ straat: null, naam: "Andere naam", bron: "bestaand" });
    const samen = voegSamen(oud, nieuw);
    expect(samen.straat).toBe("Oudegracht");
    expect(samen.naam).toBe("Bakkerij Jansen B.V.");
    expect(samen.bron).toBe("kvkbase");
    expect(voegSamen(null, nieuw)).toBe(nieuw);
  });
  it("isAnders: alleen schrijven bij een verschil of na 30 dagen", () => {
    const oud = bedrijf();
    expect(isAnders(oud, bedrijf({ bijgewerkt: "2026-11-05T10:00:00.000Z" }))).toBe(false);
    expect(isAnders(oud, bedrijf({ bijgewerkt: "2026-12-05T10:00:00.000Z" }))).toBe(true);
    expect(isAnders(oud, bedrijf({ plaats: "Gouda" }))).toBe(true);
  });
});
