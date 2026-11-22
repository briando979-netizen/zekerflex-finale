import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { geenEchteInDeBuurt } from "@/lib/shifts/testklus";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// 22 nov 2026 (gebruikersonderzoek punt 12): een nieuwe werker zag alleen twee testklussen, één met "Speciaal voor jou", en
// nergens dat er nog geen echt werk in de buurt is. Nu één eerlijke zin bovenaan de lijst, en geen "Speciaal voor jou" op een
// testklus.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("lege klussenlijst voor een nieuwe werker", () => {
  it("geen echte klus in de buurt: alleen testklussen, of echte klussen verder dan de gekozen reistijd", () => {
    const test = { testklus: true, match: { travelMinutes: 10 } };
    const echtDichtbij = { testklus: false, match: { travelMinutes: 20 } };
    const echtVer = { testklus: false, match: { travelMinutes: 90 } };
    const echtOnbekend = { testklus: false, match: null };
    expect(geenEchteInDeBuurt([test], 45)).toBe(true);
    expect(geenEchteInDeBuurt([test, echtVer], 45)).toBe(true);
    expect(geenEchteInDeBuurt([test, echtDichtbij], 45)).toBe(false);
    // zonder gekozen reistijd of zonder bekende afstand telt een echte klus gewoon mee
    expect(geenEchteInDeBuurt([echtVer], null)).toBe(false);
    expect(geenEchteInDeBuurt([echtOnbekend], 45)).toBe(false);
  });

  it("Ontdekken zet de zin bovenaan de lijst, alleen als er wel klussen zijn (een lege lijst heeft eigen uitleg)", () => {
    const p = lees("app/dashboard/klussen/page.tsx");
    expect(p).toContain("const geenEchtInBuurt = m.shifts.length > 0 && geenEchteInDeBuurt(m.shifts, m.prefs.maxTravelMinutes);");
    const zin = p.indexOf("{t.page.geenEchtInBuurt}");
    expect(zin).toBeGreaterThan(0);
    expect(zin).toBeLessThan(p.indexOf("<MarketplaceView"));
  });

  it("geen 'Speciaal voor jou' op een testklus", () => {
    expect(lees("components/app/ShiftCard.tsx")).toContain("const special = !shift.testklus && score !== null && score >= 78;");
  });

  it("de zin in vijf talen", () => {
    expect(FREELANCER_DICTS.nl.page.geenEchtInBuurt).toBe("Er zijn nog geen klussen bij jou in de buurt. Zet meldingen aan, dan hoor je het als eerste.");
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      expect(d.page.geenEchtInBuurt.length, taal).toBeGreaterThan(20);
      if (taal !== "nl") expect(d.page.geenEchtInBuurt, taal).not.toBe(FREELANCER_DICTS.nl.page.geenEchtInBuurt);
    }
  });
});
