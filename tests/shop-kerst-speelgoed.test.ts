import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Kerst- en speelgoedconcepten: alleen voorbeelden, nooit bestelbaar tot de eigenaar ze aanzet.
const sql = readFileSync(
  new URL("../prisma/migrations/20261113120000_shop_kerst_speelgoed_concept/migration.sql", import.meta.url),
  "utf8",
);

describe("kerst- en speelgoedconcepten", () => {
  const rijen = sql.split("\n").filter((r) => r.trim().startsWith("('cncpt_"));

  it("heeft twaalf producten, allemaal inactief en zonder voorraad", () => {
    expect(rijen).toHaveLength(12);
    for (const r of rijen) {
      expect(r).toMatch(/,false,\d+,0,false,\d+,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP\)[,;]?$/);
    }
  });

  it("heeft unieke ids en slugs", () => {
    const ids = rijen.map((r) => /^\s*\('([^']+)'/.exec(r)?.[1]);
    const slugs = rijen.map((r) => /','([a-z0-9-]+)','/.exec(r)?.[1]);
    expect(new Set(ids).size).toBe(12);
    expect(new Set(slugs).size).toBe(12);
  });

  it("belooft niets over keurmerken, levering of merken", () => {
    expect(sql).not.toMatch(/\bCE\b|keurmerk|gecertificeerd|gratis verzending|morgen in huis|op voorraad|lego|playmobil/i);
  });

  it("zet geen product aan en laat bestaande rijen met rust", () => {
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDROP\b|active\s*=\s*true/i);
    expect(sql).toContain('ON CONFLICT ("id") DO NOTHING');
  });
});