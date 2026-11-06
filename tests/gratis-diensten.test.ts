import { describe, expect, it } from "vitest";
import {
  GRATIS_DIENSTEN,
  GRATIS_STATUS_LABEL,
  GRATIS_STATUS_TINT,
  gratisTelling,
} from "@/lib/gratis/diensten";

describe("overzicht alles gratis", () => {
  it("elke dienst heeft een eigen id, uitleg en een eigen alternatief", () => {
    const ids = new Set<string>();
    for (const d of GRATIS_DIENSTEN) {
      expect(d.id, `id leeg bij ${d.naam}`).toMatch(/^[a-z-]+$/);
      expect(ids.has(d.id), `dubbel id ${d.id}`).toBe(false);
      ids.add(d.id);
      expect(d.naam.length).toBeGreaterThan(2);
      expect(d.waarvoor.length).toBeGreaterThan(10);
      expect(d.nu.length).toBeGreaterThan(5);
      expect(d.eigen.length).toBeGreaterThan(10);
    }
  });

  it("elke stand heeft een Nederlands label en een kleur", () => {
    for (const d of GRATIS_DIENSTEN) {
      expect(GRATIS_STATUS_LABEL[d.status]).toBeTruthy();
      expect(GRATIS_STATUS_TINT[d.status]).toBeTruthy();
    }
  });

  it("de AI staat erin en is met een knop om te zetten", () => {
    const ai = GRATIS_DIENSTEN.find((d) => d.id === "ai");
    expect(ai?.status).toBe("schakelbaar");
  });

  it("de telling klopt met de lijst", () => {
    const t = gratisTelling();
    const som = t.gratis + t.schakelbaar + t.bouwen + t.nodig;
    expect(som).toBe(GRATIS_DIENSTEN.length);
    expect(t.gratis).toBeGreaterThan(0);
  });

  it("noemt alleen namen van instellingen, nooit een waarde die op een sleutel lijkt", () => {
    for (const d of GRATIS_DIENSTEN) {
      for (const naam of d.env ?? []) {
        expect(naam, `${d.id}: ${naam}`).toMatch(/^[A-Z0-9_]+$/);
      }
      // een echte sleutel zou in de tekst niets te zoeken hebben
      const tekst = `${d.nu} ${d.eigen}`;
      expect(tekst).not.toMatch(/sk_live|AIza|[A-Za-z0-9_-]{40,}/);
    }
  });
});
