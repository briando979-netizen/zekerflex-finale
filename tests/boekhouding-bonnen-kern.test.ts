import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BON_MAX_BYTES, bewaarTotVoor, bonBestandPad, herkenBonType, isBonPad, sha256Hex, valideerBonBestand } from "@/lib/boekhouding/bonnen/bestand";
import { beslisBon, normaliseerLeverancier, vindDubbel, type BeslisInvoer } from "@/lib/boekhouding/bonnen/beslis";
import { bouwBonBoeking } from "@/lib/boekhouding/bonnen/boeking";
import {
  adressenUit,
  isBonnetjesMail,
  isEigenAfzender,
  mailSleutel,
  authservLijst,
  parseAuthenticationResults,
  parseKop,
  spfDkimGeslaagd,
  valideerEigenAfzenders,
} from "@/lib/boekhouding/bonnen/mail-kern";
import { heeftLeesbareTekst, pdfTekst } from "@/lib/boekhouding/bonnen/pdf-tekst";
import {
  bedragenInTekst,
  berekenZekerheid,
  bonNummerVoor,
  controleerBonVelden,
  leesModelAntwoord,
  naarBoekdag,
  naarCenten,
  type BonVelden,
} from "@/lib/boekhouding/bonnen/velden";

const NU = new Date("2026-11-12T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});
afterEach(() => vi.useRealTimers());

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(8)]);

describe("bestand: magic bytes en grootte", () => {
  it("herkent pdf, jpg, png en heic aan de bytes", () => {
    expect(herkenBonType(PDF)?.ext).toBe("pdf");
    expect(herkenBonType(JPG)?.ext).toBe("jpg");
    expect(herkenBonType(PNG)?.ext).toBe("png");
    expect(herkenBonType(HEIC)?.ext).toBe("heic");
    expect(herkenBonType(Buffer.from("MZ exe"))).toBeNull();
    expect(herkenBonType(Buffer.from("<html>"))).toBeNull();
  });
  it("weigert een pdf-extensie op een exe, en een leeg of te groot bestand", () => {
    expect(() => valideerBonBestand(Buffer.from("MZ......"), "bon.pdf")).toThrow(/geen pdf/);
    expect(() => valideerBonBestand(PNG, "bon.pdf")).toThrow(/extensie/);
    expect(() => valideerBonBestand(Buffer.alloc(0))).toThrow(/leeg/);
    expect(() => valideerBonBestand(Buffer.concat([PDF, Buffer.alloc(BON_MAX_BYTES)]))).toThrow(/15 MB/);
  });
  it("accepteert jpeg-extensie voor jpg en geeft een hash", () => {
    const g = valideerBonBestand(JPG, "Foto.JPEG");
    expect(g).toMatchObject({ ext: "jpg", mimeType: "image/jpeg", bytes: JPG.length });
    expect(g.sha256).toBe(sha256Hex(JPG));
  });
  it("pad ligt op het opslagvolume onder boekhouding/bonnen en is alleen een hash", () => {
    const sha = sha256Hex(PDF);
    const pad = bonBestandPad("adminAAAAAA1", sha, "pdf");
    expect(pad).toBe(`boekhouding/bonnen/adminAAAAAA1/${sha.slice(0, 2)}/${sha}.pdf`);
    expect(isBonPad(pad)).toBe(true);
    expect(isBonPad("../../etc/passwd")).toBe(false);
    expect(isBonPad(`public/${pad}`)).toBe(false);
    expect(() => bonBestandPad("../x", sha, "pdf")).toThrow();
  });
  it("bewaart zeven jaar, tot het einde van het jaar", () => {
    expect(bewaarTotVoor("2026-11-12").toISOString().slice(0, 10)).toBe("2033-12-31");
  });
});

