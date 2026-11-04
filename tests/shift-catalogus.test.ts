import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHIFT_TEMPLATES, sjabloonBranches } from "@/lib/shifts/catalogus";
import { SHIFT_CATEGORIES, shiftCategory } from "@/lib/shifts/category";
import { guessTemplate } from "@/lib/klusconcept/website";

describe("klus-sjablonen (lib/shifts/catalogus.ts)", () => {
  it("elke titel valt in zijn eigen branche, zodat de kaart de juiste foto krijgt", () => {
    for (const t of SHIFT_TEMPLATES) expect(shiftCategory(t.label, null).key, t.label).toBe(t.branche);
  });

  it("unieke keys, en de zes oude keys bestaan nog (sectorpagina's en klusconcepten)", () => {
    const keys = SHIFT_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ["vakkenvuller", "kassa", "magazijn", "schoonmaak", "horeca", "receptie"]) expect(keys).toContain(k);
  });

  it("richttarief op of boven het minimum, en een gewone pauze", () => {
    for (const t of SHIFT_TEMPLATES) {
      expect(t.hourlyRateCents, t.key).toBeGreaterThanOrEqual(1620);
      expect([0, 15, 30, 45, 60], t.key).toContain(t.breakMinutes);
      expect(t.description.length, t.key).toBeGreaterThan(20);
    }
  });

  it("elke branche heeft minstens drie sjablonen en een eigen foto", () => {
    for (const c of SHIFT_CATEGORIES) {
      expect(fs.existsSync(path.join(process.cwd(), "public", c.photo)), c.photo).toBe(true);
      if (c.key === "algemeen") continue;
      expect(SHIFT_TEMPLATES.filter((t) => t.branche === c.key).length, c.key).toBeGreaterThanOrEqual(3);
    }
    expect(sjabloonBranches(SHIFT_TEMPLATES, SHIFT_CATEGORIES.map((c) => c.key))).toHaveLength(SHIFT_CATEGORIES.length);
  });

  it("werk met een verplicht diploma of VOG zegt dat in de omschrijving", () => {
    for (const k of ["beveiliger", "evenementenbeveiliger", "portier", "pedagogisch", "tso", "chauffeur-c", "heftruck"]) {
      expect(SHIFT_TEMPLATES.find((t) => t.key === k)?.description, k).toMatch(/vereist/);
    }
  });
});

describe("branches herkennen aan de titel", () => {
  it("specifieke branches gaan voor de brede", () => {
    expect(shiftCategory("Evenementenbeveiliger", null).key).toBe("beveiliging");
    expect(shiftCategory("Automonteur", null).key).toBe("auto");
    expect(shiftCategory("Promotiemedewerker supermarkt", null).key).toBe("promotie");
    expect(shiftCategory("Portier horeca", null).key).toBe("beveiliging");
  });
  it("bestaande titels houden hun branche", () => {
    expect(shiftCategory("Kassamedewerker", null).key).toBe("retail");
    expect(shiftCategory("Bloemenverkoopmedewerker", null).key).toBe("retail");
    expect(shiftCategory("Magazijnmedewerker", null).key).toBe("logistiek");
    expect(shiftCategory("Kok", null).key).toBe("horeca");
    expect(shiftCategory("Iets heel anders", null).key).toBe("algemeen");
  });
});

describe("functie raden van een website wijst naar een echt sjabloon", () => {
  const keys = new Set(SHIFT_TEMPLATES.map((t) => t.key));
  const raad = (title: string) => guessTemplate({ title, koppen: [], tekst: "" });
  it.each([
    ["Bewakingsdienst Noord", "beveiliger"],
    ["Kinderdagverblijf De Vlinder", "pedagogisch"],
    ["Autobedrijf Jansen | APK en onderhoud", "automonteur"],
    ["Kwekerij Westland", "kaswerk"],
    ["Hoveniersbedrijf Groen", "hovenier"],
    ["Verhuisbedrijf Snel", "verhuizer"],
  ])("%s → %s", (title, key) => {
    expect(raad(title)).toBe(key);
    expect(keys.has(key)).toBe(true);
  });
});
