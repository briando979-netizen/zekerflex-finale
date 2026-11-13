import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// Het uitzendpaneel vraagt het BSN niet: dat staat op één plek in te vullen (GegevensMist, "Je gegevens"). Het paneel toont alleen de stand.
// De loonheffingskorting staat in de aanmelding alleen hier (FiscalForm blijft de bewerkpagina onder Fiscaal).

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;

describe("UitzendPanel en het BSN", () => {
  const src = bron("components/app/UitzendPanel.tsx");

  it("heeft geen veld en geen verzoek voor het BSN: alleen de loonheffingskorting is een invoer", () => {
    expect(src.match(/<input\b/g) ?? []).toHaveLength(1);
    expect(src).toMatch(/<input\s+type="checkbox"/);
    expect(src).not.toMatch(/\bbsn\s*:/i);
    expect(src).not.toMatch(/body:\s*JSON\.stringify\(\{[^}]*bsn/i);
  });

  it("toont de stand: eindigend op de laatste vier, of dat het nog niet is ingevuld", () => {
    expect(src).toContain("f.bsnLast4 ? vulIn(t.bsnBekend, { laatste4: f.bsnLast4 }) : t.bsnOntbreekt");
  });

  it("de route van het paneel neemt geen BSN aan (PUT: alleen loonheffingskorting en IBAN)", () => {
    const route = bron("app/api/me/uitzend/route.ts");
    const schema = route.slice(route.indexOf("const putSchema"), route.indexOf("// PUT /api/me/uitzend"));
    expect(schema).not.toMatch(/bsn/i);
    expect(schema).toContain("loonheffingskorting");
  });
});

describe("teksten van de BSN-stand in vijf talen", () => {
  it("elke taal heeft beide regels; alleen 'bekend' draagt de laatste vier cijfers", () => {
    expect(FREELANCER_DICTS.nl.uitzendPanel.bsnBekend).toBe("BSN: eindigend op {laatste4} ✓ — versleuteld bewaard.");
    expect(FREELANCER_DICTS.nl.uitzendPanel.bsnOntbreekt).toBe("BSN: nog niet ingevuld. Vul het in bij “Je gegevens”.");
    for (const taal of TALEN) {
      const p = FREELANCER_DICTS[taal].uitzendPanel;
      expect(p.bsnBekend, taal).toContain("{laatste4}");
      expect(p.bsnBekend, taal).toContain("BSN");
      expect(p.bsnOntbreekt, taal).toContain("BSN");
      expect(p.bsnOntbreekt, taal).not.toContain("{");
      if (taal !== "nl") {
        expect(p.bsnBekend, taal).not.toBe(FREELANCER_DICTS.nl.uitzendPanel.bsnBekend);
        expect(p.bsnOntbreekt, taal).not.toBe(FREELANCER_DICTS.nl.uitzendPanel.bsnOntbreekt);
      }
    }
  });
});
