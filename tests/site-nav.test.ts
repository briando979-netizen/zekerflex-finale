import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aanbodVan, AANBOD, PIJLERS } from "@/lib/marketing/aanbod";
import { guideBySlug } from "@/lib/kennis/content";
import {
  AANBOD_KOLOMMEN,
  DOELGROEP_PAGINA,
  NAV,
  SNELLE_ACTIES,
  VOORBEELDSITES,
  isExternal,
  startHref,
} from "@/lib/marketing/site-nav";

const ROOT = join(__dirname, "..");

// een pagina in app/(marketing), app/<map>, een /aanbod/<slug> uit de registry of een kennisartikel
const paginaBestaat = (href: string): boolean => {
  const pad = href.split(/[?#]/)[0]!.replace(/^\//, "").replace(/\/$/, "");
  if (pad === "") return existsSync(join(ROOT, "app", "(marketing)", "page.tsx"));
  const aanbod = /^aanbod\/([a-z0-9-]+)$/.exec(pad);
  if (aanbod) return aanbodVan(aanbod[1]!) !== undefined;
  const kennis = /^kennis\/([a-z0-9-]+)$/.exec(pad);
  if (kennis && guideBySlug(kennis[1]!)) return true;
  return [join(ROOT, "app", "(marketing)", pad, "page.tsx"), join(ROOT, "app", pad, "page.tsx")].some((f) => existsSync(f));
};

const alleLinks = (): string[] => {
  const links: string[] = [];
  for (const n of NAV) {
    links.push(n.href);
    for (const v of Object.values(n.menu ?? {})) {
      links.push(v.cta.href);
      for (const m of v.items) links.push(m.href);
    }
  }
  for (const k of AANBOD_KOLOMMEN) {
    links.push(k.href);
    for (const it of k.items) links.push(it.href);
  }
  for (const lijst of Object.values(SNELLE_ACTIES)) for (const s of lijst) links.push(s.href);
  for (const d of Object.values(DOELGROEP_PAGINA)) links.push(d.href);
  links.push(VOORBEELDSITES.href, startHref("werknemers"), startHref("bedrijven"));
  return links;
};

describe("menu van de openbare site (lib/marketing/site-nav.ts)", () => {
  it("elke interne link wijst naar een bestaande pagina", () => {
    for (const href of alleLinks()) {
      if (isExternal(href)) {
        expect(href, href).toMatch(/^mailto:info@zekerflex\.com$|^tel:\+31/);
        continue;
      }
      expect(paginaBestaat(href), href).toBe(true);
    }
  });

  it("de snelle knoppen in de homepagekop wijzen naar bestaande pagina's", () => {
    const hero = readFileSync(join(ROOT, "components", "marketing", "HeroStage.tsx"), "utf8");
    const hrefs = [...hero.matchAll(/href: "(\/[^"]*)"/g)].map((m) => m[1]!);
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    for (const h of hrefs) expect(paginaBestaat(h), h).toBe(true);
  });

  it("de uitklap Aanbod toont elke pijler met al zijn producten uit de registry", () => {
    expect(AANBOD_KOLOMMEN.map((k) => k.sleutel)).toEqual(PIJLERS.map((p) => p.sleutel));
    const inMenu = AANBOD_KOLOMMEN.flatMap((k) => k.items).length;
    expect(inMenu).toBe(AANBOD.length);
  });

  it("vier snelle acties per doelgroep, elk met een korte uitleg", () => {
    for (const lijst of Object.values(SNELLE_ACTIES)) {
      expect(lijst).toHaveLength(4);
      for (const s of lijst) {
        expect(s.label.length).toBeLessThanOrEqual(24);
        expect(s.sub.length).toBeLessThanOrEqual(32);
      }
    }
  });

  it("elke rubriek heeft een overzichtslink en voor beide doelgroepen hetzelfde soort menu", () => {
    for (const n of NAV) {
      // standaardknoppen hebben een eigen overzichtstekst; een eigen knop valt terug op "Naar <label>"
      expect(n.overzicht?.length ?? 0, n.key).toBeGreaterThan(0);
      if (n.menu) expect(Object.keys(n.menu).sort()).toEqual(["bedrijven", "werknemers"]);
    }
    expect(startHref("bedrijven")).toContain("type=bedrijf");
  });
});
