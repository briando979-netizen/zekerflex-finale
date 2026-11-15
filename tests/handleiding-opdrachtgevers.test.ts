import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leesVerzamelingKop } from "@/lib/kennisbank/verzameling";
import { nl } from "@/lib/i18n/dictionaries";

// De handleiding voor bedrijven (docs/kennisbank/20-opdrachtgevers, 15 nov 2026): stap voor stap, in gewoon Nederlands, en alleen wat echt kan.
// Menunamen en knoppen moeten zijn zoals de app ze toont, en er mag niets in staan wat we niet beloven (de bank staat uit).

const MAP = path.join(process.cwd(), "docs", "kennisbank", "20-opdrachtgevers");
const bestanden = readdirSync(MAP).filter((f) => f.endsWith(".md") && f !== "_verzameling.md").sort();
const tekst = (f: string) => readFileSync(path.join(MAP, f), "utf8").split("\r\n").join("\n");
const alles = bestanden.map(tekst).join("\n");

describe("de handleiding voor bedrijven", () => {
  it("bestaat uit genummerde handleidingen, elk met een eigen titel", () => {
    expect(bestanden.length).toBeGreaterThanOrEqual(14);
    const titels = bestanden.map((f) => /^#\s+(.+)$/m.exec(tekst(f))?.[1] ?? "");
    for (const [i, t] of titels.entries()) expect(t.trim().length, bestanden[i]).toBeGreaterThan(3);
    expect(new Set(titels).size).toBe(titels.length);
    bestanden.forEach((f, i) => expect(f.startsWith(String(i + 1).padStart(2, "0") + "-"), f).toBe(true));
  });

  it("de verzameling is zichtbaar voor iedereen (niet intern) en noemt wat erin staat", () => {
    const kop = leesVerzamelingKop(readFileSync(path.join(MAP, "_verzameling.md"), "utf8"), "x");
    expect(kop.intern).toBe(false);
    expect(kop.naam).toBe("Handleiding opdrachtgevers");
    expect(kop.uitleg).toContain("klus uitzetten");
  });

  it("noemt de menu's en knoppen zoals de werkgeversapp ze toont", () => {
    for (const naam of [nl.nav.start, nl.nav.klussen, nl.nav.favorieten, nl.nav.urenGoedkeuren, nl.nav.facturen, nl.nav.geblokkeerd, nl.nav.overeenkomsten, nl.nav.compliance, nl.start.placeShift]) {
      expect(alles, `"${naam}"`).toContain(naam);
    }
  });

  it("belooft niets wat niet kan: geen ZekerFlex Bank, voorschot of snelle uitbetaling", () => {
    expect(alles).not.toMatch(/ZekerFlex Bank|voorschot|snelle uitbetaling|doorverwijs/i);
  });

  it("staat in gewoon Nederlands: geen Engelse vaktaal waar een Nederlands woord bestaat", () => {
    expect(alles).not.toMatch(/\b(deploy|commit|container|dashboard-widget|workflow|onboarding-flow)\b/i);
  });

  it("noemt geen bedragen die kunnen veranderen (tarief, minimum, platformkosten)", () => {
    expect(alles).not.toMatch(/€\s?\d/);
  });

  it("elke handleiding heeft koppen en is niet leeg", () => {
    for (const f of bestanden) {
      const t = tekst(f);
      expect(t.length, f).toBeGreaterThan(500);
      expect((t.match(/^##\s/gm) ?? []).length, f).toBeGreaterThanOrEqual(2);
    }
  });
});
