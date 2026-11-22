import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// De eerste keer in de werkgeversapp (22 nov 2026, gebruikersonderzoek B11/B14/B27): minder poorten vóór de eerste klus.
// De verificatieplicht (lib/company/verified.ts) blijft; alleen dubbele vragen en schermen gaan weg.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de KVK-stap vraagt niet opnieuw wat al bekend is", () => {
  const wizard = lees("components/app/EmployerOnboardingWizard.tsx");

  it("een werklocatie die er al is: alleen tonen, en de server laat hem staan", () => {
    expect(wizard).toContain('<input type="hidden" name="vestigingBekend" value="1" />');
    expect(wizard).toContain("{vestiging ? (");
    expect(wizard).toContain('href="/werkgever/locaties"');
    const actie = lees("app/werkgever/onboarding/actions.ts");
    expect(actie).toContain('formData.get("vestigingBekend") === "1"');
    expect(actie).toContain("employerKvkSchema.safeParse(values)");
    const start = lees("app/werkgever/page.tsx");
    expect(start).toContain('where: { tenantId, kind: "PERMANENT" }');
    expect(start).toContain("vestiging: bestaandeVestiging ? { naam: bestaandeVestiging.name, adres: vestigingRegel(bestaandeVestiging) } : null");
  });

  it("het land van het aanmelden: alleen tonen, met een knop om het te wijzigen", () => {
    expect(wizard).toContain("useState(!landBekend)");
    expect(wizard).toContain('<input type="hidden" name="land" value={land} />');
    // de stappen hangen van het land af: zonder deze afhankelijkheden verandert het scherm niet bij "Wijzig"
    expect(wizard).toContain("[kvkState, pending, orgSaved, initial, o, vestFout, werkBranches, land, landKiezen]");
  });

  it("de nieuwe teksten staan in het Nederlands en het Engels", () => {
    for (const k of ["countryKnown", "countryChange", "vestigingBekend", "vestigingWijzig"] as const) {
      expect(nl.onboarding[k].length, k).toBeGreaterThan(2);
      expect(en.onboarding[k].length, k).toBeGreaterThan(2);
    }
    expect(nl.onboarding.countryKnown).toContain("{land}");
    expect(en.onboarding.countryKnown).toContain("{land}");
  });
});
