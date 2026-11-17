import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_DICTS } from "@/lib/i18n/auth";

// 17 nov 2026 (meting d7): van de 19 werkers met een eigen ID-controle in 30 dagen scanden er 4 binnen een paar minuten
// alles opnieuw. De controle wachtte op een medewerker (in_review), maar het scherm toonde een grote knop "Gegevens aanpassen
// en opnieuw proberen" met rode uitroeptekens, en wie later terugkwam kreeg gewoon weer de keuzekaarten voor een nieuwe scan.
// Nu: bij "wacht op een mens" geen opnieuw-knop, amber in plaats van rood, en op de pagina alleen een klein "toch opnieuw".
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("ID-controle die op een medewerker wacht: niet opnieuw scannen", () => {
  const form = bron("components/app/OnboardingForm.tsx");
  const page = bron("app/dashboard/verificatie/page.tsx");

  it("na de scan: bij in_review naar het dashboard, alleen bij een afwijzing 'opnieuw proberen'", () => {
    const uitslag = form.slice(form.indexOf("if (result) {"), form.indexOf("mailto:support@zekerflex.com"));
    expect(uitslag).toContain('result.outcome === "in_review" ? (');
    expect(uitslag).toContain("{t.toDashboard}");
    // de opnieuw-knop staat in de else-tak, ná de dashboardknop
    expect(uitslag.indexOf("{t.toDashboard}")).toBeLessThan(uitslag.indexOf("{t.retry}"));
    expect(uitslag.split("{t.retry}").length).toBe(2);
    // een controle die een mens nog bekijkt is amber, niet rood
    expect(uitslag).toContain('result.outcome === "in_review" ? "bg-warn text-white" : "bg-crit text-white"');
  });

  it("wie terugkomt terwijl een mens kijkt, krijgt geen keuzekaarten maar een klein 'toch opnieuw scannen'", () => {
    expect(form).toContain("{inBehandeling && !tochScannen ? (");
    expect(form).toContain("{tochOpnieuw}");
    // de keuzekaarten zelf blijven (de bestaande tests kijken ernaar), maar achter die knop
    expect(form).toContain("onStart={(r, wz) => void startScan(r, wz)}");
    expect(page).toContain('lastCheck?.status === "PENDING" && lastCheck.decisionStatus === "in_review"');
    expect(page).toContain("inBehandeling={inBehandeling}");
    expect(page).toContain("{pt.attempt.wachtMens}");
    expect(page).toContain("tochOpnieuw={pt.attempt.tochOpnieuw}");
    // alleen de eigen controle (in_review); Stripe heeft zijn eigen wachtscherm
    expect(page).toContain("!idKlaar && lastCheck?.status");
  });

  it("de uitleg staat in alle vijf talen en zegt dat je niets opnieuw hoeft te doen", () => {
    const talen = Object.keys(AUTH_DICTS);
    expect(talen.length).toBe(5);
    const teksten = new Set<string>();
    for (const taal of talen) {
      const a = AUTH_DICTS[taal as keyof typeof AUTH_DICTS].page.attempt;
      expect(a.wachtMens.length, taal).toBeGreaterThan(40);
      expect(a.tochOpnieuw.length, taal).toBeGreaterThan(5);
      teksten.add(a.wachtMens);
    }
    // echt vertaald, niet vijf keer dezelfde tekst
    expect(teksten.size).toBe(5);
    expect(AUTH_DICTS.nl.page.attempt.wachtMens).toContain("niets opnieuw");
  });
});
