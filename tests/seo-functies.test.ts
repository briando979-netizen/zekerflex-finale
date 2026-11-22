import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { CITIES } from "@/lib/seo-cities";
import { SECTORS } from "@/lib/seo-sectors";
import { FOTOS } from "@/lib/marketing/fotos";
import { SHIFT_TEMPLATES } from "@/lib/shifts/catalogus";
import { euro } from "@/lib/kennis/tarieven-overzicht";
import { gelijkenis, stadCijfers, waardeVan, woorden } from "@/lib/seo-stad";
import { BESCHRIJVING_MAX, TITEL_MAX } from "@/lib/seo-tekst";
import { STANDAARD_KOLOMMEN } from "@/lib/ontwerp/menu";
import { NAV, kantVanPad } from "@/lib/marketing/site-nav";
import { rondgangRoutes } from "@/lib/ops/rondgang";
import {
  FUNCTIES,
  WERKEN_ALS_PAD,
  functieFoto,
  functieMetadata,
  functiePagina,
  functieTekst,
  functiesVan,
  grootsteSteden,
  tariefVan,
  werkenAlsHub,
  werkenAlsHubMetadata,
} from "@/lib/seo-functies";

// /werken-als en /werken-als/<functie> (22 nov 2026): Search Console liet vertoningen zien op "werken als schoonmaker",
// "werken bij schoonmaakbedrijf" en andere functies, zonder eigen pagina. Elke functie heeft een eigen dataset, het
// richttarief komt uit de catalogus (dezelfde bron als /tarieven-overzicht), en elk paar pagina's blijft onder de 40%
// gelijkenis, gemeten zoals tests/seo-stad-gelijkenis.test.ts (Jaccard over 5-woordstukjes van de eerste 400 woorden).

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const titel = (m: { title?: unknown }) => (m.title as { absolute: string }).absolute;
const GRENS = 0.4;

