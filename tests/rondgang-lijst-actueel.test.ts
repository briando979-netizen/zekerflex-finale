import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { openbareRoutes } from "@/lib/ops/rondgang";

// De nachtelijke rondgang haalt de pagina's uit lib/dev/app-pages.generated.ts. Is die lijst verouderd, dan wordt een nieuwe
// openbare pagina nooit gecontroleerd (13 nov: /website-maken ontbrak). Deze test vergelijkt de lijst met de echte pagina's van
// de openbare site (app/(marketing)). Vernieuwen: node scripts/gen-app-pages.mjs.

const MARKETING = path.join(process.cwd(), "app", "(marketing)");

function paginas(map: string, voorvoegsel: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const vol = path.join(map, naam);
    if (statSync(vol).isDirectory()) uit.push(...paginas(vol, `${voorvoegsel}/${naam}`));
    else if (naam === "page.tsx") uit.push(voorvoegsel === "" ? "/" : voorvoegsel);
  }
  return uit;
}

describe("de routelijst van de rondgang is actueel", () => {
  const echt = paginas(MARKETING, "").filter((r) => !r.includes("["));

  it("elke vaste pagina van app/(marketing) staat in de gegenereerde lijst", () => {
    const inLijst = new Set(APP_PAGES.map((p) => p.route));
    expect(echt.filter((r) => !inLijst.has(r))).toEqual([]);
  });

  it("de nieuwe pagina /website-maken wordt meegenomen in de ronde", () => {
    expect(openbareRoutes()).toContain("/website-maken");
  });
});