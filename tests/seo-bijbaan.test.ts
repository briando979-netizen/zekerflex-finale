import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { CITIES } from "@/lib/seo-cities";
import { SECTORS } from "@/lib/seo-sectors";
import { BESCHRIJVING_MAX, TITEL_MAX } from "@/lib/seo-tekst";
import { JONGEREN_PAD } from "@/lib/marketing/jongeren";
import { BIJBAAN_PAD, BIJBAAN_SECTOREN, KNOPPEN, bijbaanHub, bijbaanHubMetadata, bijbaanStad, bijbaanStadMetadata, bijbaanStadTekst } from "@/lib/seo-bijbaan";

// /bijbaan en /bijbaan/<stad> (22 nov 2026): "bijbaan" had de meeste vertoningen in Search Console maar gaf een 404. Eén
// overzicht en een pagina per stad, met de CBS-cijfers van die stad. Eerlijk: vanaf 18 jaar (16/17 naar /nog-geen-18), met
// of zonder KVK, en geen beloftes over aantallen, verdiensten of snelheid.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const titel = (m: { title?: unknown }) => (m.title as { absolute: string }).absolute;

describe("de bijbaanpagina's", () => {
  it("bestaan als route, staan in de sitemap, in de routelijst en in de rondgang", () => {
    expect(BIJBAAN_PAD).toBe("/bijbaan");
    expect(existsSync(path.join(ROOT, "app/(marketing)/bijbaan/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "app/(marketing)/bijbaan/[stad]/page.tsx"))).toBe(true);
    const sitemap = lees("app/sitemap.ts");
    expect(sitemap).toContain('entry("/bijbaan", 0.8, "weekly")');
    expect(sitemap).toContain("...CITIES.map((c) => entry(`/bijbaan/${c.slug}`, 0.7, \"weekly\"))");
    const routes = APP_PAGES.map((p) => p.route);
    expect(routes).toContain("/bijbaan");
    expect(routes).toContain("/bijbaan/[stad]");
    expect(lees("lib/ops/rondgang.ts")).toContain('"bijbaan"');
  });

  it("titels en beschrijvingen: op Google-lengte, uniek, met het zoekwoord en de stad", () => {
    const metas = [bijbaanHubMetadata(), ...CITIES.map(bijbaanStadMetadata)];
    for (const m of metas) {
      expect(titel(m).length, titel(m)).toBeLessThanOrEqual(TITEL_MAX);
      expect(String(m.description).length, titel(m)).toBeLessThanOrEqual(BESCHRIJVING_MAX);
      expect(titel(m)).toMatch(/^Bijbaan/);
    }
    expect(new Set(metas.map(titel)).size).toBe(metas.length);
    expect(new Set(metas.map((m) => String(m.description))).size).toBe(metas.length);
    const rotterdam = CITIES.find((c) => c.slug === "rotterdam")!;
    expect(titel(bijbaanStadMetadata(rotterdam))).toBe("Bijbaan in Rotterdam: flexibele klussen bij jou in de buurt");
    expect(bijbaanStadMetadata(rotterdam).alternates?.canonical).toBe("/bijbaan/rotterdam");
    for (const c of CITIES) expect(titel(bijbaanStadMetadata(c)), c.slug).toContain(c.name);
  });

  it("de soorten bijbaan zijn de branches van de site, elk met een link naar de branchepagina (in die stad)", () => {
    expect(BIJBAAN_SECTOREN.map((s) => s.key).sort()).toEqual(SECTORS.map((s) => s.key).sort());
    expect(bijbaanHub().soorten.map((s) => s.href).sort()).toEqual(SECTORS.map((s) => `/${s.workerSlug}`).sort());
    const p = bijbaanStad(CITIES[0]!);
    for (const s of p.soorten) expect(s.href).toMatch(new RegExp(`/${CITIES[0]!.slug}$`));
    expect(bijbaanHub().steden).toHaveLength(CITIES.length);
  });

  it("eerlijk: vanaf 18 met een weg voor 16/17, met of zonder KVK, en geen beloftes", () => {
    expect(KNOPPEN.map((k) => k.href)).toEqual(["/welkom", "/app"]);
    const hub = bijbaanHub();
    const alle = [JSON.stringify(hub), ...CITIES.map((c) => bijbaanStadTekst(bijbaanStad(c)))].join("\n");
    expect(alle).toContain("Vanaf 18 jaar");
    expect(lees("components/marketing/BijbaanLanding.tsx")).toContain("JONGEREN_LINK.href");
    expect(lees("lib/seo-bijbaan.ts")).toContain("href: JONGEREN_PAD");
    expect(JONGEREN_PAD).toBe("/nog-geen-18");
    expect(alle).toContain("zonder KVK als uitzendkracht via een aangesloten uitzendbureau");
    // geen aantallen klussen of werkers, geen bedragen, geen snelheid, niets over de bank of een voorschot
    expect(alle).not.toMatch(/\d+ (open )?(klussen|diensten|bijbanen|werkers|flexwerkers)\b|€\s?\d|binnen (een|\d+) (uur|uren|dag|dagen)|dezelfde dag|direct (uitbetaald|geld)|snel uitbetaald|voorschot|ZekerFlex Bank|gegarandeerd/i);
    expect(alle).not.toMatch(/16 of 17[^.]*(kun je|mag je) (al )?(werken|aan de slag)/i);
  });

  it("één h1 per pagina, JSON-LD via ldJson met kruimelpad en vragen", () => {
    const bron = lees("components/marketing/BijbaanLanding.tsx");
    for (const naam of ["BijbaanHub", "BijbaanStad"]) {
      const start = bron.indexOf(`export function ${naam}(`);
      expect(start, naam).toBeGreaterThan(-1);
      const volgende = bron.indexOf("\nexport function ", start + 1);
      const stuk = bron.slice(start, volgende === -1 ? undefined : volgende);
      expect(stuk.match(/kop="h1"/g) ?? [], naam).toHaveLength(1);
      expect(stuk, naam).toContain("ldJson([");
      expect(stuk, naam).toContain("breadcrumbJsonLd(");
      expect(stuk, naam).toContain("faqJsonLd(p.faq)");
    }
    expect(bron).not.toMatch(/JSON\.stringify/);
    expect(bron).not.toContain('"use client"');
  });
});
