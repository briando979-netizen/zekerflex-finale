import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { paginaFoto } from "@/lib/marketing/fotos";
import { STANDAARD_KOLOMMEN } from "@/lib/ontwerp/menu";
import { openbareRoutes } from "@/lib/ops/rondgang";
import {
  AGENDA,
  HANDIGE_LINKS,
  LANDEN,
  RUBRIEKEN,
  RUBRIEK_SLUGS,
  STAPPEN,
  START_FAQ,
  TIPS,
  UPDATES,
  VERKOPEN_PAD,
  VERKOPEN_START_PAD,
  VERKOPERSOMGEVING_PAD,
  VERKOPER_AANMELD_PAD,
  rubriekPad,
} from "@/lib/shop/partnerplatform";
import { VERKOOP_COMMISSIE_PCT, VERKOPER_VAST_NA_DAGEN, VERKOPER_VERZENDT_BINNEN_WERKDAGEN } from "@/lib/shop/verkoper-core";

// Het Partnerplatform (/verkopen, 18 nov 2026): de openbare uitleg voor verkopers in de ZekerFlex-shop. De pagina's zeggen
// alleen wat de verkopersomgeving echt doet (lib/shop/verkoper-core.ts), staan in de sitemap en de rondgang, en bouwen geen
// tweede aanmelding.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const PAGINAS = [VERKOPEN_PAD, VERKOPEN_START_PAD, ...RUBRIEK_SLUGS.map(rubriekPad)];
const inhoud = lees("lib/shop/partnerplatform.ts");
const bronnen = [inhoud, lees("components/marketing/Verkopen.tsx"), lees("app/(marketing)/verkopen/page.tsx"), lees("app/(marketing)/verkopen/start/page.tsx")];
const alleTekst = JSON.stringify([RUBRIEKEN, LANDEN, STAPPEN, START_FAQ, UPDATES, AGENDA, TIPS, HANDIGE_LINKS]);

