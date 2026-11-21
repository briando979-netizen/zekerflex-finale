import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UITZEND_AANVRAAG_TEKSTEN, vulUitzend } from "@/lib/i18n/uitzend-aanvraag";
import { WERKRECHT_AAN } from "@/lib/werkrecht/aan";

// 21 nov 2026 (eigenaar): reageren op een uitzendklus geeft een eigen venster "Vraag uitzendcontract aan" (zoals YoungOnes,
// met onze opzet: het bureau krijgt de aanvraag en belt), oude uitzendklussen zonder bureau staan niet meer in de lijst, en
// het recht om te werken is helemaal weg.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("venster Vraag uitzendcontract aan", () => {
  it("heeft in alle vijf talen dezelfde opbouw: drie stappen en de plaatshouders voor bureau en klant", () => {
    const nl = UITZEND_AANVRAAG_TEKSTEN.nl;
    for (const [taal, t] of Object.entries(UITZEND_AANVRAAG_TEKSTEN)) {
      expect(Object.keys(t).sort(), taal).toEqual(Object.keys(nl).sort());
      expect(t.stappen, taal).toHaveLength(3);
      expect(t.stappen[0], taal).toContain("{bureau}");
      expect(t.letOpTekst, taal).toContain("{klant}");
      expect(t.verstuurdTekst, taal).toContain("{bureau}");
    }
    expect(vulUitzend(nl.stappen[0], { klant: "Magazijn", bureau: "Flex Bureau" })).toContain("Flex Bureau");
    expect(JSON.stringify(UITZEND_AANVRAAG_TEKSTEN)).not.toMatch(/ZekerFlex is (je|de) werkgever|YoungCapital/);
  });

  it("de knop opent het venster alleen bij een klus van een uitzendpartner; de aanvraag gaat met het vaste uurloon", () => {
    const knop = lees("components/app/ReageerModal.tsx");
    expect(knop).toContain("{open && !blokkade && uitzendBureau && (");
    expect(knop).toContain("{open && !blokkade && !uitzendBureau && (");
    expect(lees("app/dashboard/klussen/[shiftId]/page.tsx")).toContain("uitzendBureau: bureau");
    const venster = lees("components/app/UitzendAanvraagSheet.tsx");
    expect(venster).toContain("counterOfferAction(shiftId, listedRateCents,");
    expect(venster).toContain('role="alert"');
  });

  it("oude uitzendklussen zonder uitzendbureau staan niet meer in de lijst", () => {
    expect(lees("lib/dashboard/marketplace.ts")).toContain("visible.filter((s) => !s.viaUitzendbureau || isUitzendPartner(uitzendPartners, s.branch.tenantId))");
  });

  it("het recht om te werken staat uit in de code, en dan telt de vlag niet", () => {
    expect(WERKRECHT_AAN).toBe(false);
    expect(lees("lib/werkrecht/store.ts")).toContain("if (!WERKRECHT_AAN) return false;");
  });
});
