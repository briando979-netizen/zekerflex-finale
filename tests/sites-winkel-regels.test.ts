import QRCode from "qrcode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qrEncode } from "@/lib/qr/encode";
import { epcPayload, epcQrSvg } from "@/lib/sites/betaal-qr";
import { winkelSchema } from "@/lib/sites/schema";
import { LEGE_WINKEL, type Kortingscode, type Verzendmethode, type Winkel } from "@/lib/sites/types";
import { betaalOpties, betaalPast, ibanGeldig, toonIban } from "@/lib/sites/winkel-betalen";
import { btwIn, btwOverzicht, verdeel } from "@/lib/sites/winkel-btw";
import { controleerKorting, kortingBedrag, kortingStand, kortingTekst, normaliseerCode } from "@/lib/sites/winkel-korting";
import { actieveVerzendmethoden, bezorgtNaar, landKeuze, leesLand, leveringVan, prijsTekst, verzendKosten, verzendmethodenVan } from "@/lib/sites/winkel-verzending";

// De rekenregels van de webshop (10 nov 2026): verzendmethoden, kortingscodes, btw per tarief en
// betalen zonder betaalprovider. Datums altijd met een zone en een bevroren klok: de controle
// vóór elke uitrol draait in UTC.

const methode = (over: Partial<Verzendmethode> = {}): Verzendmethode => ({
  id: "vpostnl01",
  soort: "bezorgen",
  naam: "PostNL",
  prijsCents: 495,
  gratisVanafCents: 5000,
  gebied: "nl",
  adres: "",
  levertijd: "1 tot 2 werkdagen",
  actief: true,
  ...over,
});

const code = (over: Partial<Kortingscode> = {}): Kortingscode => ({
  id: "kzomer001",
  code: "ZOMER10",
  soort: "procent",
  waarde: 10,
  minimumCents: null,
  totEnMet: null,
  maxGebruik: null,
  actief: true,
  ...over,
});

describe("verzendmethoden", () => {
  it("geeft een oude winkel afhalen en bezorgen uit `levering`, met dezelfde bedragen", () => {
    const oud: Winkel = { ...LEGE_WINKEL, levering: { afhalen: true, bezorgen: true, bezorgkostenCents: 395, gratisVanafCents: 2500 } };
    const m = verzendmethodenVan(oud);
    expect(m.map((x) => [x.id, x.soort, x.prijsCents, x.gratisVanafCents])).toEqual([
      ["vafhalen", "afhalen", 0, null],
      ["vbezorgen", "bezorgen", 395, 2500],
    ]);
    expect(verzendmethodenVan(LEGE_WINKEL).map((x) => x.soort)).toEqual(["afhalen"]);
  });

  it("volgt de eigen lijst zodra die er is, en laat methoden die uit staan weg", () => {
    const w: Winkel = { ...LEGE_WINKEL, verzendmethoden: [methode(), methode({ id: "vkoerier1", naam: "Koerier", actief: false })] };
    expect(actieveVerzendmethoden(w).map((x) => x.naam)).toEqual(["PostNL"]);
    expect(leveringVan(w.verzendmethoden ?? [])).toEqual({ afhalen: false, bezorgen: true, bezorgkostenCents: 495, gratisVanafCents: 5000 });
  });

  it("rekent het tarief tot net onder de grens en is vanaf de grens gratis", () => {
    expect(verzendKosten(methode(), 4999)).toBe(495);
    expect(verzendKosten(methode(), 5000)).toBe(0);
    expect(verzendKosten(methode({ gratisVanafCents: null }), 1_000_000)).toBe(495);
    expect(prijsTekst(methode())).toBe("€ 4,95, gratis vanaf € 50,00");
    expect(prijsTekst(methode({ prijsCents: 0 }))).toBe("Gratis");
  });

  it("bezorgt alleen in het eigen gebied en leest onbekende landen als Nederland", () => {
    expect(bezorgtNaar("nl", "NL")).toBe(true);
    expect(bezorgtNaar("nl", "BE")).toBe(false);
    expect(bezorgtNaar("eu", "BE")).toBe(true);
    expect(bezorgtNaar("eu", "ZZ")).toBe(false);
    expect(bezorgtNaar("overal", "ZZ")).toBe(true);
    expect(leesLand("be")).toBe("BE");
    expect(leesLand("US")).toBe("NL");
    expect(landKeuze([methode(), methode({ gebied: "eu" })])).toBe("eu");
    expect(landKeuze([methode({ soort: "afhalen", gebied: "overal" })])).toBe("nl");
  });
});

