import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Geen dode verzendknoppen meer (14 nov 2026): een submit-knop mag uit staan tijdens het versturen (busy), niet "tot alles
// geldig is" zonder uitleg. Elke verzending zegt met role="alert" wat ontbreekt en meldt dat anoniem (formulier-meting).

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("verzendknoppen staan aan; de melding zegt wat ontbreekt", () => {
  it("aanmelden (werker en bedrijf), in de taal van de bezoeker", () => {
    const s = lees("components/auth/RegisterForm.tsx");
    expect(s).toContain("disabled={pending}");
    expect(s).not.toContain("disabled={!canSubmit}");
    expect(s).toContain('meldOntbreekt("register"');
    expect(s).toMatch(/role="alert"[^>]*>\s*\{klopNiet\}/);
    expect(s).toContain("t.fillIn");
  });

  it("website-check: het adres en het contactformulier", () => {
    const s = lees("components/marketing/WebsiteCheck.tsx");
    expect(s).not.toMatch(/disabled=\{busy \|\| !url\.trim\(\)\}/);
    expect(s).not.toMatch(/disabled=\{busy \|\| !form\.name/);
    expect(s).toContain('meldOntbreekt("website-check", "url")');
    expect(s).toContain('meldOntbreekt("website-check-lead"');
  });

  it("uitzendbureau-aanvraag, rekentool-uitkomst en btw-check", () => {
    expect(lees("components/marketing/UitzendbureauContactForm.tsx")).not.toMatch(/disabled=\{busy \|\| !form\.contactName/);
    expect(lees("components/marketing/UitzendbureauContactForm.tsx")).toContain('meldOntbreekt("uitzendbureau"');
    expect(lees("components/marketing/rekentools/StuurUitkomst.tsx")).not.toMatch(/\|\| !email\.trim\(\) \|\| !consent/);
    expect(lees("components/marketing/rekentools/StuurUitkomst.tsx")).toContain('meldOntbreekt("rekentool-uitkomst"');
    expect(lees("components/marketing/rekentools/BtwCheck.tsx")).not.toMatch(/disabled=\{bezig \|\| !nummer\.trim\(\)\}/);
    expect(lees("components/marketing/rekentools/BtwCheck.tsx")).toContain('meldOntbreekt("btw-check", "nummer")');
  });

  it("de meting kent elk formulier en Beheer heeft er een naam voor", () => {
    const meting = lees("lib/analytics/formulier-meting.ts");
    const beheer = lees("components/analytics/TrafficDashboard.tsx");
    for (const naam of ["register", "website-check", "website-check-lead", "uitzendbureau", "rekentool-uitkomst", "btw-check"]) {
      expect(meting, naam).toContain(`"${naam}"`);
      expect(beheer, naam).toContain(`"${naam}":`);
    }
  });

  it("de aanmeldteksten bestaan in alle vijf talen", () => {
    const s = lees("lib/i18n/auth.ts");
    expect((s.match(/^\s+fillIn: "/gm) || []).length).toBe(5);
    expect((s.match(/^\s+listAnd: "/gm) || []).length).toBe(5);
    expect((s.match(/^\s+companyName: "/gm) || []).length).toBe(5);
    expect((s.match(/^\s+passwordWeak: "/gm) || []).length).toBe(5);
  });
});