describe("velden: soepel lezen", () => {
  it("leest een object waar tekst hoort, ontbrekende velden en bedragen als tekst", () => {
    const a = leesModelAntwoord({ leverancier: { naam: "Hetzner" }, totaal_cents: "12,10", btw_tarief: "21%", zekerheid: 0.9 });
    expect(a.ruw.leverancier).toEqual({ naam: "Hetzner" });
    expect(a.zekerheidPromille).toBe(900);
    expect(leesModelAntwoord("rommel").ruw).toEqual({});
    expect(leesModelAntwoord(null).zekerheidPromille).toBeNull();
    expect(leesModelAntwoord([1, 2]).ruw).toEqual({});
  });
  it("naarCenten en naarBoekdag", () => {
    expect(naarCenten(1250)).toBe(1250);
    expect(naarCenten("12,50")).toBe(1250);
    expect(naarCenten("EUR 1.234,56")).toBe(123456);
    expect(naarCenten("abc")).toBeNull();
    expect(naarCenten({})).toBeNull();
    expect(naarBoekdag("2026-04-10")).toBe("2026-04-10");
    expect(naarBoekdag("10-04-2026")).toBe("2026-04-10");
    expect(naarBoekdag("31/02/2026")).toBeNull();
    expect(naarBoekdag(20260410)).toBeNull();
  });
  it("vindt bedragen in tekst", () => {
    expect([...bedragenInTekst("Totaal EUR 1.234,56 incl. btw 214,25 en 12.10")].sort((a, b) => a - b)).toEqual([1210, 21425, 123456]);
  });
});

const GOED = {
  leverancier: "Hetzner Online GmbH",
  factuurnummer: "R0001",
  datum: "2026-10-30",
  totaalCents: 12100,
  btwCents: 2100,
  btwPercentage: 21,
  valuta: "EUR",
  categorie: "4000",
};
const TEKST = "Hetzner Online GmbH Rechnung Totaal 121,00 EUR waarvan btw 21,00";

