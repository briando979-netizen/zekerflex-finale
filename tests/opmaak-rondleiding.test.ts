import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Opmaakmeting 12 nov (NL/PL/RO/UK, 320 en 390 px, ingelogd en alleen lezen): de enige echte overloop zat in de knoppenrij van de
// rondleiding. Op 320 px waren Overslaan, Vorige en Volgende samen breder dan de kaart (in NL stak "Volgende" 36 px buiten de
// kaart, in UK "Далі" 24 px). De rij mag nu omslaan.

const src = readFileSync(path.join(process.cwd(), "components/app/WerkerRondleiding.tsx"), "utf8").split("\r\n").join("\n");

describe("de knoppenrij van de rondleiding", () => {
  it("mag omslaan op een smal scherm: flex-wrap, Overslaan links, Vorige en Volgende rechts als groep", () => {
    expect(src).toContain('className="mt-4 flex flex-wrap items-center gap-2"');
    expect(src).toContain('className="btn-ghost mr-auto min-h-[44px] text-sm"');
    expect(src).toContain('className="ml-auto flex flex-wrap justify-end gap-2"');
    // de oude vaste afstandhouder (die de rij breder dan de kaart maakte) is weg
    expect(src).not.toContain('<span className="flex-1" />');
  });

  it("alle knoppen blijven minstens 44 px hoog en de focus staat nog op Volgende", () => {
    expect(src.match(/min-h-\[44px\]/g)?.length).toBe(3);
    expect(src).toContain("ref={knop}");
  });
});
