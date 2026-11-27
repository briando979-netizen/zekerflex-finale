import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Admin → Gebruikers, paneel "Verwijderde accounts". Op 25 nov 2026 haalde een opruimronde hier stil vier kolommen weg
// (waaronder Reden, terwijl het zoekveld en de CSV-export die nog gebruiken), zette de sortering om en maakte van
// "de nieuwste 500" ten onrechte "de oudste 500" — lib/admin/insights/verwijderd.ts sorteert op disabledAt desc.
// Geen enkele test keek hiernaar, dus de controle liet het door. Deze bewaker pint het vast.

const bron = readFileSync(path.join(process.cwd(), "app/admin/gebruikers/page.tsx"), "utf8");

describe("Admin → Verwijderde accounts", () => {
  it("toont alle kolommen waarop ook gezocht en geëxporteerd wordt", () => {
    for (const kolom of ["wanneer", "wie", "lid", "actief", "diensten", "door", "reden"]) {
      expect(bron, kolom).toContain(`{ key: "${kolom}", label:`);
    }
  });

  it("de nieuwste staan bovenaan, en dat zegt de tekst ook (lib/admin/insights/verwijderd.ts sorteert desc)", () => {
    expect(bron).toContain('defaultSort={{ key: "wanneer", dir: "desc" }}');
    expect(bron).toContain("de nieuwste 500 hieronder");
    expect(bron).not.toContain("de oudste 500 hieronder");
    const verwijderd = readFileSync(path.join(process.cwd(), "lib/admin/insights/verwijderd.ts"), "utf8");
    expect(verwijderd).toContain('disabledAt: "desc"');
  });

  it("legt uit wat er volgens de AVG gewist is en wat bewaard blijft", () => {
    expect(bron).toContain("zoals de wet (AVG) vereist");
  });
});