describe("velden: strenge controle", () => {
  it("een kloppende bon geeft velden met grondslag = totaal min btw", () => {
    const c = controleerBonVelden(GOED, { now: NU, tekst: TEKST });
    expect(c.problemen).toEqual([]);
    expect(c.velden).toMatchObject({ grondslagCents: 10000, btwCents: 2100, btwPercentage: 21, rekeningNummer: "4000", bonDatum: "2026-10-30" });
  });
  it("toegestane afwijking van 1 cent in de btw, maar niet 2", () => {
    expect(controleerBonVelden({ ...GOED, btwCents: 2101 }, { now: NU }).velden).not.toBeNull();
    expect(controleerBonVelden({ ...GOED, btwCents: 2102 }, { now: NU }).problemen.join(" ")).toMatch(/klopt niet met het btw-tarief/);
  });
  it("grondslag + btw moet het totaal zijn binnen 1 cent", () => {
    const c = controleerBonVelden({ ...GOED, grondslagCents: 9000 }, { now: NU });
    expect(c.velden).toBeNull();
    expect(c.problemen.join(" ")).toMatch(/Grondslag plus btw/);
  });
  it("een tarief buiten 0, 9 en 21 is een probleem", () => {
    const c = controleerBonVelden({ ...GOED, btwPercentage: 19, btwCents: 1932 }, { now: NU });
    expect(c.velden).toBeNull();
    expect(c.problemen.join(" ")).toMatch(/19%/);
  });
  it("0% zonder btw-bedrag mag, met een btw-bedrag niet", () => {
    expect(controleerBonVelden({ ...GOED, btwPercentage: 0, btwCents: undefined }, { now: NU }).velden).toMatchObject({ btwCents: 0, grondslagCents: 12100 });
    expect(controleerBonVelden({ ...GOED, btwPercentage: 0 }, { now: NU }).velden).toBeNull();
  });
  it("datum: toekomst, ouder dan 8 jaar, onmogelijk", () => {
    expect(controleerBonVelden({ ...GOED, datum: "2026-11-13" }, { now: NU }).problemen.join(" ")).toMatch(/toekomst/);
    expect(controleerBonVelden({ ...GOED, datum: "2026-11-12" }, { now: NU }).velden).not.toBeNull();
    expect(controleerBonVelden({ ...GOED, datum: "2018-11-11" }, { now: NU }).problemen.join(" ")).toMatch(/ouder dan 8 jaar/);
    expect(controleerBonVelden({ ...GOED, datum: "2018-11-12" }, { now: NU }).velden).not.toBeNull();
    expect(controleerBonVelden({ ...GOED, datum: "2026-02-30" }, { now: NU }).velden).toBeNull();
  });
  it("totaal moet in de OCR-tekst staan; negatief en nul worden niet vanzelf geboekt", () => {
    expect(controleerBonVelden(GOED, { now: NU, tekst: "Totaal 99,00" }).problemen.join(" ")).toMatch(/niet letterlijk/);
    expect(controleerBonVelden({ ...GOED, totaalCents: -100 }, { now: NU }).problemen.join(" ")).toMatch(/creditnota/);
    expect(controleerBonVelden({ ...GOED, totaalCents: 0 }, { now: NU }).velden).toBeNull();
  });
  it("een onbekende categorie, valuta of lege velden geven problemen en nooit een gooi", () => {
    expect(controleerBonVelden({ ...GOED, categorie: "4999" }, { now: NU }).problemen.join(" ")).toMatch(/categorie/);
    expect(controleerBonVelden({ ...GOED, categorie: "constructor" }, { now: NU }).velden).toBeNull();
    expect(controleerBonVelden({ ...GOED, categorie: "4100 - Software" }, { now: NU }).velden?.rekeningNummer).toBe("4100");
    expect(controleerBonVelden({}, { now: NU }).velden).toBeNull();
    expect(controleerBonVelden({ leverancier: { x: 1 }, totaalCents: {} }, { now: NU }).problemen.length).toBeGreaterThan(3);
  });
  it("zekerheid: elk probleem drukt hem onder de drempel", () => {
    expect(berekenZekerheid({ modelPromille: 950, ocrVertrouwen: 90, problemen: [] })).toBe(950);
    expect(berekenZekerheid({ modelPromille: 950, ocrVertrouwen: 50, problemen: [] })).toBe(600);
    expect(berekenZekerheid({ modelPromille: 950, ocrVertrouwen: null, problemen: ["x"] })).toBe(400);
    expect(berekenZekerheid({ modelPromille: null, ocrVertrouwen: null, problemen: [] })).toBe(500);
  });
  it("bonnummer bevat jaar en hash, geen naam", () => {
    expect(bonNummerVoor("2026-10-30", "abcdef0123456789")).toBe("B-2026-ABCDEF01");
  });
});

const VELDEN: BonVelden = {
  leverancier: "Hetzner",
  factuurnummer: null,
  bonDatum: "2026-10-30",
  totaalCents: 12100,
  grondslagCents: 10000,
  btwCents: 2100,
  btwPercentage: 21,
  valuta: "EUR",
  rekeningNummer: "4000",
};

const basis = (o: Partial<BeslisInvoer> = {}): BeslisInvoer => ({
  velden: VELDEN,
  problemen: [],
  zekerheidPromille: 900,
  herkomst: { bron: "upload", beheerder: true },
  dubbel: false,
  administratieValuta: "EUR",
  ...o,
});

