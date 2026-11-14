import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { CITIES } from "@/lib/seo-cities";
import { EXTRA_ADRESSEN, REGIO_STEDEN, dagNummer, openbareRoutes, stadSoorten, stadSteekproef } from "@/lib/ops/rondgang";

// De rondgang (14 nov) bleef op 105 pagina's: de nieuwe regiopagina's zijn dynamisch ([stad]) en vielen erbuiten.
// Nu per soort stadspagina twee per nacht (één uit alle steden, één regiostad), steeds een andere.

const DYNAMISCH = new Set(APP_PAGES.filter((p) => p.dynamic).map((p) => p.route));

describe("de rondgang dekt de pagina's van vannacht", () => {
  it("de vaste pagina's staan erin", () => {
    const r = openbareRoutes();
    for (const p of ["/bedrijven", "/demo", "/klus-plaatsen", "/register", "/website-check", "/uitzendbureau", "/personeel-inhuren", "/freelance-werk"]) expect(r, p).toContain(p);
    expect(EXTRA_ADRESSEN).toContain("/register?type=bedrijf");
  });

  it("elke soort stadspagina bestaat als route", () => {
    for (const soort of stadSoorten()) expect(DYNAMISCH.has(`/${soort}/[stad]`), soort).toBe(true);
    for (const stad of REGIO_STEDEN) expect(CITIES.some((c) => c.slug === stad), stad).toBe(true);
  });

  it("per nacht per soort hooguit twee pagina's, waarvan minstens één regiostad; geen dubbele", () => {
    const n = stadSteekproef(dagNummer(new Date("2026-11-14T03:00:00+01:00")));
    expect(new Set(n).size).toBe(n.length);
    expect(n.length).toBeLessThanOrEqual(stadSoorten().length * 2);
    for (const soort of stadSoorten()) {
      const hier = n.filter((r) => r.startsWith(`/${soort}/`));
      expect(hier.length, soort).toBeGreaterThanOrEqual(1);
      expect(hier.some((r) => (REGIO_STEDEN as readonly string[]).includes(r.split("/")[2] ?? "")), soort).toBe(true);
    }
  });

  it("elke stad komt per soort binnen ±4 weken langs, elke regiostad binnen 5 nachten", () => {
    const steden = CITIES.map((c) => c.slug);
    const start = dagNummer(new Date("2026-11-14T03:00:00+01:00"));
    const gezien = new Set<string>();
    for (let d = 0; d < steden.length; d++) for (const r of stadSteekproef(start + d)) gezien.add(r);
    for (const soort of stadSoorten()) for (const stad of steden) expect(gezien.has(`/${soort}/${stad}`), `${soort}/${stad}`).toBe(true);
    const regio = new Set<string>();
    for (let d = 0; d < REGIO_STEDEN.length; d++) for (const r of stadSteekproef(start + d)) regio.add(r);
    for (const stad of REGIO_STEDEN) expect(regio.has(`/personeel-inhuren/${stad}`), stad).toBe(true);
  });

  it("een andere nacht geeft andere steden; dezelfde nacht dezelfde (geen toeval)", () => {
    const a = stadSteekproef(20_000);
    expect(stadSteekproef(20_000)).toEqual(a);
    expect(stadSteekproef(20_001)).not.toEqual(a);
  });

  it("het dagnummer volgt de Amsterdamse dag, niet UTC", () => {
    expect(dagNummer(new Date("2026-11-14T23:30:00Z"))).toBe(dagNummer(new Date("2026-11-15T12:00:00+01:00")));
    expect(dagNummer(new Date("2026-11-14T22:30:00Z"))).toBe(dagNummer(new Date("2026-11-14T12:00:00+01:00")));
  });
});
