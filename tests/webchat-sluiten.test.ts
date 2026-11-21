import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 21 nov 2026 (eigenaar): "als een medewerker de chat overnam en sluit, moet de chat weer beschikbaar zijn voor de AI en een
// nieuw gesprek laten zien". Het chatvenster ziet de status "closed" bij het pollen en begint een nieuw gesprek (nieuwe token),
// zodat het oude ticket dicht blijft en de assistent weer antwoordt.

const widget = readFileSync(path.join(process.cwd(), "components/marketing/ChatWidget.tsx"), "utf8");

describe("webchat na het sluiten door een collega", () => {
  it("begint een nieuw gesprek met de assistent", () => {
    const blok = widget.slice(widget.indexOf('if (d.status === "closed")'));
    expect(blok.length).toBeGreaterThan(0);
    expect(blok.slice(0, 300)).toContain("nieuwGesprek();");
    expect(blok.slice(0, 300)).toContain("setHuman(false);");
    expect(blok.slice(0, 300)).toContain("setMessages([GREETING, NA_SLUITEN]);");
    // vóór het overnemen van de status "human"
    expect(widget.indexOf('if (d.status === "closed")')).toBeLessThan(widget.indexOf('setHuman(d.status === "human")'));
  });

  it("de nieuwe token vervangt de oude in deze browser", () => {
    expect(widget).toMatch(/function nieuwGesprek\(\): void \{\n  try \{\n    localStorage\.setItem\("zf-webchat-id"/);
  });
});
