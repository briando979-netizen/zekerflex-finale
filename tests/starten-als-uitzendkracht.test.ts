import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { NAV } from "@/lib/marketing/site-nav";
import { paginaFoto } from "@/lib/marketing/fotos";

// /starten-als-uitzendkracht (21 nov 2026): de uitleg voor werkers over uitzendwerk, in de opbouw van de pagina van YoungOnes
// maar met eigen tekst, eigen foto's en de app op een telefoon. Op contract bij een uitzendbureau, nooit bij ZekerFlex.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const bron = lees("app/(marketing)/starten-als-uitzendkracht/page.tsx");
const telefoon = lees("components/marketing/UitzendTelefoon.tsx");

describe("/starten-als-uitzendkracht", () => {
  it("bestaat, staat in de sitemap, onder Hoe het werkt bij werkers, en de oude /uitzendbureau verwijst ernaar", () => {
    expect(APP_PAGES.map((p) => p.route)).toContain("/starten-als-uitzendkracht");
    expect(lees("app/sitemap.ts")).toContain(`"/starten-als-uitzendkracht"`);
    const hoe = NAV.find((n) => n.href === "/#hoe-het-werkt");
    expect(hoe?.menu?.werknemers.items.map((i) => i.href)).toContain("/starten-als-uitzendkracht");
    expect(lees("next.config.mjs")).toContain('{ source: "/uitzendbureau", destination: "/starten-als-uitzendkracht", permanent: false }');
    expect(paginaFoto("starten-als-uitzendkracht")).toBeDefined();
  });

  it("zes stappen, met de app op de telefoon bij het filter, de klus en de lijst", () => {
    expect(bron.match(/\n    titel: "/g)).toHaveLength(6);
    for (const scherm of ['scherm: "filter"', 'scherm: "klus"', 'scherm: "lijst"']) expect(bron, scherm).toContain(scherm);
    expect(bron).toContain('bijschrift="Voorbeeld uit de app"');
  });

  it("eerlijk: het uitzendbureau is de werkgever, geen YoungCapital, geen ZekerFlex als werkgever", () => {
    for (const tekst of [bron, telefoon]) {
      expect(tekst).not.toMatch(/YoungCapital|YoungOnes/);
      expect(tekst).not.toMatch(/ZekerFlex is (je|de) werkgever|contract bij ZekerFlex/);
    }
    expect(bron).toContain("dat bureau is je werkgever");
    // de telefoon gebruikt de teksten van de app zelf, dus "Op contract bij een uitzendbureau" en de knop van de app
    expect(telefoon).toContain("nl.market.typeUitzend");
    expect(telefoon).toContain("nl.detail.partnerKnop");
  });
});
