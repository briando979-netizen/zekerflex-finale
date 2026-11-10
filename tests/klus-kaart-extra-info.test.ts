import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// De eigenaar (10 nov): "Extra informatie" overal weg bij de klussen. Eerst van de kaart in de
// feed (bij testklussen stond op elke kaart "(Test klus)"), daarna ook van de klus-pagina, de
// weergave voor de werkgever en het formulier. Een bestaande waarde blijft bij bewerken bewaard
// (de kolom en de API blijven), hij wordt alleen nergens meer getoond of gevraagd.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("extra informatie bij een klus", () => {
  it("staat niet op de klus-kaart en niet op de klus-pagina van de werker", () => {
    expect(lees("components/app/ShiftCard.tsx")).not.toMatch(/shift\.extraInfo/);
    const pagina = lees("app/dashboard/klussen/[shiftId]/page.tsx");
    expect(pagina).not.toMatch(/s\.extraInfo/);
    expect(pagina).not.toMatch(/card\.extraInfo/);
  });

  it("de werkgever ziet en vult hem ook niet meer, maar een oude waarde gaat bij bewerken niet verloren", () => {
    expect(lees("app/werkgever/diensten/[shiftId]/page.tsx")).not.toMatch(/Extra informatie/);
    const formulier = lees("components/app/NewShiftForm.tsx");
    expect(formulier).not.toMatch(/Extra informatie/);
    expect(formulier).not.toMatch(/name="extraInfo"/);
    expect(formulier).toMatch(/const \[extraInfo\] = useState\(init\?\.extraInfo \?\? ""\)/);
  });
});
