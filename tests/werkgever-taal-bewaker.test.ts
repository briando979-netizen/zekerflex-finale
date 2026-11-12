import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hardeZinnen, telVanaf } from "./hulp/harde-nl-scan";

// Bewaker voor de tweetalige werkgeversapp (Nederlands en Engels, EMPLOYER_LOCALES): een onderdeel dat /werkgever laadt mag geen nieuwe vaste
// Nederlandse zin krijgen. Nieuwe tekst hoort in lib/i18n/dictionaries.ts (nl) en dictionary-en.ts (en): server getDict(), client useT().
// De bestanden die nog Nederlands zijn staan in tests/werkgever-taal-basislijn.json met hun aantal zinnen; die lijst mag alleen kleiner worden.
// Nieuwe basislijn maken na het vertalen van een bestand: verlaag zijn getal of schrap hem uit het JSON-bestand.

const ROOT = process.cwd();
const basis = JSON.parse(readFileSync(path.join(ROOT, "tests/werkgever-taal-basislijn.json"), "utf8")) as { bestanden: Record<string, number> };

describe("werkgeversapp: geen nieuwe vaste Nederlandse zinnen", () => {
  const gevonden = telVanaf(ROOT, "app/werkgever");

  it("de scan vindt de onderdelen die /werkgever laadt", () => {
    expect(Object.keys(gevonden).length).toBeGreaterThan(20);
  });

  it("geen bestand heeft meer vaste zinnen dan de basislijn toestaat", () => {
    const fout = Object.entries(gevonden)
      .filter(([f, n]) => n > (basis.bestanden[f] ?? 0))
      .map(([f, n]) => `${f}: ${n} (basislijn ${basis.bestanden[f] ?? 0})`);
    expect(fout, "zet de tekst in lib/i18n/dictionaries.ts en dictionary-en.ts (getDict of useT)").toEqual([]);
  });

  it("de basislijn wordt alleen kleiner: een vertaald bestand verlaagt zijn getal", () => {
    const teHoog = Object.entries(basis.bestanden)
      .filter(([f, n]) => (gevonden[f] ?? 0) < n)
      .map(([f, n]) => `${f}: ${gevonden[f] ?? 0} gevonden, basislijn ${n}`);
    expect(teHoog).toEqual([]);
  });

  it("herkent een harde Nederlandse zin en laat vertaalde tekst met rust", () => {
    expect(hardeZinnen("<p>Je kunt hier niet meer inloggen met dit adres</p>")).toBe(1);
    expect(hardeZinnen("<p>{t.hint}</p>\n{/* je kunt hier niets mee doen in een commentaar */}")).toBe(0);
  });
});
