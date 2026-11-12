import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_DICTS } from "@/lib/i18n/auth";

// "Opslaan" op /dashboard/verificatie (12 nov): in 15 van 43 sessies 3+ keer achter elkaar. Bij een werker met een
// afgeronde ID deed de knop bij succes alleen een stille refresh, en een fout stond bovenaan buiten beeld.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("bevestiging na Opslaan", () => {
  it("de tekst staat er in alle vijf talen, en is iets anders dan 'bewaar voor later'", () => {
    for (const [taal, d] of Object.entries(AUTH_DICTS)) {
      expect(d.onb.later.savedKlaar.trim().length, taal).toBeGreaterThan(5);
      expect(d.onb.later.savedKlaar, taal).not.toBe(d.onb.later.saved);
    }
  });

  it("OnboardingForm toont hem na Opslaan (ID af) en brengt een melding bovenaan in beeld", () => {
    const s = bron("components/app/OnboardingForm.tsx");
    expect(s).toContain("setBewaard(t.later.savedKlaar)");
    expect(s).toMatch(/meldingRef\.current\?\.scrollIntoView/);
    expect(s).toContain("ref={meldingRef}");
  });

  it("de eerste stap (WieBenJijPersoon) brengt zijn melding ook in beeld", () => {
    const s = bron("components/app/WieBenJijPersoon.tsx");
    expect(s).toMatch(/meldingRef\.current\?\.scrollIntoView/);
    expect(s).toContain("ref={meldingRef}");
  });
});