describe("de functiepagina's (/werken-als)", () => {
  it("bestaan als route en staan in de sitemap, de routelijst, de rondgang, de voettekst en het menu", () => {
    expect(WERKEN_ALS_PAD).toBe("/werken-als");
    expect(existsSync(path.join(ROOT, "app/(marketing)/werken-als/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "app/(marketing)/werken-als/[functie]/page.tsx"))).toBe(true);
    const sitemap = lees("app/sitemap.ts");
    expect(sitemap).toContain('entry("/werken-als", 0.8, "weekly")');
    expect(sitemap).toContain('...FUNCTIES.map((f) => entry(functiePad(f), 0.7, "monthly"))');
    const routes = APP_PAGES.map((p) => p.route);
    expect(routes).toContain("/werken-als");
    expect(routes).toContain("/werken-als/[functie]");
    const nacht = rondgangRoutes(new Date("2026-11-22T05:20:00+01:00"));
    expect(nacht).toContain("/werken-als");
    for (const f of FUNCTIES) expect(nacht, f.slug).toContain(`/werken-als/${f.slug}`);
    expect(STANDAARD_KOLOMMEN.flatMap((k) => k.links).some((l) => l.href === "/werken-als")).toBe(true);
    const branches = NAV.find((n) => n.key === "branches");
    expect(branches?.menu?.werknemers.items.map((i) => i.href)).toContain("/werken-als");
    expect(kantVanPad("/werken-als")).toBe("werknemers");
    expect(kantVanPad("/werken-als/orderpicker")).toBe("werknemers");
  });

  it("de branchehubs (/<branche>-vacatures) en /bijbaan linken naar de functies", () => {
    const sector = lees("components/marketing/SectorLanding.tsx");
    expect(sector).toContain("functiesVan(s.key).map(functieLink)");
    expect(lees("components/marketing/BijbaanLanding.tsx")).toContain("FUNCTIES.map(functieLink)");
  });

  it("±24 functies, verdeeld over alle branches, elk met een eigen dataset", () => {
    expect(FUNCTIES.length).toBeGreaterThanOrEqual(20);
    expect(FUNCTIES.length).toBeLessThanOrEqual(30);
    expect(new Set(FUNCTIES.map((f) => f.slug)).size).toBe(FUNCTIES.length);
    for (const s of SECTORS) expect(functiesVan(s.key).length, s.key).toBeGreaterThanOrEqual(2);
    const vragen = new Set<string>();
    for (const f of FUNCTIES) {
      expect(f.slug, f.slug).toMatch(/^[a-z0-9-]+$/);
      expect(SECTORS.some((s) => s.key === f.branche), f.slug).toBe(true);
      expect(f.taken.length, f.slug).toBeGreaterThanOrEqual(3);
      expect(f.taken.length, f.slug).toBeLessThanOrEqual(5);
      expect(f.nodig.length, f.slug).toBeGreaterThanOrEqual(3);
      expect(f.faq.length, f.slug).toBeGreaterThanOrEqual(3);
      expect(f.faq.length, f.slug).toBeLessThanOrEqual(4);
      expect(f.intro.length, f.slug).toBeGreaterThan(120);
      expect(f.tijden.length, f.slug).toBeGreaterThan(100);
      for (const v of Object.values(f.voorWie)) expect(v.length, f.slug).toBeGreaterThan(30);
      for (const v of f.faq) {
        expect(vragen.has(v.q), `${f.slug}: ${v.q}`).toBe(false);
        vragen.add(v.q);
      }
      // de foto staat in de fotobibliotheek (lib/marketing/fotos.ts)
      expect(FOTOS.some((x) => x.slug === f.foto), f.slug).toBe(true);
      expect(functieFoto(f)?.slug, f.slug).toBe(f.foto);
    }
    // "werken bij schoonmaakbedrijf" heeft een eigen antwoord
    expect(FUNCTIES.find((f) => f.slug === "schoonmaker")?.faq.some((v) => /schoonmaakbedrijf/.test(v.q))).toBe(true);
  });

  it("het richttarief komt uit de catalogus (zoals /tarieven-overzicht); zonder tarief geen bedrag", () => {
    for (const f of FUNCTIES) {
      const t = SHIFT_TEMPLATES.find((x) => x.key === f.tarief);
      expect(t, `${f.slug}: ${f.tarief}`).toBeDefined();
      const p = functiePagina(f);
      expect(tariefVan(f)?.cents, f.slug).toBe(t?.hourlyRateCents);
      expect(p.tarief.bedrag, f.slug).toBe(`${euro(t?.hourlyRateCents ?? 0)} per uur`);
      expect(p.tarief.tekst, f.slug).toContain(`'${t?.label ?? ""}'`);
      expect(p.tarief.tekst, f.slug).toContain("exclusief btw");
      expect(p.tarief.bron.href).toBe("/tarieven-overzicht");
    }
    const zonder = functiePagina({ ...FUNCTIES[0]!, tarief: null });
    expect(zonder.tarief.bedrag).toBeNull();
    expect(zonder.tarief.tekst).not.toMatch(/€/);
    expect(titel(functieMetadata({ ...FUNCTIES[0]!, tarief: null }))).not.toMatch(/tarief/);
    // een bedrag staat alleen in het tariefblok, nergens anders op de pagina
    for (const f of FUNCTIES) {
      const p = functiePagina(f);
      expect(functieTekst({ ...p, tarief: { ...p.tarief, bedrag: null, tekst: "" } }), f.slug).not.toMatch(/€|\d+,\d{2}/);
    }
  });

  it("titels en beschrijvingen: op Google-lengte, uniek, met het zoekwoord en een canonical naar zichzelf", () => {
    const metas = FUNCTIES.map((f) => ({ f, m: functieMetadata(f) }));
    for (const { f, m } of metas) {
      expect(titel(m).length, titel(m)).toBeLessThanOrEqual(TITEL_MAX);
      expect(String(m.description).length, f.slug).toBeLessThanOrEqual(BESCHRIJVING_MAX);
      expect(f.beschrijving.length, f.slug).toBeLessThanOrEqual(BESCHRIJVING_MAX);
      expect(titel(m), f.slug).toMatch(new RegExp(`^Werken ${f.als}: taken, tijden en tarief`));
      expect(m.alternates?.canonical, f.slug).toBe(`/werken-als/${f.slug}`);
    }
    expect(new Set(metas.map(({ m }) => titel(m))).size).toBe(metas.length);
    expect(new Set(metas.map(({ m }) => String(m.description))).size).toBe(metas.length);
    const orderpicker = FUNCTIES.find((f) => f.slug === "orderpicker")!;
    expect(titel(functieMetadata(orderpicker))).toBe("Werken als orderpicker: taken, tijden en tarief | ZekerFlex");
    const hub = werkenAlsHubMetadata();
    expect(titel(hub).length).toBeLessThanOrEqual(TITEL_MAX);
    expect(String(hub.description).length).toBeLessThanOrEqual(BESCHRIJVING_MAX);
    expect(hub.alternates?.canonical).toBe("/werken-als");
  });

  it("elk paar functiepagina's onder de 40% gelijk, met genoeg tekst om te meten", () => {
    const teksten = FUNCTIES.map((f) => [f.slug, functieTekst(functiePagina(f))] as const);
    for (const [slug, t] of teksten) expect(woorden(t).length, slug).toBeGreaterThan(400);
    let slechtst = { g: 0, paar: "" };
    for (let i = 0; i < teksten.length; i++) {
      for (let j = i + 1; j < teksten.length; j++) {
        const a = teksten[i]!;
        const b = teksten[j]!;
        const g = gelijkenis(a[1], b[1]);
        if (g > slechtst.g) slechtst = { g, paar: `${a[0]}/${b[0]}` };
      }
    }
    expect(slechtst.g, slechtst.paar).toBeLessThan(GRENS);
  });

  it("links: de branchehub, /bijbaan, de andere functies en de zes grootste steden van de branche", () => {
    for (const f of FUNCTIES) {
      const s = SECTORS.find((x) => x.key === f.branche)!;
      const [meer, steden] = functiePagina(f).rijen;
      const hrefs = meer?.links.map((l) => l.href) ?? [];
      expect(hrefs, f.slug).toContain(`/${s.workerSlug}`);
      expect(hrefs, f.slug).toContain("/bijbaan");
      expect(hrefs, f.slug).toContain("/werken-als");
      expect(hrefs, f.slug).not.toContain(`/werken-als/${f.slug}`);
      for (const ander of functiesVan(f.branche).filter((x) => x.slug !== f.slug)) expect(hrefs, f.slug).toContain(`/werken-als/${ander.slug}`);
      const stad = steden?.links ?? [];
      expect(stad, f.slug).toHaveLength(6);
      expect(new Set(stad.map((l) => l.href)).size).toBe(6);
      for (const l of stad) {
        const slug = l.href.split("/")[2] ?? "";
        expect(l.href.startsWith(`/${s.workerSlug}/`), l.href).toBe(true);
        expect(CITIES.some((c) => c.slug === slug), l.href).toBe(true);
      }
    }
    // gesorteerd op het CBS-cijfer van de branche, hoogste eerst
    for (const s of SECTORS) {
      const { steden, maat } = grootsteSteden(s.key);
      expect(maat?.niveau, s.key).toBe("gemeente");
      const n = steden.map((c) => {
        const k = stadCijfers(c.slug);
        return k && maat ? waardeVan(maat, k).n : 0;
      });
      for (let i = 1; i < n.length; i++) expect(n[i - 1]!, s.key).toBeGreaterThanOrEqual(n[i]!);
    }
  });

  it("het overzicht toont elke functie per branche, met het richttarief", () => {
    const hub = werkenAlsHub();
    const kaarten = hub.groepen.flatMap((g) => g.kaarten);
    expect(kaarten.map((k) => k.href).sort()).toEqual(FUNCTIES.map((f) => `/werken-als/${f.slug}`).sort());
    for (const k of kaarten) expect(k.tarief, k.href).toMatch(/^Richttarief € \d+,\d{2} per uur$/);
    expect(hub.groepen.map((g) => g.href)).toEqual(SECTORS.filter((s) => functiesVan(s.key).length > 0).map((s) => `/${s.workerSlug}`));
  });

  it("eerlijk: vanaf 18, met of zonder KVK via een aangesloten uitzendbureau, en geen beloftes", () => {
    const paginas = FUNCTIES.map((f) => functieTekst(functiePagina(f)));
    for (const t of paginas) {
      expect(t).toContain("vanaf 18 jaar");
      expect(t).toContain("zonder KVK werk je als uitzendkracht via een aangesloten uitzendbureau");
      expect(t).toContain("ZekerFlex is zelf geen uitzendbureau");
    }
    const alle = [...paginas, JSON.stringify(werkenAlsHub())].join("\n");
    // geen aantallen klussen of werkers, geen snelheid, geen "direct werk", niets over de bank of een voorschot
    expect(alle).not.toMatch(
      /\d+ (open )?(klussen|diensten|bijbanen|werkers|flexwerkers)\b|binnen (een|\d+) (uur|uren|dag|dagen)|dezelfde dag|direct (werk|aan de slag|uitbetaald|geld)|snel uitbetaald|word snel|voorschot|ZekerFlex Bank|gegarandeerd/i,
    );
    expect(alle).not.toMatch(/16 of 17[^.]*(kun je|mag je) (al )?(werken|aan de slag)/i);
  });

  it("één h1 per pagina, JSON-LD via ldJson met kruimelpad en vragen, servercomponent en geen extra exports in page.tsx", () => {
    const bron = lees("components/marketing/FunctieLanding.tsx");
    for (const naam of ["FunctieLanding", "WerkenAlsHub"]) {
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
    expect(bron).toContain("functieFoto(f)");
    // Next weigert een page.tsx met andere exports (de build faalt, de controle ziet het niet)
    const toegestaan = new Set(["default", "metadata", "dynamicParams", "generateStaticParams", "generateMetadata"]);
    for (const f of ["app/(marketing)/werken-als/page.tsx", "app/(marketing)/werken-als/[functie]/page.tsx"]) {
      const namen = [...lees(f).matchAll(/^export\s+(?:default\b|(?:async\s+)?(?:function|const|let)\s+(\w+))/gm)].map((m) => m[1] ?? "default");
      expect(namen.length, f).toBeGreaterThan(0);
      for (const n of namen) expect(toegestaan.has(n), `${f}: ${n}`).toBe(true);
    }
  });
});
