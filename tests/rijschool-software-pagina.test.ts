import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";

// /rijschool-software (15 nov): de openbare pagina voor rijscholen. Geen verzonnen cijfers, beoordelingen of prijs, en wat
// nog niet kan staat er eerlijk op.

const bron = readFileSync(path.join(process.cwd(), "app/(marketing)/rijschool-software/page.tsx"), "utf8");

describe("de pagina rijschoolsoftware", () => {
  it("staat in de rondgang en in de sitemap", () => {
    expect(APP_PAGES.map((p) => p.route)).toContain("/rijschool-software");
    expect(readFileSync(path.join(process.cwd(), "app/sitemap.ts"), "utf8")).toContain('"/rijschool-software"');
  });
  it("noemt geen prijs, aantal klanten of beoordeling", () => {
    expect(bron).not.toMatch(/€\s?\d/);
    expect(bron).not.toMatch(/\d+\s*rijscholen/i);
    expect(bron).not.toMatch(/beoordeling|sterren|reviews/i);
  });
  it("zegt eerlijk dat CBR TOP en Code 95 er nog niet in zitten", () => {
    expect(bron).toContain("CBR TOP");
    expect(bron).toContain("Code 95");
  });
  it("de knop begint de rijschool-werkruimte", () => {
    expect(bron).toContain("dashboard=rijschool");
  });
});
