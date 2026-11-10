import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// De eigenaar (10 nov): boven de titel van een klus staat de naam van het bedrijf, niet de
// vestiging. Een klus op een los adres heeft als vestiging "Eenmalige locatie — <adres>", en
// dat stond op elke kaart. Het adres staat al in de regel eronder (plaats, afstand) en op de
// klus-pagina bij de kaart. Verbergen blijft op de vestigingsnaam (ShiftMenu → hidden.has(branch)),
// zodat eerder verborgen opdrachtgevers verborgen blijven.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("bedrijfsnaam op de klus", () => {
  it("elke kaart krijgt de naam van het bedrijf mee (feed, klus-pagina, mijn klussen)", () => {
    const markt = lees("lib/dashboard/marketplace.ts");
    expect(markt).toMatch(/^\s+company: string;/m);
    expect(markt.match(/company: (s|row)\.branch\.tenant\.name,/g)).toHaveLength(2);
    expect(markt).toMatch(/clientName: row\.branch\.tenant\.name,/);
    expect(lees("lib/dashboard/my-work.ts")).toMatch(/company: row\.branch\.tenant\.name,/);
  });

  it("de kaart en de klus-pagina tonen het bedrijf, niet de vestiging", () => {
    const kaart = lees("components/app/ShiftCard.tsx");
    expect(kaart).toMatch(/\{shift\.company\}/);
    expect(kaart).not.toMatch(/cleanBranchLabel\(shift\.branch\)/);
    const pagina = lees("app/dashboard/klussen/[shiftId]/page.tsx");
    expect(pagina).not.toMatch(/cleanBranchLabel/);
    expect(pagina).toMatch(/\{D\.about\(s\.company\)\}/);
    expect(pagina).toMatch(/employerName=\{s\.branch\}/);
  });

  it("zoeken in Ontdekken vindt een klus ook op de bedrijfsnaam", () => {
    expect(lees("components/app/MarketplaceView.tsx")).toMatch(/\$\{s\.company\}/);
  });
});
