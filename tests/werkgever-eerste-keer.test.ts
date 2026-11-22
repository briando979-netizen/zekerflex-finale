import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { REGELS_OPGEHEVEN_PRODUCTEN, RETENTION_RULES } from "@/lib/privacy/retention";

// De eerste keer in de werkgeversapp (22 nov 2026, gebruikersonderzoek B11/B14/B27): minder poorten vóór de eerste klus.
// De verificatieplicht (lib/company/verified.ts) blijft; alleen dubbele vragen en schermen gaan weg.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("kleine fouten (punt 15)", () => {
  it("aanmelden als bedrijf zegt niet 'Gratis voor werkers.'", () => {
    expect(lees("app/register/page.tsx")).toContain('...(defaultType === "bedrijf" ? { subtitle: t.subtitle } : {}),');
  });

  it("account verwijderen van een bedrijf noemt geen rijlessen, horecareserveringen of klantsites meer", () => {
    for (const k of REGELS_OPGEHEVEN_PRODUCTEN) expect(RETENTION_RULES.some((r) => r.key === k), k).toBe(true);
    const genoemd = RETENTION_RULES.filter((r) => !REGELS_OPGEHEVEN_PRODUCTEN.includes(r.key)).map((r) => r.label).join(" ");
    expect(genoemd).not.toMatch(/rijles|rijschool|horeca|klantsite/i);
    expect(lees("app/werkgever/account/verwijderen/page.tsx")).toContain("<ErasureScopeInfo verberg={REGELS_OPGEHEVEN_PRODUCTEN}");
    const info = lees("components/privacy/ErasureScopeInfo.tsx");
    expect(info).toContain("erasableNow().filter((r) => !verberg.includes(r.key))");
    expect(info).toContain("r.blocksErasure && !verberg.includes(r.key)");
  });
});

describe("rustiger werkgeversschermen (punt 14)", () => {
  it("de opbouwfase-melding staat alleen op het startscherm, niet meer in de layout", () => {
    expect(lees("app/werkgever/layout.tsx")).not.toContain("<OpbouwfaseBalk");
    expect(lees("app/werkgever/page.tsx")).toContain("<OpbouwfaseBalk />");
  });

  it("de stappen staan één keer op het startscherm: geen tweede lijst, geen stippenrij en geen dubbele kop", () => {
    const wizard = lees("components/app/EmployerOnboardingWizard.tsx");
    expect(wizard).not.toContain("STEP_META.map(");
    expect(wizard).not.toContain("{ORDER.map((k) => (\n            <Dot");
    expect(wizard).not.toContain("panels.find((p) => p.key === open)?.title");
    // de uitklapblokken zelf blijven, met de uitleg van de stap in de kop
    expect(wizard).toContain("aria-expanded={isOpen}");
    expect(wizard).toContain('STEP_META.find((s) => s.key === p.key)?.hint');
  });
});

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
