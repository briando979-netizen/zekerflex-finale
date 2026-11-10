import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// De eigenaar (10 nov): de regel "Extra informatie" hoort niet op de klus-kaart in de feed (bij
// testklussen stond er op elke kaart "(Test klus)"). Bij de klus zelf blijft hij staan, en het
// voorbeeld in het werkgeversformulier volgt de kaart.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("extra informatie bij een klus", () => {
  it("staat niet op de klus-kaart en niet in het voorbeeld van die kaart", () => {
    expect(lees("components/app/ShiftCard.tsx")).not.toMatch(/shift\.extraInfo/);
    const formulier = lees("components/app/NewShiftForm.tsx");
    expect(formulier).not.toMatch(/Extra informatie:<\/span>/);
    expect(formulier).not.toMatch(/Staat op de klus-kaart/);
  });

  it("staat wel op de pagina van de klus", () => {
    expect(lees("app/dashboard/klussen/[shiftId]/page.tsx")).toMatch(/s\.extraInfo && \(/);
  });
});