describe("beslisBon", () => {
  it("upload door een beheerder met alles in orde wordt geboekt", () => {
    expect(beslisBon(basis())).toEqual({ actie: "boeken" });
  });
  it("een upload zonder beheerder is even kijken", () => {
    expect(beslisBon(basis({ herkomst: { bron: "upload" } })).actie).toBe("even-kijken");
  });
  it("mail: alleen met afzender op de lijst EN spf+dkim", () => {
    const m = (afzenderOpLijst: boolean, spfDkimGeslaagd: boolean) => beslisBon(basis({ herkomst: { bron: "mail", afzenderOpLijst, spfDkimGeslaagd } })).actie;
    expect(m(true, true)).toBe("boeken");
    expect(m(true, false)).toBe("even-kijken");
    expect(m(false, true)).toBe("even-kijken");
    expect(m(false, false)).toBe("even-kijken");
  });
  it("een beheerder telt niet als vertrouwd bij een mail", () => {
    expect(beslisBon(basis({ herkomst: { bron: "mail", beheerder: true } })).actie).toBe("even-kijken");
  });
  it("lage zekerheid, een probleem, een vreemde valuta of geen velden zijn even kijken", () => {
    expect(beslisBon(basis({ zekerheidPromille: 849 })).actie).toBe("even-kijken");
    expect(beslisBon(basis({ zekerheidPromille: 850 })).actie).toBe("boeken");
    expect(beslisBon(basis({ velden: null, problemen: ["De datum is niet gevonden."] })).actie).toBe("even-kijken");
    expect(beslisBon(basis({ velden: null })).actie).toBe("even-kijken");
    expect(beslisBon(basis({ velden: { ...VELDEN, valuta: "USD" } })).actie).toBe("even-kijken");
    expect(beslisBon(basis({ problemen: ["iets"] })).actie).toBe("even-kijken");
  });
  it("een dubbele bon wordt nooit geboekt, ook niet met alles in orde", () => {
    expect(beslisBon(basis({ dubbel: true }))).toEqual({ actie: "dubbel" });
  });
});

describe("dubbele bon herkennen", () => {
  const bestaand = [{ id: "b1", sha256: "aaa", leverancier: "Hetzner Online GmbH", bonDatum: "2026-10-30", totaalCents: 12100 }];
  it("zelfde hash", () => {
    expect(vindDubbel({ sha256: "aaa", leverancier: null, bonDatum: null, totaalCents: null }, bestaand)?.id).toBe("b1");
  });
  it("zelfde leverancier (anders geschreven), datum en bedrag", () => {
    expect(vindDubbel({ sha256: "bbb", leverancier: "HETZNER online", bonDatum: "2026-10-30", totaalCents: 12100 }, bestaand)?.id).toBe("b1");
    expect(vindDubbel({ sha256: "bbb", leverancier: "Hetzner Cloud", bonDatum: "2026-10-30", totaalCents: 12100 }, bestaand)).toBeNull();
    expect(vindDubbel({ sha256: "bbb", leverancier: "hetzner online gmbh.", bonDatum: "2026-10-30", totaalCents: 12100 }, bestaand)?.id).toBe("b1");
  });
  it("een ander bedrag of een andere datum is geen dubbele", () => {
    expect(vindDubbel({ sha256: "bbb", leverancier: "Hetzner Online GmbH", bonDatum: "2026-10-30", totaalCents: 12101 }, bestaand)).toBeNull();
    expect(vindDubbel({ sha256: "bbb", leverancier: "Hetzner Online GmbH", bonDatum: "2026-10-31", totaalCents: 12100 }, bestaand)).toBeNull();
    expect(vindDubbel({ sha256: "bbb", leverancier: null, bonDatum: "2026-10-30", totaalCents: 12100 }, bestaand)).toBeNull();
  });
  it("normaliseert de leverancier", () => {
    expect(normaliseerLeverancier("Café Ré B.V.")).toBe("caferé".normalize("NFD").replace(/[̀-ͯ]/g, ""));
  });
});