describe("kortingscodes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rekent een percentage op centen af en een vast bedrag nooit boven het bedrag aan producten", () => {
    expect(kortingBedrag(code(), 1995)).toBe(200); // 199,5 → 200
    expect(kortingBedrag(code({ waarde: 15 }), 1990)).toBe(299); // 298,5 → 299
    expect(kortingBedrag(code({ soort: "bedrag", waarde: 500 }), 300)).toBe(300);
    expect(kortingBedrag(code({ waarde: 100 }), 4321)).toBe(4321);
    expect(kortingTekst(code({ soort: "bedrag", waarde: 500, minimumCents: 2500 }))).toBe("€ 5,00 korting vanaf € 25,00");
  });

  it("kent codes zonder verschil in hoofdletters of spaties, maar niet als ze uit staan", () => {
    vi.setSystemTime(new Date("2026-11-10T12:00:00+01:00"));
    const nu = new Date();
    expect(normaliseerCode(" zomer 10 ")).toBe("ZOMER10");
    const ok = controleerKorting([code()], "zomer10", { productenCents: 2000, nu, gebruikt: 0 });
    expect(ok).toMatchObject({ ok: true, kortingCents: 200 });
    const uit = controleerKorting([code({ actief: false })], "ZOMER10", { productenCents: 2000, nu, gebruikt: 0 });
    const onbekend = controleerKorting([code()], "WINTER", { productenCents: 2000, nu, gebruikt: 0 });
    expect(uit).toEqual({ ok: false, fout: "De kortingscode ZOMER10 kennen we niet. Controleer de code, of haal hem weg." });
    expect(onbekend.ok).toBe(false);
  });

  it("werkt tot en met de laatste dag in Nederlandse tijd, ook als het in UTC nog de dag ervoor is", () => {
    const k = code({ totEnMet: "2026-12-31" });
    vi.setSystemTime(new Date("2026-12-31T23:59:00+01:00"));
    expect(controleerKorting([k], "ZOMER10", { productenCents: 2000, nu: new Date(), gebruikt: 0 }).ok).toBe(true);
    // 1 januari 00:30 in Nederland is in UTC nog 31 december
    vi.setSystemTime(new Date("2027-01-01T00:30:00+01:00"));
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(controleerKorting([k], "ZOMER10", { productenCents: 2000, nu: new Date(), gebruikt: 0 })).toEqual({ ok: false, fout: "De kortingscode ZOMER10 is verlopen." });
    expect(kortingStand(k, new Date(), 0)).toBe("verlopen");
  });

  it("weigert onder het minimum met de bedragen erbij, en als hij op is", () => {
    vi.setSystemTime(new Date("2026-11-10T12:00:00+01:00"));
    const nu = new Date();
    const min = controleerKorting([code({ minimumCents: 2500 })], "ZOMER10", { productenCents: 1800, nu, gebruikt: 0 });
    expect(min).toEqual({ ok: false, fout: "De kortingscode ZOMER10 geldt vanaf € 25,00 aan producten. Je bestelling is nu € 18,00." });
    expect(controleerKorting([code({ minimumCents: 2500 })], "ZOMER10", { productenCents: 2500, nu, gebruikt: 0 }).ok).toBe(true);
    const k = code({ maxGebruik: 3 });
    expect(controleerKorting([k], "ZOMER10", { productenCents: 2000, nu, gebruikt: 2 }).ok).toBe(true);
    expect(controleerKorting([k], "ZOMER10", { productenCents: 2000, nu, gebruikt: 3 })).toEqual({ ok: false, fout: "De kortingscode ZOMER10 is al zo vaak gebruikt als kon." });
    expect(kortingStand(k, nu, 3)).toBe("op");
    expect(kortingStand(code({ actief: false }), nu, 0)).toBe("uit");
  });
});

