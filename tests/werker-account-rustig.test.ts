import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Het scherm Account van de werker (/dashboard/account) blijft rustig voor iemand
// die nog niets gedaan heeft (20 nov): geen "Ziek melden" zonder geplande of eerder aangenomen klus,
// geen vijf grijze sterren met drie nullen, en de oproep om het profiel af te
// maken staat bovenaan.
const bron = readFileSync(join(__dirname, "..", "app/dashboard/account/page.tsx"), "utf8");

describe("werker — scherm Account", () => {
  it("toont Ziek melden met een geplande of eerder aangenomen klus (ook tijdens een lopende klus), zonder extra vraag aan de database", () => {
    expect(bron).toContain("const heeftGeplandeKlus = overview.kpis.upcoming > 0;");
    expect(bron).toContain("{isUitzend && (heeftGeplandeKlus || matched > 0) && (");
    expect(bron).not.toContain("{isUitzend && heeftGeplandeKlus && (");
    expect(bron).not.toMatch(/\{isUitzend && \(\s*<div className="mb-4">\s*<ZiekMelden/);
  });

  it("verbergt sterren en tellers zolang alles nul is; naam en foto blijven", () => {
    expect(bron).toContain(
      "const nogNietsGedaan = reviews.count === 0 && matched === 0 && notCompleted === 0 && replacementsArranged === 0;",
    );
    const start = bron.indexOf("{!nogNietsGedaan && (");
    expect(start).toBeGreaterThan(-1);
    // sterren, het aantal beoordelingen en de drie tellers staan binnen die voorwaarde
    for (const stuk of ['"★★★★★".slice(0, stars)', "t.reviews(reviews.count)", "t.statsTitle", "<Stat value={matched}"]) {
      expect(bron.indexOf(stuk), stuk).toBeGreaterThan(start);
    }
    // foto en naam staan ervoor, dus altijd zichtbaar
    expect(bron.indexOf("card?.avatarUrl")).toBeLessThan(start);
    expect(bron.indexOf("{card?.name ?? principal.email}")).toBeLessThan(start);
  });

  it("zet de oproep om het profiel af te maken bovenaan, vóór Ziek melden en de profielkaart", () => {
    const oproep = bron.indexOf("{t.finishProfile}");
    expect(oproep).toBeGreaterThan(bron.indexOf("<PageHeader title={t.title} />"));
    expect(oproep).toBeLessThan(bron.indexOf("<ZiekMelden"));
    expect(oproep).toBeLessThan(bron.indexOf("{/* Profile header */}"));
    // één keer, niet ook nog onder de kaart
    expect(bron.split("{t.finishProfile}").length - 1).toBe(1);
  });

  it("heeft geen regel ZekerFlex OS meer in de lijst van de werker", () => {
    expect(bron).not.toContain('label: "ZekerFlex OS"');
    expect(bron).not.toMatch(/href: "\/os"/);
  });
});