describe("boeking opbouwen", () => {
  const ctx = {
    administratieId: "adm1",
    valuta: "EUR",
    rekeningId: (n: string) => `rek-${n}`,
    btwCodeId: (c: string) => `btw-${c}`,
  };
  it("kosten en voorbelasting debet, crediteuren credit, omschrijving zonder leveranciersnaam", () => {
    const b = bouwBonBoeking(VELDEN, ctx, { bonId: "bon1", sha256: "ab".repeat(32) });
    expect(b).toMatchObject({ bron: "BON", bronId: "bon1", dagboek: "INKOOP", datum: "2026-10-30", omschrijving: "Bon B-2026-ABABABAB", valuta: "EUR" });
    expect(b.omschrijving).not.toMatch(/hetzner/i);
    expect(b.regels).toEqual([
      { rekeningId: "rek-4000", debetCents: 10000, btwCodeId: "btw-NL21-I", btwBasisCents: 10000 },
      { rekeningId: "rek-1300", debetCents: 2100, btwCodeId: "btw-NL21-I", isBtwRegel: true },
      { rekeningId: "rek-2200", creditCents: 12100, postSleutel: "bon:bon1" },
    ]);
    const debet = b.regels.reduce((s, r) => s + (r.debetCents ?? 0), 0);
    const credit = b.regels.reduce((s, r) => s + (r.creditCents ?? 0), 0);
    expect(debet).toBe(credit);
  });
  it("al betaald: bank credit in het bankdagboek; zonder btw geen btw-regel", () => {
    const b = bouwBonBoeking({ ...VELDEN, btwPercentage: 0, btwCents: 0, grondslagCents: 12100 }, ctx, { bonId: "bon2", sha256: "cd".repeat(32), betaaldMet: "bank" });
    expect(b.dagboek).toBe("BANK");
    expect(b.regels).toHaveLength(2);
    expect(b.regels[1]).toEqual({ rekeningId: "rek-1100", creditCents: 12100 });
    expect(b.regels[0]?.btwCodeId).toBe("btw-NL00-I");
  });
  it("weigert een som die niet klopt", () => {
    expect(() => bouwBonBoeking({ ...VELDEN, grondslagCents: 1 }, ctx, { bonId: "b", sha256: "ab".repeat(32) })).toThrow(/niet gelijk/);
  });
});

describe("mail: To, Delivered-To, X-Original-To", () => {
  const kop = (extra: string) => parseKop(`From: Hetzner <factuur@hetzner.com>\r\nSubject: Rechnung\r\n${extra}\r\nMessage-ID: <abc@x>\r\n`);
  it("herkent het alias in To, Cc, Delivered-To of X-Original-To", () => {
    expect(isBonnetjesMail(kop("To: Bonnetjes <Bonnetjes@Zekerflex.com>"))).toBe(true);
    expect(isBonnetjesMail(kop("To: info@zekerflex.com\r\nX-Original-To: bonnetjes@zekerflex.com"))).toBe(true);
    expect(isBonnetjesMail(kop("To: info@zekerflex.com\r\nDelivered-To: bonnetjes@zekerflex.com"))).toBe(true);
    expect(isBonnetjesMail(kop("To: info@zekerflex.com\r\nCc: a@b.nl,\r\n bonnetjes@zekerflex.com"))).toBe(true);
  });
  it("gewone mail in info@ en een lookalike zijn geen bonnetje", () => {
    expect(isBonnetjesMail(kop("To: info@zekerflex.com"))).toBe(false);
    expect(isBonnetjesMail(kop("To: bonnetjes@zekerflex.com.evil.nl"))).toBe(false);
    expect(isBonnetjesMail(kop("To: xbonnetjes@zekerflex.com"))).toBe(false);
    expect(isBonnetjesMail(parseKop(""))).toBe(false);
  });
  it("adressenUit en mailSleutel (zonder adres of ID in de sleutel)", () => {
    expect(adressenUit("A <A@B.nl>, c@d.nl")).toEqual(["a@b.nl", "c@d.nl"]);
    const s = mailSleutel(kop("To: x@y.nl"));
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    expect(s).toBe(mailSleutel(kop("To: iets-anders@y.nl")));
  });
});

