import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 23 nov 2026 (schermcontrole van de live wizard, 390 px): de kleding-chips ("Stevige schoenen", 26 px hoog), de knop "Schrijf voor
// mij" en de link naar /werkgever/locaties in stap 2 (15 px hoog) waren te klein om te tikken. Op een telefoon nu minstens 44 px;
// vanaf 640 px (sm) zijn ze zoals ze waren. Ook de chips van eigen sjablonen en het vinkje "Eenmalige locatie" zijn zo groot.

const form = readFileSync(join(process.cwd(), "components/app/NewShiftForm.tsx"), "utf8").replace(/\r\n/g, "\n");

/** De klassen van alle elementen in het formulier, als één tekenreeks per className (gewone tekst of een sjabloon). */
const klassen = [...form.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2] ?? "");
const metFragment = (fragment: string) => klassen.filter((k) => k.includes(fragment));

function tikdoel(k: string): void {
  const lijst = k.split(/\s+/);
  expect(lijst, k).toContain("min-h-[44px]");
  expect(lijst, k).toContain("sm:min-h-0");
}

describe("tikdoelen van minstens 44 px op een telefoon in de klus-wizard", () => {
  it("de knop 'Schrijf voor mij' (en 'Verbeter tekst')", () => {
    const k = metFragment("bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700");
    expect(k).toHaveLength(1);
    tikdoel(k[0] ?? "");
    expect(k[0]).toContain("inline-flex");
    expect(k[0]).toContain("items-center");
  });

  it("de kleding-chips (Stevige schoenen, Veiligheidsschoenen S3, …)", () => {
    const k = metFragment("border-ink bg-ink text-white");
    expect(k).toHaveLength(1);
    tikdoel(k[0] ?? "");
    expect(k[0]).toContain("inline-flex");
    expect(k[0]).toContain("items-center");
    // kleur en vorm blijven zoals ze waren: aan = donker, uit = wit met rand
    expect(k[0]).toContain("rounded-full border");
    expect(k[0]).toContain("border-hair bg-white text-neutralx-700");
  });

  it("de link naar /werkgever/locaties in stap 2", () => {
    const m = form.match(/<Link href="\/werkgever\/locaties" className="([^"]*)"/);
    expect(m).not.toBeNull();
    tikdoel(m?.[1] ?? "");
    expect(m?.[1]).toContain("inline-flex");
    expect(m?.[1]).toContain("items-center");
  });

  it("de chips van eigen sjablonen en het vinkje 'Eenmalige locatie'", () => {
    const chips = metFragment("border-hairstrong px-3 py-1.5 text-xs font-medium text-neutralx-600");
    expect(chips).toHaveLength(1);
    tikdoel(chips[0] ?? "");
    const label = metFragment("gap-2 text-xs font-medium text-neutralx-500");
    expect(label).toHaveLength(1);
    tikdoel(label[0] ?? "");
  });

  it("de bestaande tikdoelen blijven: stappenbalk, volgende, terug en uitzetten", () => {
    expect(form).toContain('className="btn-primary min-h-[44px] w-full disabled:opacity-50"');
    expect(form).toContain('className="btn-primary min-h-[44px] w-full sm:w-auto sm:px-10"');
    expect(form).toContain('className="btn-ghost min-h-[44px] sm:flex-shrink-0"');
  });
});