describe("btw", () => {
  it("verdeelt een bedrag zonder dat er een cent zoekraakt", () => {
    expect(verdeel([100, 100, 100], 100)).toEqual([34, 33, 33]);
    expect(verdeel([450, 195], 65)).toEqual([45, 20]);
    expect(verdeel([0, 0], 50)).toEqual([0, 0]);
    for (const [delen, totaal] of [[[333, 333, 334], 7], [[1, 2, 3, 4], 999], [[999_999, 1], 12_345]] as const) {
      expect(verdeel([...delen], totaal).reduce((a, b) => a + b, 0)).toBe(totaal);
    }
  });

  it("haalt de btw uit een bedrag inclusief, of rekent hem erbij bij exclusief", () => {
    expect(btwIn(121, 21, true)).toBe(21);
    expect(btwIn(109, 9, true)).toBe(9);
    expect(btwIn(1000, 21, false)).toBe(210);
    expect(btwIn(500, 0, true)).toBe(0);
  });

  it("splitst per tarief, rondt per tarief af en laat de verzendkosten de producten volgen", () => {
    // 9% brood € 9,00 en 21% tas € 10,00, € 3,80 verzending: 9/19 en 10/19 daarvan
    const o = btwOverzicht({ inclusief: true, standaard: 21, kor: false }, [{ cents: 900, tarief: 9 }, { cents: 1000, tarief: 21 }], 380);
    expect(o.regels).toEqual([
      { tarief: 21, grondslagCents: 992, btwCents: 208 }, // 1000 + 200 = 1200 incl.
      { tarief: 9, grondslagCents: 991, btwCents: 89 }, // 900 + 180 = 1080 incl.
    ]);
    expect(o.totaalCents).toBe(297);
    expect(o.regels.reduce((a, r) => a + r.grondslagCents + r.btwCents, 0)).toBe(900 + 1000 + 380);
  });

  it("rekent exclusief met de btw erbij, en zonder producten gaat de verzending onder het standaardtarief", () => {
    const excl = btwOverzicht({ inclusief: false, standaard: 21, kor: false }, [{ cents: 1000, tarief: 21 }, { cents: 333, tarief: 9 }], 0);
    expect(excl.regels).toEqual([
      { tarief: 21, grondslagCents: 1000, btwCents: 210 },
      { tarief: 9, grondslagCents: 333, btwCents: 30 },
    ]);
    const leeg = btwOverzicht({ inclusief: true, standaard: 9, kor: false }, [{ cents: 0, tarief: 21 }], 495);
    expect(leeg.regels).toEqual([{ tarief: 9, grondslagCents: 454, btwCents: 41 }]);
  });

  it("toont onder de kleineondernemersregeling geen btw", () => {
    expect(btwOverzicht({ inclusief: true, standaard: 21, kor: true }, [{ cents: 1000, tarief: 21 }], 495)).toEqual({ inclusief: true, kor: true, regels: [], totaalCents: 0 });
  });
});