describe("Authentication-Results", () => {
  const ar = (...regels: string[]) => parseKop(regels.map((r) => `Authentication-Results: ${r}`).join("\r\n"));
  it("spf en dkim pass met dkim-domein", () => {
    const a = parseAuthenticationResults(ar("mx.transip.nl; spf=pass smtp.mailfrom=hetzner.com; dkim=pass header.d=hetzner.com; dmarc=pass"));
    expect(a).toEqual({ spf: "pass", dkim: "pass", dkimDomein: "hetzner.com" });
    expect(spfDkimGeslaagd(a, "factuur@hetzner.com")).toBe(true);
  });
  it("faalt als een van beide niet slaagt, of ontbreekt", () => {
    expect(spfDkimGeslaagd(parseAuthenticationResults(ar("mx; spf=fail; dkim=pass header.d=hetzner.com")), "a@hetzner.com")).toBe(false);
    expect(spfDkimGeslaagd(parseAuthenticationResults(ar("mx; spf=pass; dkim=none")), "a@hetzner.com")).toBe(false);
    expect(spfDkimGeslaagd(parseAuthenticationResults(parseKop("")), "a@hetzner.com")).toBe(false);
    expect(spfDkimGeslaagd(parseAuthenticationResults(ar("mx; spf=softfail; dkim=pass header.d=hetzner.com")), "a@hetzner.com")).toBe(false);
  });
  it("een geslaagde dkim van een ander domein dan de afzender telt niet", () => {
    const a = parseAuthenticationResults(ar("mx; spf=pass; dkim=pass header.d=evil.nl"));
    expect(spfDkimGeslaagd(a, "factuur@hetzner.com")).toBe(false);
  });
  it("alleen de bovenste regel telt, of die van de vertrouwde server", () => {
    const k = ar("mx.transip.nl; spf=fail; dkim=none", "vervalst.example; spf=pass; dkim=pass header.d=hetzner.com");
    expect(parseAuthenticationResults(k).spf).toBe("fail");
    expect(parseAuthenticationResults(k, "mx.transip.nl").dkim).toBe("none");
    expect(parseAuthenticationResults(ar("vervalst.example; spf=pass; dkim=pass header.d=a.nl"), "mx.transip.nl").spf).toBeNull();
  });
});

describe("ARC-Authentication-Results (TransIP)", () => {
  const arc = (...regels: string[]) => parseKop(regels.map((r) => `ARC-Authentication-Results: ${r}`).join("\r\n"));
  const ok = "spf=pass smtp.mailfrom=hetzner.com; dkim=pass header.d=hetzner.com";
  const IDS = authservLijst();

  it("de vaste lijst heeft scott201 en scott202; BONNEN_AUTHSERV_ID voegt toe", () => {
    expect(IDS).toEqual(["scott201", "scott202"]);
    expect(authservLijst(" Mx.Extra.nl, scott201 ")).toEqual(["scott201", "scott202", "mx.extra.nl"]);
  });

  it("SPF en DKIM uit de ARC-regel van de eigen server tellen, ook zonder gewone Authentication-Results", () => {
    const a = parseAuthenticationResults(arc(`i=1; scott201; ${ok}`), IDS);
    expect(a).toEqual({ spf: "pass", dkim: "pass", dkimDomein: "hetzner.com" });
    expect(spfDkimGeslaagd(a, "factuur@hetzner.com")).toBe(true);
    expect(spfDkimGeslaagd(parseAuthenticationResults(arc(`i=1; scott202; ${ok}`), IDS), "factuur@hetzner.com")).toBe(true);
  });

  it("met een alias zijn er twee sets: de hoogste i telt", () => {
    const a = parseAuthenticationResults(arc("i=1; scott201; spf=fail; dkim=none", `i=2; scott202; ${ok}`), IDS);
    expect(spfDkimGeslaagd(a, "factuur@hetzner.com")).toBe(true);
    const b = parseAuthenticationResults(arc(`i=1; scott201; ${ok}`, "i=2; scott202; spf=fail; dkim=pass header.d=hetzner.com"), IDS);
    expect(b.spf).toBe("fail");
    expect(spfDkimGeslaagd(b, "factuur@hetzner.com")).toBe(false);
  });

  it("een nagemaakte regel van de afzender telt nooit: lagere i, of een ander authserv-id", () => {
    // de afzender zet er zelf een neer; onze server zet er daarna zijn eigen boven (hogere i) met de echte uitslag
    const k = arc(`i=1; scott201; ${ok}`, "i=2; scott201; spf=fail; dkim=none");
    expect(parseAuthenticationResults(k, IDS).spf).toBe("fail");
    // hoogste i is van een onbekende server: niets telt, ook niet de nette regel eronder
    expect(parseAuthenticationResults(arc(`i=1; scott201; ${ok}`, `i=2; vervalst.example; ${ok}`), IDS)).toEqual({ spf: null, dkim: null, dkimDomein: null });
    // twee regels met dezelfde hoogste i en één onbekend: niets telt
    expect(parseAuthenticationResults(arc(`i=3; scott201; ${ok}`, `i=3; vervalst.example; ${ok}`), IDS).spf).toBeNull();
    // geen lijst gegeven: ARC wordt niet vertrouwd
    expect(parseAuthenticationResults(arc(`i=1; scott201; ${ok}`)).spf).toBeNull();
  });

  it("een gewone regel van een vertrouwde server gaat vóór ARC; zonder die regel valt het terug op ARC", () => {
    const k = parseKop(["Authentication-Results: scott201; spf=pass; dkim=pass header.d=hetzner.com", "ARC-Authentication-Results: i=1; scott201; spf=fail; dkim=none"].join("\r\n"));
    expect(parseAuthenticationResults(k, IDS).spf).toBe("pass");
    const vals = parseKop(["Authentication-Results: vervalst.example; spf=pass; dkim=pass header.d=hetzner.com", "ARC-Authentication-Results: i=1; scott201; spf=fail; dkim=none"].join("\r\n"));
    expect(parseAuthenticationResults(vals, IDS).spf).toBe("fail");
  });

  it("een kapotte ARC-regel (zonder i of zonder authserv-id) levert niets op", () => {
    expect(parseAuthenticationResults(arc(`scott201; ${ok}`), IDS).spf).toBeNull();
    expect(parseAuthenticationResults(arc(`i=1; ${ok}`), IDS).spf).toBeNull();
  });
});

