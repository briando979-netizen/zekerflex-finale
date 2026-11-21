import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Sinds 21 nov 2026 (eigenaar: "verander alles") is ZekerFlex zelf geen uitzender meer: uitzenden loopt alleen via aangesloten
// uitzendbureaus (lib/uitzend/partners-kern.ts). De schakelaar staat in lib/uitzend/model.ts. Deze test bewaakt het gedrag met
// de schakelaar uit; de oude tests van het eigen uitzendspoor zetten hem in hun eigen bestand aan.

const h = vi.hoisted(() => ({ fiscal: { workerKind: "uitzendkracht", bsnHash: "x", iban: "NL00TEST" } as Record<string, unknown> }));
vi.mock("@/lib/prisma", () => ({ prisma: { freelancerProfile: { findUnique: async () => ({ kvkValid: false, vatValid: false, payoutIban: "NL00TEST" }) } } }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => h.fiscal, invoiceModeFor: (f: { workerKind?: string }) => (f.workerKind === "uitzendkracht" ? "payroll" : "reverse-billing") }));
vi.mock("@/lib/agreements/uitzend-contract", () => ({ activeUitzendContract: async () => ({ id: "c1" }) }));
vi.mock("@/lib/werkrecht/store", () => ({ werkrechtVoorWerk: async () => ({ ok: true, reden: null }) }));
vi.mock("@/lib/kvk/tegoed-opslag", () => ({ kvkWachtVan: async () => false }));
vi.mock("@/lib/fiscal/proefklussen", () => ({ proefklusRuimte: async () => ({ over: 0, aangenomen: 0 }) }));

import { ZEKERFLEX_UITZENDER } from "@/lib/uitzend/model";
import { payoutEligibility, UITZEND_ALLEEN_VIA_BUREAU } from "@/lib/fiscal/eligibility";
import { isMatchEligibleWorker } from "@/lib/matching/geschikt";
import { nogVoorEersteKlus, type KlusFeiten } from "@/lib/onboarding/klaar-voor-klus";
import { voorEersteKlus } from "@/lib/onboarding/gegevens-mist";
import { FOUTEN } from "@/lib/i18n/fouten";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("ZekerFlex is zelf geen uitzender", () => {
  it("de schakelaar staat uit", () => {
    expect(ZEKERFLEX_UITZENDER).toBe(false);
  });

  it("een uitzendkracht reageert alleen bij een uitzendbureau: elders een eerlijke reden, met vertaling", async () => {
    const r = await payoutEligibility("u1");
    expect(r).toMatchObject({ ok: false, track: "payroll", reason: UITZEND_ALLEEN_VIA_BUREAU, sleutel: "elig.uitzendPartner" });
    const vertaald = FOUTEN["elig.uitzendPartner"];
    for (const taal of ["nl", "en", "pl", "ro", "uk"] as const) expect(vertaald?.[taal], taal).toMatch(/\S/);
    expect(vertaald?.nl).toBe(UITZEND_ALLEEN_VIA_BUREAU);
  });

  it("de matching stuurt een uitzendkracht alleen klussen van een uitzendbureau", async () => {
    h.fiscal = { workerKind: "uitzendkracht" };
    const p = { userId: "u1", vatValid: false, kvkValid: false, country: "NL" };
    expect(await isMatchEligibleWorker(p, false)).toBe(false);
    expect(await isMatchEligibleWorker(p, true)).toBe(false);
    expect(await isMatchEligibleWorker(p, true, true)).toBe(true);
  });

  it("ZekerFlex vraagt een uitzendkracht geen BSN, overeenkomst of rekeningnummer meer (dat doet het bureau)", () => {
    const f: KlusFeiten = { soort: "uitzendkracht", payroll: true, idGoedgekeurd: true, bsn: false, contract: false, bedrijf: false, kvkWacht: false, iban: false, werkrechtOpen: false };
    expect(nogVoorEersteKlus(f)).toEqual([]);
    expect(voorEersteKlus({ soort: "uitzendkracht", fiscaalIngevuld: false, contractGetekend: false, bedrijfOk: false } as never)).toEqual([]);
    // een zzp'er houdt zijn eisen
    expect(nogVoorEersteKlus({ ...f, soort: "zzp", payroll: false })).toEqual(["bedrijf", "iban"]);
  });

  it("een gewoon bedrijf plaatst geen uitzendklus meer; het formulier verwijst naar een aangesloten bureau", () => {
    expect(lees("lib/shifts/create.ts")).toContain("(await isUitzendPartnerTenant(branch.tenantId)) || (ZEKERFLEX_UITZENDER && input.viaUitzendbureau)");
    const form = lees("components/app/NewShiftForm.tsx");
    expect(form).toContain("{!edit && ZEKERFLEX_UITZENDER && (");
    expect(form).toContain("{n.uitzendViaBureau}");
  });

  it("de app noemt ZekerFlex nergens meer werkgever van een uitzendkracht, in geen enkele taal", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      const tekst = JSON.stringify([d.market.typeUitzend, d.detail.stat3Agency, d.ts.payrollPayLine]);
      expect(tekst, taal).not.toContain("ZekerFlex");
    }
    const account = lees("app/dashboard/account/page.tsx");
    expect(account).toContain("...(ZEKERFLEX_UITZENDER");
    expect(account).toContain("{isUitzend && ZEKERFLEX_UITZENDER && (heeftGeplandeKlus || matched > 0) && (");
  });
});
