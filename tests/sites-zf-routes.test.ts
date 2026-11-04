import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Elk formulier van een klantsite (…/_zf/bestelling, _zf/chat, _zf/reservering) heeft op beide adressen
// (/site/<naam> en het eigen domein) een eigen afhandeling. Op 4 nov 2026 liet de route van /site/ een
// reservering stil doorvallen naar het contactformulier, terwijl het eigen domein hem wel kende.

const ROUTES = ["app/site/[slug]/[[...path]]/route.ts", "app/site-domein/[host]/[[...path]]/route.ts"];

describe("formulieren van klantsites", () => {
  for (const pad of ROUTES) {
    it(`${pad} handelt elk toegestaan formulier zelf af`, () => {
      const bron = readFileSync(pad, "utf8");
      const toegestaan = [...bron.matchAll(/doel !== "(_zf\/[a-z]+)"/g)].map((m) => m[1] ?? "");
      expect(toegestaan).toEqual(expect.arrayContaining(["_zf/contact", "_zf/bestelling", "_zf/chat", "_zf/reservering"]));
      for (const doel of toegestaan.filter((d) => d !== "_zf/contact")) expect(bron).toContain(`if (doel === "${doel}") return`);
    });
  }
  it("beide adressen kennen dezelfde formulieren", () => {
    const lijst = (pad: string) => [...readFileSync(pad, "utf8").matchAll(/doel !== "(_zf\/[a-z]+)"/g)].map((m) => m[1]).sort();
    expect(lijst(ROUTES[0]!)).toEqual(lijst(ROUTES[1]!));
  });
});
