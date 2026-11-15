import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { btwSpecificatie, kortingRegels, totaalVan, type BonRegel } from "@/lib/horeca/kassa";
import { schermActieSchema } from "@/lib/horeca/schema";
import { SCHERMEN } from "@/lib/horeca/schermen";

// De kassa zoals een bon maken (15 nov 2026): korting als min-regels per btw-tarief, snelle verkoop met korting,
// en afhalen of bezorgen aannemen vanaf de kassa.

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const r = (prijsCent: number, aantal: number, btw: number): BonRegel => ({ naam: "x", prijsCent, aantal, btw });

describe("korting per btw-tarief", () => {
  it("geen korting geeft geen regels", () => {
    expect(kortingRegels([r(1000, 1, 9)], 0)).toEqual([]);
    expect(kortingRegels([], 10)).toEqual([]);
  });

  it("10% op 9% en 21%: een min-regel per tarief, afgerond op centen", () => {
    const regels = [r(1950, 1, 9), r(395, 2, 21)];
    const k = kortingRegels(regels, 10);
    expect(k).toEqual([
      { naam: "Korting 10%", prijsCent: -79, aantal: 1, btw: 21 },
      { naam: "Korting 10%", prijsCent: -195, aantal: 1, btw: 9 },
    ]);
    const bon = [...regels, ...k];
    expect(totaalVan(bon)).toBe(1950 + 790 - 274);
    // de btw per tarief klopt met wat er na korting overblijft
    const spec = btwSpecificatie(bon);
    expect(spec.find((s) => s.tarief === 9)?.inclCent).toBe(1950 - 195);
    expect(spec.find((s) => s.tarief === 21)?.inclCent).toBe(790 - 79);
  });

  it("nooit meer dan 100%", () => {
    expect(totaalVan(kortingRegels([r(500, 1, 9)], 250))).toBe(-500);
  });
});

describe("kassascherm", () => {
  it("snelle verkoop neemt een korting mee (standaard 0)", () => {
    const a = schermActieSchema.parse({ actie: "verkoop", mand: [{ itemId: "i1", aantal: 2 }], methode: "pin" });
    expect(a.actie === "verkoop" && a.kortingProcent).toBe(0);
    expect(schermActieSchema.safeParse({ actie: "verkoop", mand: [{ itemId: "i1", aantal: 1 }], methode: "pin", kortingProcent: 101 }).success).toBe(false);
  });

  it("de kassa mag afhalen en bezorgen aannemen; de keuken niet", () => {
    expect(SCHERMEN.kassa.acties).toContain("levering");
    expect(SCHERMEN.keuken.acties).not.toContain("levering");
    const l = schermActieSchema.safeParse({ actie: "levering", soort: "bezorgen", mand: [{ itemId: "i1", aantal: 1 }], naam: "Test", telefoon: "0612345678", adres: "Dam 1", postcode: "1012 JS", plaats: "Amsterdam", tijd: "zsm" });
    expect(l.success).toBe(true);
  });

  it("korting alleen bij één betaling, en de korting komt op de bestelling", () => {
    const k = lees("lib/horeca/kassa-server.ts");
    expect(k).toContain("Korting kan bij één betaling, niet bij splitsen.");
    expect(k).toMatch(/data: \{ kortingCent \}/);
  });
});