describe("het Partnerplatform voor verkopers", () => {
  it("elke pagina bestaat, staat in de rondgang en in de sitemap, en de startpagina heeft een foto", () => {
    const routes = APP_PAGES.map((p) => p.route);
    const rondgang = openbareRoutes();
    for (const p of PAGINAS) {
      expect(existsSync(path.join(process.cwd(), "app/(marketing)" + p, "page.tsx")), p).toBe(true);
      expect(routes, p).toContain(p);
      expect(rondgang, p).toContain(p);
    }
    const sitemap = lees("app/sitemap.ts");
    expect(sitemap).toContain("entry(VERKOPEN_PAD,");
    expect(sitemap).toContain("entry(VERKOPEN_START_PAD,");
    expect(sitemap).toContain("...RUBRIEK_SLUGS.map((s) => entry(rubriekPad(s),");
    expect(paginaFoto("verkopen")).toBeDefined();
  });

  it("vijf rubrieken, elk met echte inhoud en vragen", () => {
    expect(RUBRIEKEN.map((r) => r.slug)).toEqual([...RUBRIEK_SLUGS]);
    expect(RUBRIEKEN.map((r) => r.naam)).toEqual(["Beleid", "Aanbod", "Bestellingen & verzenden", "Zichtbaarheid", "Financiën"]);
    for (const r of RUBRIEKEN) {
      expect(r.blokken.length, r.slug).toBeGreaterThanOrEqual(3);
      expect(r.vragen.length, r.slug).toBeGreaterThanOrEqual(1);
      for (const b of r.blokken) expect(Boolean(b.tekst) || (b.punten?.length ?? 0) > 0, `${r.slug}: ${b.kop}`).toBe(true);
    }
  });

  it("de getallen komen uit de verkoopregels, niet uit de tekst", () => {
    // geen los ingetypt percentage of aantal dagen: een wijziging in verkoper-core.ts verandert de uitleg mee
    for (const b of bronnen) {
      expect(b).not.toMatch(/\b12\s*%/);
      expect(b).not.toMatch(/\b30 dagen na/);
      expect(b).not.toMatch(/binnen 2 werkdagen/);
    }
    expect(alleTekst).toContain(`${VERKOOP_COMMISSIE_PCT}% commissie`);
    expect(alleTekst).toContain(`${VERKOPER_VAST_NA_DAGEN} dagen na de bestelling`);
    expect(alleTekst).toContain(`binnen ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen`);
  });

  it("belooft alleen wat nu kan: uitbetalen per bankoverschrijving, verkopen met een Nederlands KVK-nummer", () => {
    expect(alleTekst).toContain("per bankoverschrijving");
    expect(alleTekst).not.toMatch(/stripe|automatisch uitbetaald|direct uitbetaald|dagelijks uitbetaald|verzeker/i);
    expect(LANDEN.filter((l) => l.kan).map((l) => l.sleutel)).toEqual(["nl"]);
    for (const l of LANDEN.filter((x) => !x.kan)) {
      expect(l.tekst.startsWith("Nog niet."), l.naam).toBe(true);
      expect(l.href).toBe("/contact");
    }
  });

  it("geen tweede aanmelding: de knoppen leiden naar de bestaande aanmelding en de bestaande verkopersomgeving", () => {
    expect(VERKOPER_AANMELD_PAD).toBe("/register?type=bedrijf&dashboard=webshop");
    expect(existsSync(path.join(process.cwd(), "app" + VERKOPERSOMGEVING_PAD, "page.tsx"))).toBe(true);
    for (const b of bronnen.slice(1)) {
      expect(b).not.toContain("<form");
      expect(b).not.toContain("<input");
      expect(b).not.toContain('"use client"');
    }
  });

  it("geen citaat van een klant, geen naam of kleur van een ander platform, en geen verwarring met sales-partner", () => {
    for (const b of bronnen) {
      expect(b).not.toMatch(/blockquote|<q>|\bbol\b|bol\.com/i);
      expect(b).not.toMatch(/#0000a4|#00008b/i);
    }
    // sales-partner komt alleen voor in de vraag die het verschil uitlegt
    expect(START_FAQ.filter((f) => /sales-partner/i.test(f.q + f.a))).toHaveLength(1);
    expect(lees("app/(marketing)/sales-partner/page.tsx")).not.toContain("Partnerplatform");
  });

  it("elke vaste verwijzing bestaat", () => {
    const hrefs = [...new Set([...alleTekst.matchAll(/"href":"(\/[^"?#]*)/g)].map((m) => m[1] as string))];
    expect(hrefs.length).toBeGreaterThanOrEqual(8);
    for (const h of hrefs) {
      const kandidaten = [path.join("app/(marketing)" + h, "page.tsx"), path.join("app" + h, "page.tsx")];
      expect(kandidaten.some((k) => existsSync(path.join(process.cwd(), k))), h).toBe(true);
    }
  });

  it("de agenda heeft echte, oplopende data en de stappen zijn de zes van de verkopersomgeving", () => {
    const isos = AGENDA.map((a) => a.iso);
    expect([...isos].sort()).toEqual(isos);
    for (const a of AGENDA) expect(a.iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(STAPPEN).toHaveLength(6);
    for (const s of STAPPEN) expect(s.tijd.length, s.titel).toBeGreaterThan(3);
  });

  it("te vinden vanuit de voettekst van de site en vanuit de shop", () => {
    expect(STANDAARD_KOLOMMEN.flatMap((k) => k.links).some((l) => l.href === VERKOPEN_PAD && l.label === "Verkopen via ZekerFlex")).toBe(true);
    const shop = lees("components/marketing/ShopChrome.tsx");
    expect(shop.match(/t\.shop\.sellVia/g)?.length).toBe(2);
    expect(lees("lib/i18n/dictionaries.ts")).toContain('sellVia: "Verkopen via ZekerFlex"');
    expect(lees("lib/i18n/dictionary-en.ts")).toContain('sellVia: "Sell via ZekerFlex"');
  });

  it("JSON-LD loopt via ldJson", () => {
    for (const b of bronnen.slice(1)) {
      expect(b).toContain("ldJson(");
      expect(b).not.toContain("JSON.stringify");
    }
  });
});
