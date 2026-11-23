import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_BANNER_SLUITEN, DEMO_BANNER_WERKER, DEMO_BANNER_WERKGEVER } from "@/components/app/demo-banner-texts";

// 23 nov 2026 (schermcontrole van de live site, 390 px): op de balk bovenaan de kijk-mee-sessie was "Maak een bedrijfsaccount" 24 px
// hoog en "Sluit voorbeeld" 16 px hoog. Op een telefoon nu minstens 44 px; vanaf 640 px (sm) de balk zoals hij was.

const bron = readFileSync(join(process.cwd(), "components/app/DemoBanner.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("de balk van de kijk-mee-sessie op een telefoon", () => {
  const links = [...bron.matchAll(/<Link\s+href=\{([^}]+)\}\s+className="([^"]+)"/g)].map((m) => ({ href: m[1] ?? "", klassen: m[2] ?? "" }));

  it("heeft twee links: de knop om een account te maken en 'Sluit voorbeeld'", () => {
    expect(links.map((l) => l.href)).toEqual(["href", "VOORBEELD_UITGANG"]);
    expect(DEMO_BANNER_SLUITEN).toBe("Sluit voorbeeld");
    expect(DEMO_BANNER_WERKGEVER.knop).toBe("Maak een bedrijfsaccount");
    expect(DEMO_BANNER_WERKER.knop).toBe("Maak gratis je profiel");
  });

  it("beide links zijn op een telefoon minstens 44 px hoog en gecentreerd, en vanaf sm weer zoals voorheen", () => {
    for (const l of links) {
      const k = l.klassen.split(/\s+/);
      expect(k, l.href).toContain("min-h-[44px]");
      expect(k, l.href).toContain("inline-flex");
      expect(k, l.href).toContain("items-center");
      expect(k, l.href).toContain("sm:min-h-0");
    }
  });

  it("de knop houdt zijn kleuren en de tweede link zijn onderstreping (geen ander uiterlijk)", () => {
    expect(links[0]?.klassen).toContain("rounded-full bg-brand-mint");
    expect(links[0]?.klassen).toContain("text-ink");
    expect(links[1]?.klassen).toContain("underline underline-offset-2");
    expect(links[1]?.klassen).toContain("text-white/90");
  });
});
