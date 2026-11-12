import { describe, expect, it, vi } from "vitest";
import type { ProefbalansRij } from "@/lib/boekhouding/lezen-kern";

// store.ts (via structuur → kennis) en errors laden geen database; prisma voor de zekerheid nep.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { boekjaarGrenzen, jaarUit, jaarconcept, openVragen, resultaatUit } = await import("@/lib/accountant/jaar-kern");
const { dossierHtml, esc } = await import("@/lib/accountant/dossier");
const { structuurToestand } = await import("@/lib/accountant/structuur");

const rij = (rekeningNummer: string, naam: string, kant: "BALANS" | "WV", debetCents: number, creditCents: number): ProefbalansRij => ({ rekeningNummer, naam, kant, debetCents, creditCents });

// 2025: storting € 100 (bank/kapitaal) en € 50 omzet. 2026: € 1.000 omzet, € 300 kosten, btw en een open debiteur.
const VORIG_JAAR = [rij("8000", "Omzet platformfee", "WV", 0, 5_000)];
const DIT_JAAR = [
  rij("1100", "Bank", "BALANS", 90_000, 30_000),
  rij("1200", "Debiteuren", "BALANS", 31_000, 0),
  rij("2300", "Te betalen btw", "BALANS", 0, 21_000),
  rij("8000", "Omzet platformfee", "WV", 0, 100_000),
  rij("4000", "Hosting en infrastructuur", "WV", 30_000, 0),
];
const TOT_EIND = [
  rij("1100", "Bank", "BALANS", 90_000 + 15_000, 30_000),
  rij("1200", "Debiteuren", "BALANS", 31_000, 0),
  rij("2010", "Geplaatst kapitaal", "BALANS", 0, 10_000),
  rij("2300", "Te betalen btw", "BALANS", 0, 21_000),
  rij("8000", "Omzet platformfee", "WV", 0, 105_000),
  rij("4000", "Hosting en infrastructuur", "WV", 30_000, 0),
];

describe("jaarconcept", () => {
  const c = jaarconcept({ jaar: 2026, van: "2026-01-01", tot: "2026-12-31", valuta: "EUR", totEind: TOT_EIND, ditJaar: DIT_JAAR });

  it("rekent het resultaat van het jaar en van eerdere jaren", () => {
    expect(resultaatUit(VORIG_JAAR)).toBe(5_000);
    expect(c.wv.totaalOpbrengsten).toBe(100_000);
    expect(c.wv.totaalKosten).toBe(30_000);
    expect(c.wv.resultaat).toBe(70_000);
    expect(c.balans.resultaatEerder).toBe(5_000);
  });

  it("deelt de balans in op debet- en creditsaldo en de balans sluit", () => {
    expect(c.balans.debet.map((p) => [p.rekeningNummer, p.cents])).toEqual([["1100", 75_000], ["1200", 31_000]]);
    expect(c.balans.credit.map((p) => [p.rekeningNummer, p.cents])).toEqual([["2010", 10_000], ["2300", 21_000]]);
    // 106.000 bezittingen = 31.000 schulden/kapitaal + 70.000 resultaat + 5.000 eerder
    expect(c.balans.sluit).toBe(true);
    expect(c.balans.verschilCents).toBe(0);
  });

  it("geeft de cijfers voor Form 1120 en zegt dat euro's omgerekend moeten worden", () => {
    expect(c.us).toEqual({ grossReceiptsCents: 100_000, deductionsCents: 30_000, resultaatCents: 70_000, totalAssetsCents: 106_000, omrekenenNodig: true });
    expect(openVragen(c)[0]).toMatch(/koers/);
    expect(openVragen(c).join(" ")).toMatch(/eerdere jaren/);
  });

  it("meldt een balans die niet sluit als eerste vraag", () => {
    const scheef = jaarconcept({ jaar: 2026, van: "2026-01-01", tot: "2026-12-31", valuta: "USD", totEind: [rij("1100", "Bank", "BALANS", 100, 0)], ditJaar: [] });
    expect(scheef.balans.sluit).toBe(false);
    expect(openVragen(scheef)[0]).toMatch(/sluit niet/);
    expect(scheef.us.omrekenenNodig).toBe(false);
  });
});

describe("boekjaar en invoer", () => {
  it("geeft het kalenderjaar en een gebroken boekjaar", () => {
    expect(boekjaarGrenzen(2026, 1)).toEqual({ van: "2026-01-01", tot: "2026-12-31" });
    expect(boekjaarGrenzen(2026, 7)).toEqual({ van: "2026-07-01", tot: "2027-06-30" });
  });
  it("accepteert alleen een redelijk jaar uit de query", () => {
    expect(jaarUit("https://x.test/api?jaar=2025", 2026)).toBe(2025);
    expect(jaarUit("https://x.test/api", 2026)).toBe(2026);
    expect(() => jaarUit("https://x.test/api?jaar=1999", 2026)).toThrow();
    expect(() => jaarUit("https://x.test/api?jaar=abc", 2026)).toThrow();
    expect(() => jaarUit("https://x.test/api?jaar=2030", 2026)).toThrow();
  });
});

describe("dossier", () => {
  const concept = jaarconcept({ jaar: 2026, van: "2026-01-01", tot: "2026-12-31", valuta: "EUR", totEind: TOT_EIND, ditJaar: DIT_JAAR });
  const html = dossierHtml({
    administratie: "zekerflex <Inc>",
    gemaaktOp: "2026-11-12",
    concept,
    vragen: openVragen(concept),
    structuur: structuurToestand({ kvk: "bezig" }),
    termijnen: [{ sleutel: "irs-83b-2026", titel: "83(b)", dag: "2026-12-09", dagenTot: 27, wat: "Verstuur de verklaring", waarschuwing: null, bevestigDoor: "Een mens bevestigt.", klaar: false }],
  });

  it("escapet tekst en bevat geen scripts", () => {
    expect(esc(`<script>"x" & 'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
    expect(html).toContain("zekerflex &lt;Inc&gt;");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/[^"<\s]+\.(js|css)\b/);
  });

  it("heeft alle onderdelen en zegt dat het een concept is", () => {
    for (const kop of ["Conceptbalans", "winst-en-verliesrekening", "Form 1120 en Form 5472", "Open vragen", "Structuur", "Komende termijnen", "Bronnen"]) expect(html).toContain(kop);
    expect(html).toContain("CONCEPT");
    expect(html).toContain("niets ingediend");
    expect(html).toContain("$25,000");
    expect(html).toContain("bezig"); // status van de structuurcheck
  });

  it("werkt ook zonder administratie", () => {
    const leeg = dossierHtml({ administratie: "nog geen echte administratie", gemaaktOp: "2026-11-12", concept: null, vragen: ["Eerst inrichten."], structuur: structuurToestand(null), termijnen: [] });
    expect(leeg).toContain("nog geen echte administratie");
    expect(leeg).toContain("Eerst inrichten.");
  });
});