describe("betalen", () => {
  it("controleert het IBAN en biedt overboeking alleen aan met een geldig IBAN en een naam", () => {
    expect(ibanGeldig("NL91 ABNA 0417 1643 00")).toBe(true);
    expect(ibanGeldig("NL91ABNA0417164301")).toBe(false);
    expect(toonIban("nl91abna0417164300")).toBe("NL91 ABNA 0417 1643 00");
    const w = (iban: string, naam = "Bakkerij Jansen") => ({ betalen: { methoden: ["overboeking", "afhalen"] as ("overboeking" | "afhalen")[], iban, tenaamstelling: naam } });
    expect(betaalOpties(w("NL91ABNA0417164300"))).toEqual(["afhalen", "overboeking"]);
    expect(betaalOpties(w("NL00FOUT"))).toEqual(["afhalen"]);
    expect(betaalOpties(w("NL91ABNA0417164300", " "))).toEqual(["afhalen"]);
    expect(betaalOpties({})).toEqual([]);
  });

  it("laat betalen bij afhalen alleen bij afhalen toe, en contant alleen bij bezorgen", () => {
    expect(betaalPast("afhalen", "afhalen")).toBe(true);
    expect(betaalPast("afhalen", "bezorgen")).toBe(false);
    expect(betaalPast("rembours", "bezorgen")).toBe(true);
    expect(betaalPast("rembours", "afhalen")).toBe(false);
    expect(betaalPast("overboeking", "afhalen") && betaalPast("overboeking", "bezorgen")).toBe(true);
  });

  it("zet een overboeking in een betaal-QR-code volgens EPC069-12", () => {
    const o = { iban: "NL91 ABNA 0417 1643 00", naam: "Bakkerij Jansen", bedragCents: 1234, omschrijving: "K7M3Q2" };
    expect(epcPayload(o)).toBe("BCD\n002\n1\nSCT\n\nBakkerij Jansen\nNL91ABNA0417164300\nEUR12.34\n\n\nK7M3Q2");
    expect(epcPayload({ ...o, bedragCents: 100_000, naam: "Café\nDe Hoek" })).toContain("\nCafé De Hoek\nNL91ABNA0417164300\nEUR1000.00\n");
    // zonder bedrag (alles met korting betaald) blijft het veld leeg
    expect(epcPayload({ ...o, bedragCents: 0 }).split("\n")[7]).toBe("");
    const svg = epcQrSvg(o);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('aria-label="Betaal-QR-code voor je bank-app"');
    expect(svg).not.toMatch(/<script|<text|href=/);
    // 67 tekens: versie 5 (37 modules) plus een rand van 4 aan beide kanten
    expect(svg).toContain('viewBox="0 0 45 45"');
  });

  it("maakt dezelfde QR-code als een onafhankelijke QR-maker (het pakket qrcode, byte-modus, niveau M)", () => {
    const tekst = epcPayload({ iban: "NL91ABNA0417164300", naam: "Café De Hoek", bedragCents: 4795, omschrijving: "K7M3Q2" });
    const eigen = qrEncode(tekst);
    // dezelfde code bij één van de acht maskers: dan klopt de inhoud tot op de bit
    const gelijk = [0, 1, 2, 3, 4, 5, 6, 7].some((mask) => {
      const q = QRCode.create([{ data: Buffer.from(tekst, "utf8"), mode: "byte" }], { errorCorrectionLevel: "M", maskPattern: mask as QRCode.QRCodeMaskPattern });
      const n = q.modules.size;
      return n === eigen.length && eigen.every((rij, y) => rij.every((donker, x) => Boolean(q.modules.data[y * n + x]) === donker));
    });
    expect(gelijk).toBe(true);
  });
});

describe("opslaan: een oude winkel blijft geldig, de nieuwe velden worden gecontroleerd", () => {
  it("accepteert een winkel van vóór de verzendmethoden zonder iets toe te voegen", () => {
    const oud = { ...LEGE_WINKEL, producten: [] };
    const r = winkelSchema.safeParse(oud);
    expect(r.success).toBe(true);
    expect(r.success && "verzendmethoden" in r.data).toBe(false);
    expect(r.success && "btw" in r.data).toBe(false);
  });

  it("weigert een code die twee keer voorkomt, een percentage boven 100, een onbekend btw-tarief en overboeking zonder geldig IBAN", () => {
    const met = (over: Partial<Winkel> | Record<string, unknown>) => winkelSchema.safeParse({ ...LEGE_WINKEL, ...over });
    expect(met({ kortingscodes: [code(), code({ id: "kander001" })] }).success).toBe(false);
    expect(met({ kortingscodes: [code({ waarde: 150 })] }).success).toBe(false);
    const goed = met({ kortingscodes: [code({ code: "zomer10" })] });
    expect(goed.success && goed.data.kortingscodes?.[0]?.code).toBe("ZOMER10");
    expect(met({ btw: { inclusief: true, standaard: 6, kor: false } }).success).toBe(false);
    expect(met({ betalen: { methoden: ["overboeking"], iban: "NL12", tenaamstelling: "Jansen" } }).success).toBe(false);
    expect(met({ betalen: { methoden: ["overboeking"], iban: "NL91 ABNA 0417 1643 00", tenaamstelling: "Jansen" } }).success).toBe(true);
  });

  it("vraagt minstens één verzendmethode die aan staat zolang bestellen aan staat", () => {
    const uit = methode({ actief: false });
    expect(winkelSchema.safeParse({ ...LEGE_WINKEL, verzendmethoden: [uit] }).success).toBe(false);
    expect(winkelSchema.safeParse({ ...LEGE_WINKEL, bestellen: false, verzendmethoden: [uit] }).success).toBe(true);
    expect(winkelSchema.safeParse({ ...LEGE_WINKEL, verzendmethoden: [uit, methode({ id: "vafhaal01", soort: "afhalen", naam: "Afhalen", prijsCents: 0 })] }).success).toBe(true);
  });
});
