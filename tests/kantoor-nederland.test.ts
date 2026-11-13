import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RIT, SPOOR_EIND, STEDEN, treinX, WINKELS, winkelendePublieksgrootte } from "@/components/admin/city/nederland";

// 13 nov 2026, eigenaar: "net als Nederland: Amsterdam, Groningen, verschillende steden, een treinstation, winkels met
// mensen die daar shoppen". De rekenregels zijn puur en hier te bewijzen; de rest is tekenwerk.

describe("de trein", () => {
  const duur = RIT.in + RIT.stil + RIT.uit + RIT.weg;
  it("komt aan, staat stil aan het perron (x = 0), vertrekt en is even weg", () => {
    expect(treinX(0, 0)).toBe(-SPOOR_EIND);
    expect(treinX(0, RIT.in + 1)).toBe(0);
    expect(treinX(0, RIT.in + RIT.stil - 1)).toBe(0);
    expect(treinX(0, RIT.in + RIT.stil + RIT.uit - 0.01)).toBeGreaterThan(SPOOR_EIND * 0.99);
    expect(treinX(0, RIT.in + RIT.stil + RIT.uit + 1)).toBeNull();
    expect(treinX(0, duur)).toBe(-SPOOR_EIND);
  });

  it("het andere spoor rijdt de andere kant op, een halve rit later", () => {
    const x = treinX(1, 0);
    expect(x === null || x >= 0).toBe(true);
    expect(treinX(1, duur / 2)).toBe(SPOOR_EIND);
  });

  it("remt af naar het perron: dichterbij gaat hij langzamer", () => {
    const a = Math.abs((treinX(0, 5) ?? 0) - (treinX(0, 4) ?? 0));
    const b = Math.abs((treinX(0, RIT.in - 1) ?? 0) - (treinX(0, RIT.in - 2) ?? 0));
    expect(b).toBeLessThan(a);
  });
});

describe("winkelstraat en steden", () => {
  it("overdag druk, 's avonds minder, 's nachts bijna niemand", () => {
    expect(winkelendePublieksgrootte("dag", 40)).toBe(40);
    expect(winkelendePublieksgrootte("schemer", 40)).toBeLessThan(40);
    expect(winkelendePublieksgrootte("nacht", 40)).toBeLessThan(winkelendePublieksgrootte("schemer", 40));
  });

  it("echte Nederlandse steden, en winkels zonder merknamen", () => {
    expect(STEDEN.map((s) => s.naam)).toEqual(["Amsterdam", "Rotterdam", "Utrecht", "Groningen"]);
    for (const w of WINKELS) expect(w).toMatch(/^[A-Z][a-z]+$/);
  });

  it("zit in de motor en heeft een eigen camerastand, en laadt niets van buiten", () => {
    const scene = readFileSync(path.join(process.cwd(), "components/admin/city/scene.ts"), "utf8");
    const nl = readFileSync(path.join(process.cwd(), "components/admin/city/nederland.ts"), "utf8");
    expect(scene).toContain("const nederland = buildNederland(kit, reduced);");
    expect(scene).toContain("nederland.update(dt, now, phase);");
    expect(scene).toContain('case "station":');
    expect(nl).not.toMatch(/https?:\/\//);
    expect(readFileSync(path.join(process.cwd(), "components/admin/Office3D.tsx"), "utf8")).toContain('["station", "Station"]');
  });
});
