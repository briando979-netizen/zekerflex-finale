import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 22 nov 2026, eigenaar: "deze balk Werkers | Bedrijven is niet meer te zien op de telefoon en zit in het hamburgermenu;
// bouw er een extra voor op de balk boven, naast het hamburgermenu".

const kop = readFileSync(path.join(process.cwd(), "components/marketing/SiteHeader.tsx"), "utf8").split("\r\n").join("\n");

describe("de schakelaar Werkers | Bedrijven op de telefoon", () => {
  const mobiel = kop.slice(kop.indexOf('<div className="ml-auto flex items-center gap-1.5 sm:gap-2 xl:hidden">'));

  it("staat in de bovenbalk naast de menuknop (onder 1280px, ook op een kleine laptop), met allebei de kanten", () => {
    expect(mobiel.length).toBeGreaterThan(0);
    const blok = mobiel.slice(0, mobiel.indexOf("ref={burgerRef}"));
    expect(blok).toContain('aria-label="Werkers of bedrijven"');
    expect(blok).toContain('href="/"');
    expect(blok).toContain('href="/bedrijven"');
    expect(blok).toContain("Werkers");
    expect(blok).toContain("Bedrijven");
  });

  it("de hoofdknop past er pas vanaf 640px naast, en onder 380px wijkt alleen de naam (het beeldmerk blijft)", () => {
    expect(mobiel).toContain("hidden whitespace-nowrap rounded-full bg-white px-3.5 py-2 text-sm font-bold text-ink transition hover:bg-white/90 sm:inline-block");
    expect(kop).toContain('font-display text-lg font-bold tracking-tight max-[379px]:sr-only">ZekerFlex');
    expect(kop).toContain('className="relative flex flex-shrink-0 items-center gap-2.5" aria-label="ZekerFlex home"');
  });
});
