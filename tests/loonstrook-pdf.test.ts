import { writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PayslipRecord } from "@/lib/payroll/store";

// De loonstrook-pdf (12 nov 2026, wens eigenaar): echte gegevens van werkgever en werknemer (art. 7:626 BW), dezelfde
// bedragen als vóór de nieuwe opmaak, en alleen je eigen strook. Testgegevens zijn verzonnen (.test, nul-BSN).

const m = vi.hoisted(() => ({
  principal: { userId: "usr_werker_a", email: "a@zekerflex.test", fullName: "Anna Test", grants: [] as unknown[] },
  slips: new Map<string, unknown>(),
  getPayslip: vi.fn(),
  fiscal: vi.fn(),
  profiel: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => m.principal }));
vi.mock("@/lib/payroll/store", () => ({
  getPayslip: async (userId: string, week: string) => {
    m.getPayslip(userId, week);
    return m.slips.get(`${userId}:${week}`) ?? null;
  },
}));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async (userId: string) => {
    m.fiscal(userId);
    return { bsnLast4: userId === "usr_werker_a" ? "0004" : "0009", loonheffingskorting: true, birthDate: "1995-05-05" };
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { freelancerProfile: { findUnique: async (a: { where: { userId: string } }) => { m.profiel(a.where.userId); return { homePostalCode: "1011AB" }; } } },
}));
vi.mock("@/lib/platform/werkgever", () => ({
  werkgeverVoorLoonstrook: () => ({ naam: "Zekerflex, Inc.", adres: null, kvk: null, loonheffingennummer: null }),
}));

import { PAYROLL_VOL, PAYROLL_WML, FACTUUR_BTW, VOORBEELDEN } from "./payslip-voorbeelden";
import { bsnWeergave, euro, loonstrookRegels, tekenRegels, werknemerNummer, type PdfRegel, type WerkgeverGegevens } from "@/lib/payroll/loonstrook-pdf";
import { SimplePdf } from "@/lib/pdf/simple";
import { GET } from "@/app/api/me/payroll/[isoWeek]/pdf/route";

const ZONDER: WerkgeverGegevens = { naam: "Zekerflex, Inc.", adres: null, kvk: null, loonheffingennummer: null };
const WERKNEMER = { naam: "Test Werker", nummer: "ZF-ABC123", bsnLaatste4: "0004", postcode: "1011AB" };
const EXTRA = { loonheffingskorting: true, minimumloonPerUurCents: 1546 };
const rijen = (r: PdfRegel[]) => r.filter((x): x is Extract<PdfRegel, { soort: "rij" }> => x.soort === "rij").map((x) => [x.label, x.waarde] as const);

/** De bedragrijen zoals de route ze vóór 12 nov tekende (letterlijk overgenomen), om te bewijzen dat ze niet veranderen. */
function oudeBedragen(slip: PayslipRecord): [string, string][] {
  const b = slip.computed.breakdown;
  const uit: [string, string][] = [];
  if (b.kind === "payroll") {
    if (b.cao && (b.cao.toeslagCents > 0 || b.cao.wmlFloorApplied)) {
      uit.push([`Basisloon (${b.cao.caoLabel})`, euro(b.cao.baseCents)]);
      if (b.cao.nachtCents > 0) uit.push(["Nachttoeslag", `+ ${euro(b.cao.nachtCents)}`]);
      if (b.cao.weekendCents > 0) uit.push(["Weekendtoeslag", `+ ${euro(b.cao.weekendCents)}`]);
      if (b.cao.feestdagCents > 0) uit.push(["Feestdagtoeslag", `+ ${euro(b.cao.feestdagCents)}`]);
      if (b.cao.overwerkCents > 0) uit.push(["Overwerktoeslag", `+ ${euro(b.cao.overwerkCents)}`]);
    }
    uit.push(["Brutoloon", euro(b.grossCents)], ["Vakantiegeld (8,33%)", euro(b.holidayAllowanceCents)], ["Reservering vakantie-uren", euro(b.holidayHoursReserveCents)], ["Reservering kort verzuim", euro(b.shortLeaveReserveCents)], [`Pensioen (StiPP ${b.pensionRegeling}) — jouw deel`, `- ${euro(b.pensionEmployeeCents)}`], ["Belastbaar loon", euro(b.taxableCents)], ["Loonheffing (indicatief)", `- ${euro(b.wageTaxIndicativeCents)}`], ["Netto (indicatief)", euro(b.netIndicativeCents)]);
  } else {
    uit.push(["Diensten", euro(b.servicesCents)], [b.vatRate > 0 ? `Btw (${Math.round(b.vatRate * 100)}%)` : "Btw", euro(b.vatCents)], ["Factuurtotaal", euro(b.invoiceTotalCents)], ["Uit te betalen aan jou", euro(b.payoutToWorkerCents)]);
  }
  return uit;
}

describe("de bedragen veranderen niet door de nieuwe opmaak", () => {
  it("elke voorbeeldstrook: dezelfde bedragrijen (label en bedrag) in dezelfde volgorde als vóór 12 nov", () => {
    for (const [naam, slip] of Object.entries(VOORBEELDEN)) {
      const oud = oudeBedragen(slip);
      const nieuw = rijen(loonstrookRegels(slip, ZONDER, WERKNEMER, EXTRA));
      const start = nieuw.findIndex(([l]) => l === oud[0]![0]);
      expect(start, naam).toBeGreaterThan(-1);
      expect(nieuw.slice(start, start + oud.length), naam).toEqual(oud);
    }
  });
});

