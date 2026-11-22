import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INVOICE_DUE_DAYS, WERKER_FACTUUR_DAGEN } from "@/lib/claims/policy";
import { betaaltermijnDagen, betaaltermijnTekst, plusAmsterdamDagen, vervaldatumVan, vervaldatumVoor } from "@/lib/billing/betaaltermijn";
import { invoiceIssuedEmail } from "@/lib/mail";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// Betaaltermijnen van facturen aan een bedrijf (22 nov 2026, eigenaar): bij een gewerkte klus krijgt het bedrijf twee facturen
// op dezelfde dag. De factuur van de werker (SELF_BILL_FREELANCER) is te betalen binnen 30 dagen, de platformfactuur
// (PLATFORM_FEE) binnen 14 dagen. Alle datums hebben een zone (de live-controle draait in UTC); de helpers lezen de klok niet.

const DAG = 86_400_000;
const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("de termijn per soort factuur", () => {
  it("werkerfactuur 30 dagen, platformfactuur 14; claims en terugbetalen blijven zoals ze waren", () => {
    expect(WERKER_FACTUUR_DAGEN).toBe(30);
    expect(INVOICE_DUE_DAYS).toBe(14);
    expect(betaaltermijnDagen("SELF_BILL_FREELANCER")).toBe(30);
    expect(betaaltermijnDagen("PLATFORM_FEE")).toBe(14);
    expect(betaaltermijnDagen("UITZEND_FEE")).toBe(14);
    expect(betaaltermijnDagen("CANCELLATION_PENALTY")).toBe(14);
    // de annuleringsvergoeding (lib/claims/billing.ts) en het terugbetalen na een betaalgeschil (lib/billing/clawback.ts) zijn niet aangeraakt
    expect(lees("lib/claims/billing.ts")).toContain("INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000");
    expect(lees("lib/billing/clawback.ts")).toContain("const REPAY_DAYS = 7;");
  });
});

describe("de vervaldatum: kalenderdagen in Amsterdam, op dezelfde klokslag", () => {
  it("gewone dag in de zomer: 2 sep 06:30 → platform 16 sep, werker 2 okt", () => {
    const uitgifte = new Date("2026-09-02T06:30:00+02:00");
    expect(vervaldatumVoor("PLATFORM_FEE", uitgifte).toISOString()).toBe("2026-09-16T04:30:00.000Z");
    expect(vervaldatumVoor("SELF_BILL_FREELANCER", uitgifte).toISOString()).toBe("2026-10-02T04:30:00.000Z");
  });

  it("klokwissel van 25 okt (zomer → winter): een factuur van 20 okt 10:00 vervalt 3 nov en 19 nov weer om 10:00", () => {
    const uitgifte = new Date("2026-10-20T10:00:00+02:00");
    expect(vervaldatumVoor("PLATFORM_FEE", uitgifte).toISOString()).toBe("2026-11-03T09:00:00.000Z"); // 10:00 wintertijd
    const werker = vervaldatumVoor("SELF_BILL_FREELANCER", uitgifte);
    expect(werker.toISOString()).toBe("2026-11-19T09:00:00.000Z"); // 10:00 wintertijd
    // n × 24 uur optellen gaf een uur te vroeg: 09:00 wintertijd
    expect(new Date(uitgifte.getTime() + 30 * DAG).toISOString()).toBe("2026-11-19T08:00:00.000Z");
    expect(werker.getTime() - uitgifte.getTime()).toBe(30 * DAG + 3_600_000); // 30 dagen is hier 721 uur
  });

  it("klokwissel van 29 mrt (winter → zomer): 20 mrt 10:00 vervalt 3 apr en 19 apr weer om 10:00", () => {
    const uitgifte = new Date("2026-03-20T10:00:00+01:00");
    expect(vervaldatumVoor("PLATFORM_FEE", uitgifte).toISOString()).toBe("2026-04-03T08:00:00.000Z"); // 10:00 zomertijd
    expect(vervaldatumVoor("SELF_BILL_FREELANCER", uitgifte).toISOString()).toBe("2026-04-19T08:00:00.000Z");
  });

  it("vlak na middernacht op de Amsterdamse dag: 31 dec 00:30 + 30 dagen is 30 jan, niet 29 jan", () => {
    const uitgifte = new Date("2026-12-31T00:30:00+01:00"); // 30 dec 23:30 UTC
    const vervalt = vervaldatumVoor("SELF_BILL_FREELANCER", uitgifte);
    expect(amsterdamDayKey(vervalt)).toBe("2027-01-30");
    expect(vervalt.toISOString()).toBe("2027-01-29T23:30:00.000Z");
  });

  it("plusAmsterdamDagen houdt seconden vast en rekent ook terug", () => {
    expect(plusAmsterdamDagen(new Date("2026-10-20T10:00:07+02:00"), 14).toISOString()).toBe("2026-11-03T09:00:07.000Z");
    expect(plusAmsterdamDagen(new Date("2026-11-03T10:00:00+01:00"), -14).toISOString()).toBe("2026-10-20T08:00:00.000Z");
  });
});

