import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { paginaFoto } from "@/lib/marketing/fotos";
import { NAV } from "@/lib/marketing/site-nav";
import { isNietFlexwerkPad } from "@/lib/marketing/flexwerk-only";

// /uitzendpartner (21 nov 2026): uitzendbureaus zetten hun klussen op ZekerFlex en blijven zelf de werkgever. De pagina belooft
// niets wat er niet is: geen aantallen bureaus of plaatsingen, de prijs komt uit lib/pricing/tiers.ts, en ZekerFlex noemt zich
// bij deze klussen geen werkgever.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const bron = lees("app/(marketing)/uitzendpartner/page.tsx");

describe("de pagina voor uitzendbureaus", () => {
  it("staat in de sitemap, de rondgang en het menu voor bedrijven, en heeft een foto", () => {
    expect(lees("app/sitemap.ts")).toContain('"/uitzendpartner"');
    expect(APP_PAGES.map((p) => p.route)).toContain("/uitzendpartner");
    expect(paginaFoto("uitzendpartner")).toBeDefined();
    expect(isNietFlexwerkPad("/uitzendpartner")).toBe(false);
    const hrefs = NAV.flatMap((n) => (n.menu?.bedrijven.items ?? []).map((i) => i.href));
    expect(hrefs).toContain("/uitzendpartner");
    expect(lees("app/(marketing)/uitzendbureau/page.tsx")).toContain('href="/uitzendpartner"');
  });

  it("de prijs komt uit de staffel, en er staan geen aantallen bureaus of plaatsingen", () => {
    expect(bron).toContain("BASE_FEE_PER_HOUR_CENTS");
    expect(bron).not.toMatch(/€\s?\d/);
    expect(bron).not.toMatch(/\d+\s*(bureaus|klanten|plaatsingen|uitzendkrachten)/i);
    expect(bron).not.toMatch(/binnenkort|komt eraan/i);
  });

  it("het bureau is de werkgever, niet ZekerFlex", () => {
    expect(bron).toContain("Jouw bureau. Bij een klus van een uitzendpartner tekent de werker zijn uitzendcontract met jou");
    expect(bron).toContain("ZekerFlex is geen werkgever en geen uitlener bij die klussen");
  });
});
