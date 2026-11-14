import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "x".repeat(40), APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
vi.mock("@/lib/billing/stripe", () => ({ transferToConnectedAccount: async () => undefined }));

import { bedragTekst, ibanLeesbaar, overschrijvingRegels, overschrijvingVoor } from "@/lib/billing/overschrijving";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");
// een geldig testadres (checksum klopt): geen echte rekening
const IBAN = "NL91ABNA0417164300";
const basis = { iban: IBAN, naam: "Zekerflex, Inc.", factuurnummer: "ZF-2026-0042", totaalCents: 123450, status: "ISSUED", betaaltAanPlatform: true };

describe("betalen per bankoverschrijving: de gegevens", () => {
  it("geeft IBAN in groepen, het bedrag en het factuurnummer als kenmerk", () => {
    const o = overschrijvingVoor(basis);
    expect(o).toMatchObject({ naam: "Zekerflex, Inc.", iban: IBAN, ibanLeesbaar: "NL91 ABNA 0417 1643 00", kenmerk: "ZF-2026-0042", bedragCents: 123450 });
    expect(ibanLeesbaar("nl91 abna 0417 1643 00")).toBe("NL91 ABNA 0417 1643 00");
    expect(bedragTekst(123450)).toMatch(/1\.234,50/);
  });

  it("verzint niets: zonder IBAN, zonder naam of met een ongeldig IBAN is er geen overschrijving", () => {
    expect(overschrijvingVoor({ ...basis, iban: null })).toBeNull();
    expect(overschrijvingVoor({ ...basis, iban: "" })).toBeNull();
    expect(overschrijvingVoor({ ...basis, iban: undefined })).toBeNull();
    expect(overschrijvingVoor({ ...basis, naam: null })).toBeNull();
    expect(overschrijvingVoor({ ...basis, naam: "  " })).toBeNull();
    expect(overschrijvingVoor({ ...basis, iban: "NL91ABNA0417164301" })).toBeNull();
    expect(overschrijvingVoor({ ...basis, iban: "geen iban" })).toBeNull();
  });

  it("alleen voor een open factuur met een bedrag die aan ZekerFlex betaald wordt", () => {
    expect(overschrijvingVoor({ ...basis, status: "PAID" })).toBeNull();
    expect(overschrijvingVoor({ ...basis, status: "DRAFT" })).toBeNull();
    expect(overschrijvingVoor({ ...basis, totaalCents: 0 })).toBeNull();
    expect(overschrijvingVoor({ ...basis, totaalCents: -5 })).toBeNull();
    expect(overschrijvingVoor({ ...basis, betaaltAanPlatform: false })).toBeNull();
  });

  it("de pdf-regels noemen rekeninghouder, IBAN, bedrag en kenmerk en vragen het factuurnummer in de omschrijving", () => {
    const regels = overschrijvingRegels(overschrijvingVoor(basis)!);
    expect(regels.join("\n")).toContain("Rekeninghouder: Zekerflex, Inc.");
    expect(regels.join("\n")).toContain("IBAN: NL91 ABNA 0417 1643 00");
    expect(regels.join("\n")).toContain("Bedrag: EUR 1234,50");
    expect(regels.join("\n")).toContain("Betalingskenmerk: ZF-2026-0042");
    // de uitleg staat onderaan, in drie korte regels (lib/billing/overschrijving.ts OVERSCHRIJVING_UITLEG)
    expect(regels.slice(-3).join(" ")).toMatch(/factuurnummer bij de omschrijving/);
  });

  it("het kenmerk is het factuurnummer: precies wat het afletteren op het bankafschrift herkent", () => {
    const kern = lees("lib/boekhouding/bank/matching-kern.ts");
    expect(kern).toContain("staat in");
    expect(kern).toContain("nummerGevonden");
  });
});

describe("de factuur en de betaalpagina", () => {
  it("de pdf toont de online betaallink alleen als Stripe betaalt, en de overschrijving zodra er een rekening is", () => {
    const pdf = lees("lib/pdf/documents.ts");
    expect(pdf).toContain("const stripeDicht = await stripeBetalenDicht();");
    expect(pdf).toMatch(/if \(!stripeDicht\) \{\s*const link = payUrl\(inv\.id\);/);
    expect(pdf).toContain("Betalen via bankoverschrijving");
    expect(pdf).toContain("online betalen is op dit moment niet mogelijk");
    expect(pdf).toContain("betaaltAanPlatform: !inv.issuerFreelancerId");
  });

  it("de betaalpagina verbergt de knop en de QR-code als Stripe dicht is en toont dan de overschrijving", () => {
    const pagina = lees("app/betaal/[token]/page.tsx");
    expect(pagina).toContain("payable && !stripeDicht ? (");
    expect(pagina).toContain("{payable && !stripeDicht && (");
    expect(pagina).toContain('stripeDicht ? "Betalen via bankoverschrijving" : "Liever overmaken?"');
    expect(pagina).toContain("overschrijving.kenmerk");
    // geen IBAN in een log
    expect(pagina).not.toMatch(/logger\./);
  });

  it("de rekening komt uit de bestaande instelling en wordt nergens gelogd of verzonnen", () => {
    const bron = lees("lib/billing/overschrijving-bron.ts");
    expect(bron).toContain("env.SEPA_CREDITOR_IBAN");
    expect(bron).toContain("env.SEPA_CREDITOR_NAME");
    expect(bron).not.toMatch(/logger|console\./);
    expect(bron).toContain("stripe:betalen-uit");
    expect(lees("lib/billing/overschrijving.ts")).not.toMatch(/logger|console\./);
  });

  it("de eigenaar-taak vraagt de rekening in gewoon Nederlands en noemt de overschrijving", () => {
    const todo = lees("lib/admin/owner-todos.ts");
    expect(todo).toContain("Bankrekening van ZekerFlex invullen: voor betalen per overschrijving en uitbetalen (SEPA)");
    expect(todo).toContain("Betalen via bankoverschrijving, met het factuurnummer als kenmerk");
    expect(todo).toContain("done: Boolean(env.SEPA_CREDITOR_IBAN && env.SEPA_CREDITOR_NAME)");
  });

  it("niets van de kassa, de bonnen of de Stripe-webhook is aangeraakt, en ZekerFlex Bank blijft uit", () => {
    expect(lees("lib/app-mode.ts")).toContain("BANK_AAN = false");
    for (const p of ["app/api/webhooks/stripe/route.ts", "lib/billing/stripe.ts"]) expect(lees(p)).not.toContain("overschrijving");
  });
});