describe("vervaldatumVan en de tekst voor pdf en mail", () => {
  const uitgifte = new Date("2026-10-20T10:00:00+02:00");
  const factuur = (type: "SELF_BILL_FREELANCER" | "PLATFORM_FEE" | "DOMEIN", dueAt: Date | null = null) => ({ type, dueAt, issuedAt: uitgifte, createdAt: new Date("2026-10-20T09:59:00+02:00") });

  it("de dueAt op de factuur wint; zonder dueAt telt de termijn van zijn soort (dus ook voor oude facturen)", () => {
    const eigen = new Date("2026-12-01T12:00:00+01:00");
    expect(vervaldatumVan(factuur("SELF_BILL_FREELANCER", eigen))).toBe(eigen);
    expect(vervaldatumVan(factuur("SELF_BILL_FREELANCER")).toISOString()).toBe("2026-11-19T09:00:00.000Z");
    expect(vervaldatumVan(factuur("PLATFORM_FEE")).toISOString()).toBe("2026-11-03T09:00:00.000Z");
    // geen uitgiftedatum: de aanmaakdatum
    expect(vervaldatumVan({ type: "PLATFORM_FEE", dueAt: null, issuedAt: null, createdAt: new Date("2026-10-20T09:59:00+02:00") }).toISOString()).toBe("2026-11-03T08:59:00.000Z");
  });

  it("dezelfde factuur dag: de werkerfactuur noemt 30 dagen, de platformfactuur 14", () => {
    expect(betaaltermijnTekst(factuur("SELF_BILL_FREELANCER"))).toBe("binnen 30 dagen, uiterlijk 19 november 2026");
    expect(betaaltermijnTekst(factuur("PLATFORM_FEE"))).toBe("binnen 14 dagen, uiterlijk 3 november 2026");
    // zoals persistInvoice hem bewaart
    const bewaard = { ...factuur("SELF_BILL_FREELANCER"), dueAt: vervaldatumVoor("SELF_BILL_FREELANCER", uitgifte) };
    expect(betaaltermijnTekst(bewaard)).toBe("binnen 30 dagen, uiterlijk 19 november 2026");
  });

  it("een eigen vervaldatum die niet bij het soort hoort (domeinnaam): alleen de datum, geen verkeerd aantal dagen", () => {
    expect(betaaltermijnTekst(factuur("DOMEIN", new Date("2027-03-01T12:00:00+01:00")))).toBe("uiterlijk 1 maart 2027");
  });

  it("de mail noemt de termijn in tekst en html, en zonder termijn blijft hij zoals hij was", () => {
    const termijn = betaaltermijnTekst(factuur("PLATFORM_FEE"));
    const mail = invoiceIssuedEmail("Bakkerij Jansen", "https://zekerflex.test/werkgever/facturen", "ZF-PF-1", 3388, "platformkosten, shift @ Magazijn", termijn);
    expect(mail.text).toContain("Te betalen binnen 14 dagen, uiterlijk 3 november 2026.");
    expect(mail.html).toContain("binnen 14 dagen, uiterlijk 3 november 2026");
    const oud = invoiceIssuedEmail("Bakkerij Jansen", "https://zekerflex.test/werkgever/facturen", "ZF-PF-1", 3388, "platformkosten, shift @ Magazijn");
    expect(oud.text).not.toContain("Te betalen");
    expect(oud.html).not.toContain("Te betalen");
  });

  it("de pdf en de e-factuur halen de termijn uit dezelfde bron", () => {
    expect(lees("lib/pdf/documents.ts")).toContain('pdf.row("Betaaltermijn", betaaltermijnTekst(inv))');
    const efactuur = lees("lib/efactuur/factuur.ts");
    expect(efactuur).toContain("vervaldatum: amsterdamDayKey(vervaldatumVan(inv))");
    expect(efactuur).not.toContain("BETAALTERMIJN_DAGEN");
  });
});
