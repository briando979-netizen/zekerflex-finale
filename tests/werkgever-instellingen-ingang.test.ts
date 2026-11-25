import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { menuVoor } from "@/lib/werkgever/werkruimte";
import { bedrijfsprofielOnvolledig, heeftOmslagfoto } from "@/lib/werkgever/bedrijfsprofiel";

// Instellingen voor bedrijven, zoals bij YoungOnes (eigenaar, 23 nov 2026: "waarom heeft ZekerFlex geen instellingen voor bedrijven?").
// Het besluit van 20 nov (met de vlag `publiek-alleen-flexwerk` de regel "Instellingen" uit de zijbalk, één plek voor bedrijfsgegevens)
// is vervangen: de regel staat er voor elk bedrijf, met een stip zolang het bedrijfsprofiel niet af is.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de ingang Instellingen in de zijbalk", () => {
  const shell = lees("components/app/EmployerShell.tsx");
  const layout = lees("app/werkgever/layout.tsx");

  it("staat er voor elk bedrijf: de vlag verbergt hem niet meer", () => {
    expect(shell).not.toContain("toonInstellingen");
    expect(layout).not.toContain("toonInstellingen");
    expect(shell).toContain('settingsHref = "/werkgever/instellingen"');
    // ronde 2 (23 nov 2026): Instellingen is de laatste van de hoofdregels in de zijbalk, een gewone regel zoals de andere
    expect(shell).toContain("const instellingen: NavItem = { href: settingsHref, label: t.shell.settings, icon: <SettingsGlyph /> };");
    // de regel zelf staat niet achter een voorwaarde
    expect(shell).toMatch(/\n            <RailLink\n              item=\{instellingen\}/);
    expect(shell).not.toMatch(/&&\s*\(?\s*<RailLink\s+item=\{instellingen\}/);
  });

  it("het menu zelf is niet aangeraakt: Bedrijfsprofiel en de rest blijven staan", () => {
    // bedrijf staat altijd in het menu zonder de vlag; met alleenFlexwerk valt het weg (YoungOnes-stijl, 25 nov 2026)
    const zonder = menuVoor({ inApp: false, alleenFlexwerk: false }).map((p) => p.sleutel);
    expect(zonder).toContain("bedrijf");
    expect(zonder).toContain("hulp");
    const met = menuVoor({ inApp: false, alleenFlexwerk: true }).map((p) => p.sleutel);
    expect(met).not.toContain("bedrijf");
    expect(met).toContain("hulp");
  });


  it("de stip komt van één regel en past de zijbalk niet aan als het profiel af is", () => {
    expect(shell).toContain("profielOnvolledig = false");
    expect(shell).toContain("stip={profielOnvolledig}");
    expect(shell).toContain("stipTekst={t.shell.profileIncomplete}");
    expect(shell).toContain("{stip && <span aria-hidden");
    // een schermlezer hoort het ook, in een regel die `relative` is (anders ontsnapt de sr-only tekst, AGENTS.md)
    expect(shell).toContain("{stip && stipTekst ? <span className=\"sr-only\"> ({stipTekst})</span> : null}");
    expect(shell).toMatch(/const railRij = "group relative /);
    expect(layout).toContain("profielOnvolledig={profielExtra !== null && hasRole(principal, \"HQ_ADMIN\", \"PLATFORM_ADMIN\") && bedrijfsprofielOnvolledig(profielExtra)}");
    // amber = wacht op jou (AGENTS.md: één kleur, één betekenis); een effen vlak heeft geen donkere regel nodig
    expect(shell).toContain("h-2.5 w-2.5 rounded-full bg-warn");
  });

  it("de woorden voor de schermlezer staan in beide talen", () => {
    expect(nl.shell.profileIncomplete).toBe("bedrijfsprofiel nog niet af");
    expect(en.shell.profileIncomplete).toBe("company profile not finished yet");
  });
});

describe("het bedrijfsprofiel is af zodra er een omslagfoto is", () => {
  it("zonder foto en zonder afgeronde stap is het niet af", () => {
    expect(bedrijfsprofielOnvolledig({})).toBe(true);
    expect(bedrijfsprofielOnvolledig({ onboarding: { role: "eigenaar" } })).toBe(true);
    expect(heeftOmslagfoto({})).toBe(false);
  });

  it("een foto of een bewust afgeronde stap telt", () => {
    expect(bedrijfsprofielOnvolledig({ photoUploadId: "up_1" })).toBe(false);
    expect(bedrijfsprofielOnvolledig({ onboarding: { coverStepDone: true } })).toBe(false);
    expect(heeftOmslagfoto({ photoUploadId: "up_1" })).toBe(true);
  });
});
