import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 15 nov 2026, eigenaar: "de paspop is te groot en bedekt je hele scherm op telefoon". Op de telefoon bleef het vak bovenaan
// staan (sticky onder de kopbalk van 110px) met 44vh en minstens 300px, plus de knoppen erboven: het grootste deel van het
// scherm. Nu: kleiner op de telefoon, en weg te klikken; op een groot scherm blijft alles zoals het was.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("de paspop op de telefoon", () => {
  const src = bron("components/marketing/paskamer/Paskamer.tsx");

  it("het vak is op de telefoon kleiner, op een groot scherm ongewijzigd", () => {
    expect(src).toContain("h-[28vh] max-h-[240px] min-h-[180px]");
    expect(src).not.toContain("h-[44vh] min-h-[300px]");
    expect(src).toContain("lg:h-[calc(100vh-170px)] lg:max-h-[860px] lg:min-h-[300px]");
  });

  it("op de telefoon is hij weg te klikken; het vak blijft bestaan (alleen verborgen), zodat de 3D-paspop niet opnieuw laadt", () => {
    expect(src).toContain('${verborgen ? "max-lg:hidden" : ""}');
    expect(src).toContain("{verborgen ? p.paspopTonen : p.paspopVerbergen}");
    expect(src).toMatch(/aria-expanded=\{!verborgen\}[\s\S]{0,200}lg:hidden/);
  });

  it("de teksten staan in beide woordenlijsten", () => {
    for (const f of ["lib/i18n/dictionaries.ts", "lib/i18n/dictionary-en.ts"]) {
      expect(bron(f), f).toContain("paspopVerbergen:");
      expect(bron(f), f).toContain("paspopTonen:");
    }
  });
});