describe("wat erop staat (art. 7:626 BW)", () => {
  it("een uitzendkracht: werkgever, werknemer, periode, arbeidsduur, uren, minimumloon, loonheffingskorting, ABU-fase en per dienst inlener en functie", () => {
    const r = loonstrookRegels(PAYROLL_VOL, ZONDER, WERKNEMER, EXTRA);
    const tekst = r.map((x) => (x.soort === "rij" ? `${x.label}: ${x.waarde}` : x.soort === "kop" || x.soort === "tekst" ? x.tekst : "")).join("\n");
    for (const moet of ["Loonstrook", "Periode: week 45", "Werkgever", "Naam: Zekerflex, Inc.", "Werknemer", "Naam: Test Werker", "Personeelsnummer: ZF-ABC123", "BSN: *****0004", "Postcode woonadres: 1011AB", "Arbeidsduur:", "Gewerkte uren: 38,50", "ABU-fase:", "Wettelijk minimumloon per uur: EUR 15,46", "Loonheffingskorting toegepast: Ja", "Vakantiegeld (8,33%)", "Reservering vakantie-uren", "Netto (indicatief)", "Acme · Bediening", "Beta · Bediening"]) {
      expect(tekst, moet).toContain(moet);
    }
  });

  it("een leeg werkgeversveld blijft weg (Zekerflex, Inc. heeft geen KvK); een ingesteld veld staat erop", () => {
    const zonder = rijen(loonstrookRegels(PAYROLL_VOL, ZONDER, WERKNEMER, EXTRA)).map(([l]) => l);
    expect(zonder).not.toContain("KvK-nummer");
    expect(zonder).not.toContain("Loonheffingennummer");
    expect(zonder).not.toContain("Adres");
    const met = rijen(loonstrookRegels(PAYROLL_VOL, { naam: "Zekerflex, Inc.", adres: "Teststraat 1, 1011AB Amsterdam", kvk: null, loonheffingennummer: "000000000L01" }, WERKNEMER, EXTRA));
    expect(met).toContainEqual(["Loonheffingennummer", "000000000L01"]);
    expect(met).toContainEqual(["Adres", "Teststraat 1, 1011AB Amsterdam"]);
  });

  it("van het BSN alleen de laatste 4 cijfers; een factuuroverzicht (zzp) heeft geen BSN en geen loonheffingennummer", () => {
    expect(bsnWeergave("1234")).toBe("*****1234");
    expect(bsnWeergave("123456789")).toBeNull();
    expect(bsnWeergave(null)).toBeNull();
    const f = rijen(loonstrookRegels(FACTUUR_BTW, { ...ZONDER, loonheffingennummer: "000000000L01" }, WERKNEMER, EXTRA)).map(([l]) => l);
    expect(f).not.toContain("BSN");
    expect(f).not.toContain("Loonheffingennummer");
    expect(f).not.toContain("Loonheffingskorting toegepast");
  });

  it("een strook met de WML-vloer noemt dat nog steeds", () => {
    const r = loonstrookRegels(PAYROLL_WML, ZONDER, WERKNEMER, EXTRA);
    expect(r.some((x) => x.soort === "tekst" && /wettelijk minimumloon/.test(x.tekst))).toBe(true);
  });

  it("het personeelsnummer is kort en verklapt geen naam of e-mail", () => {
    expect(werknemerNummer("usr_werker_abc123")).toBe("ZF-ABC123");
  });
});

describe("alleen je eigen loonstrook (twee werkers)", () => {
  const vraag = (week: string) => GET(new Request(`https://zekerflex.test/api/me/payroll/${week}/pdf`), { params: Promise.resolve({ isoWeek: week }) });

  beforeEach(() => {
    m.slips.clear();
    m.getPayslip.mockReset();
    m.fiscal.mockReset();
    m.profiel.mockReset();
    m.slips.set("usr_werker_a:2026-W45", { ...PAYROLL_VOL, userId: "usr_werker_a", workerName: "Anna Test" });
  });

  it("werker A krijgt haar eigen strook, met haar eigen gegevens", async () => {
    m.principal = { userId: "usr_werker_a", email: "a@zekerflex.test", fullName: "Anna Test", grants: [] };
    const r = await vraag("2026-W45");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(m.getPayslip).toHaveBeenCalledWith("usr_werker_a", "2026-W45");
    expect(m.fiscal).toHaveBeenCalledWith("usr_werker_a");
    expect(m.profiel).toHaveBeenCalledWith("usr_werker_a");
  });

  it("werker B vraagt dezelfde week: 404 (geen 403), en er wordt nooit met A's id gezocht", async () => {
    m.principal = { userId: "usr_werker_b", email: "b@zekerflex.test", fullName: "Bram Test", grants: [] };
    const r = await vraag("2026-W45");
    expect(r.status).toBe(404);
    expect(m.getPayslip).toHaveBeenCalledWith("usr_werker_b", "2026-W45");
    expect(m.getPayslip).not.toHaveBeenCalledWith("usr_werker_a", expect.anything());
    expect(m.fiscal).not.toHaveBeenCalled();
  });
});

describe("voorbeeld-pdf (alleen met ZF_PDF_UIT)", () => {
  it.runIf(Boolean(process.env.ZF_PDF_UIT))("schrijft een voorbeeld met testgegevens", () => {
    const werkgever: WerkgeverGegevens = { naam: "Zekerflex, Inc.", adres: null, kvk: null, loonheffingennummer: null };
    const pdf = tekenRegels(new SimplePdf(), loonstrookRegels(PAYROLL_VOL, werkgever, WERKNEMER, EXTRA));
    writeFileSync(String(process.env.ZF_PDF_UIT), pdf.toBuffer());
  });
});
