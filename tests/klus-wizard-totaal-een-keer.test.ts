import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 23 nov 2026 (schermcontrole van de live wizard, 1366 px): het totaal stond twee keer in beeld, bij de knop én in het voorbeeld ernaast.
// Nu staat de kostenregel op elke schermbreedte één keer: op een telefoon vlak boven de knop, op een laptop (lg, 1024 px en breder) in
// het voorbeeld naast het formulier.

const form = readFileSync(join(process.cwd(), "components/app/NewShiftForm.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("de kostenregel staat per schermbreedte één keer in de wizard", () => {
  const blokken = [...form.matchAll(/<KostenBlok \{\.\.\.kostenRegels\} className="([^"]*)" \/>/g)].map((m) => m[1] ?? "");

  it("twee plekken, die elkaar uitsluiten: op een telefoon bij de knop (lg:hidden), op een laptop in het voorbeeld (hidden lg:block)", () => {
    expect(blokken).toEqual(["lg:hidden", "mt-3 hidden lg:block"]);
  });

  it("bij de knop staat op een laptop niet ook nog eens het totaal", () => {
    expect(form).not.toContain("{kostenRegels.totaal}");
    expect(form).not.toContain("{kostenTekst.kostenTotaal}");
    expect(form).not.toMatch(/hidden items-baseline justify-between gap-3 text-sm lg:flex/);
  });

  it("de plek bij de knop is alleen voor een nieuwe klus met kosten, en het voorbeeld blijft de volledige regel tonen", () => {
    expect(form).toContain('{!edit && kostenZichtbaar && (\n            <KostenBlok {...kostenRegels} className="lg:hidden" />\n          )}');
    expect(form).toContain('{kostenZichtbaar && <KostenBlok {...kostenRegels} className="mt-3 hidden lg:block" />}');
    // het totaal zit in de lijst zelf (loon, platformkosten, totaal), niet apart ernaast
    expect(form).toContain("totaalLabel={teksten.kostenTotaal}");
    expect((form.match(/totaalLabel=/g) ?? []).length).toBe(1);
  });
});
