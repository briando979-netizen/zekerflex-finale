import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HERO_KEUZES, HERO_KEUZE_VOLGORDE } from "@/lib/marketing/hero-keuze";
import { beoordeelTekst } from "@/lib/social/veilig";

// de pagina achter een link in (marketing): app/(marketing)/<pad>/page.tsx, of een route buiten die groep
const heeftPagina = (href: string) => {
  const pad = href.replace(/^\//, "");
  return ["app/(marketing)", "app"].some((basis) => existsSync(join(process.cwd(), basis, pad, "page.tsx")));
};

describe("keuzeschakelaar van de homepage-hero", () => {
  it("heeft twee keuzes met een eigen knop, kop, tekst en drie voordelen", () => {
    expect(HERO_KEUZE_VOLGORDE).toEqual(["werker", "werkgever"]);
    for (const k of HERO_KEUZE_VOLGORDE) {
      const v = HERO_KEUZES[k];
      expect(v.knop.length, k).toBeGreaterThan(5);
      expect(v.titleLine1.length, k).toBeGreaterThan(5);
      expect(v.lead.length, k).toBeGreaterThan(40);
      expect(v.punten).toHaveLength(3);
    }
    expect(HERO_KEUZES.werker.knop).toBe("Ik zoek werk");
    expect(HERO_KEUZES.werkgever.knop).toBe("Ik zoek personeel");
  });

  it("elke knop in de hero verwijst naar een bestaande pagina", () => {
    for (const k of HERO_KEUZE_VOLGORDE) {
      for (const cta of [HERO_KEUZES[k].ctaPrimary, HERO_KEUZES[k].ctaSecondary]) {
        expect(heeftPagina(cta.href), `${k}: ${cta.href}`).toBe(true);
      }
    }
  });

  it("belooft niets buiten de vaste feiten (bedragen, garanties, gestopte bank)", () => {
    for (const k of HERO_KEUZE_VOLGORDE) {
      const v = HERO_KEUZES[k];
      const tekst = [v.eyebrow, v.titleLine1, v.titleLine2, v.lead, ...v.punten].join(" ");
      expect(beoordeelTekst(tekst), k).toEqual({ veilig: true, reden: null });
    }
  });
});