describe("lijst eigen afzenders", () => {
  it("valideert en maakt schoon", () => {
    expect(valideerEigenAfzenders([" Factuur@Hetzner.com ", "@stripe.com", "factuur@hetzner.com"])).toEqual(["factuur@hetzner.com", "@stripe.com"]);
    expect(valideerEigenAfzenders([])).toEqual([]);
  });
  it("weigert rommel", () => {
    expect(() => valideerEigenAfzenders("a@b.nl")).toThrow(/lijst/);
    expect(() => valideerEigenAfzenders(["geen adres"])).toThrow(/e-mailadres/);
    expect(() => valideerEigenAfzenders([42])).toThrow();
    expect(() => valideerEigenAfzenders(Array.from({ length: 101 }, (_, i) => `a${i}@b.nl`))).toThrow(/hooguit/);
  });
  it("adres of domein, exact", () => {
    expect(isEigenAfzender("factuur@hetzner.com", ["factuur@hetzner.com"])).toBe(true);
    expect(isEigenAfzender("x@stripe.com", ["@stripe.com"])).toBe(true);
    expect(isEigenAfzender("x@mail.stripe.com", ["@stripe.com"])).toBe(false);
    expect(isEigenAfzender("x@stripe.com", [])).toBe(false);
    expect(isEigenAfzender(null, ["@stripe.com"])).toBe(false);
  });
});

describe("pdf-tekstlaag", () => {
  const inhoud = "BT /F1 12 Tf (Factuur 2026-001 van Hetzner Online voor hosting) Tj T* (Totaal EUR 121,00 incl. btw 21,00 betaling binnen veertien dagen) Tj ET";
  it("leest platte en Flate-gecomprimeerde stromen", () => {
    const plat = Buffer.from(`%PDF-1.4\n4 0 obj\n<< /Length 10 >>\nstream\n${inhoud}\nendstream\nendobj\n`, "latin1");
    expect(heeftLeesbareTekst(pdfTekst(plat))).toBe(true);
    expect(pdfTekst(plat)).toContain("Totaal EUR 121,00");
    const z = deflateSync(Buffer.from(inhoud, "latin1"));
    const gez = Buffer.concat([Buffer.from("%PDF-1.4\n4 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1"), z, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    expect(pdfTekst(gez)).toContain("Factuur 2026-001");
  });
  it("een pdf zonder tekst is niet leesbaar", () => {
    expect(heeftLeesbareTekst(pdfTekst(PDF))).toBe(false);
    expect(heeftLeesbareTekst("x1#@$%^&*")).toBe(false);
  });
});
