import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { CITIES } from "@/lib/seo-cities";
import { SECTORS, personeelNaam } from "@/lib/seo-sectors";
import { SHIFT_TEMPLATES } from "@/lib/shifts/catalogus";
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { euro } from "@/lib/kennis/tarieven-overzicht";
import { BESCHRIJVING_MAX, TITEL_MAX } from "@/lib/seo-tekst";
import { MAX_LINKS, STANDAARD_KOLOMMEN } from "@/lib/ontwerp/menu";
import { kantVanPad } from "@/lib/marketing/site-nav";
import { rondgangRoutes } from "@/lib/ops/rondgang";
import { SNEL_STAPPEN, snelVraag } from "@/lib/seo-stad";
import { sectorStadPagina } from "@/lib/seo-stad-pagina";
import {
  BEDRIJFS_VRAGEN,
  VOORBEELD,
  VRAGEN_PAD,
  richttarief,
  vraagJsonLd,
  vraagMetadata,
  vraagPad,
  vraagTekst,
  vragenHubJsonLd,
  vragenHubMetadata,
  vragenVoor,
} from "@/lib/seo-vragen";

// Vindbaarheid aan de bedrijvenkant (22 nov 2026, Search Console 28 dagen): "personeel inhuren" (413 vertoningen, plek 34),
// "freelance uitzendbureau" (plek 17,7), "schoonmaakpersoneel inhuren" (plek 12,4) en "ik moet snel personeel aannemen in
// 's-hertogenbosch, wat is de snelste optie?" (plek 2,6). Daarom: korte antwoordpagina's voor bedrijven (/vragen), en op de
// stadspagina's de vraag "Hoe kom ik snel aan … in <stad>?", eerlijk en zonder belofte over snelheid.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const titel = (m: { title?: unknown }) => (m.title as { absolute: string }).absolute;

// geen belofte over snelheid, aantallen of resultaat; niets over de bank of een voorschot; geen uitzendmarge in procenten
const BELOFTE =
  /binnen (een|\d+) (uur|uren|dag|dagen|minuten)|dezelfde dag|in een paar minuten|gegarandeerd|direct (werk|aan de slag|uitbetaald|geld)|\d+ (open )?(klussen|werkers|flexwerkers)\b|voorschot|ZekerFlex Bank|\d+\s?[–-]\s?\d+\s?%|uitzendmarge van/i;
// geen namen van andere platforms of bureaus
const ANDEREN = /youngones|\btemper\b|randstad|young ?capital|tempo-team|olympia|start ?people|manpower|adecco/i;

describe("de vragen van bedrijven (/vragen)", () => {
  it("bestaan als route en staan in de sitemap, de routelijst, de rondgang, llms.txt, de voettekst en het bedrijvenmenu", async () => {
    expect(VRAGEN_PAD).toBe("/vragen");
    expect(existsSync(path.join(ROOT, "app/(marketing)/vragen/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "app/(marketing)/vragen/[vraag]/page.tsx"))).toBe(true);
    const sitemap = lees("app/sitemap.ts");
    expect(sitemap).toContain('entry("/vragen", 0.7, "monthly")');
    expect(sitemap).toContain('...BEDRIJFS_VRAGEN.map((v) => entry(vraagPad(v), 0.7, "monthly", v.bijgewerkt))');
    const routes = APP_PAGES.map((p) => p.route);
    expect(routes).toContain("/vragen");
    expect(routes).toContain("/vragen/[vraag]");
    const nacht = rondgangRoutes(new Date("2026-11-22T05:20:00+01:00"));
    expect(nacht).toContain("/vragen");
    for (const v of BEDRIJFS_VRAGEN) expect(nacht, v.slug).toContain(vraagPad(v));
    const { GET } = await import("@/app/llms.txt/route");
    const llms = await (await GET()).text();
    expect(llms).toContain("## Voor bedrijven: korte antwoorden");
    for (const v of BEDRIJFS_VRAGEN) expect(llms, v.slug).toContain(`${vraagPad(v)}\n  ${v.antwoord}`);
    const kennis = STANDAARD_KOLOMMEN.find((k) => k.titel === "Kennis");
    expect(kennis?.links.some((l) => l.href === "/vragen")).toBe(true);
    expect(kennis?.links.length ?? 0).toBeLessThanOrEqual(MAX_LINKS);
    expect(kantVanPad("/vragen")).toBe("bedrijven");
    expect(kantVanPad("/vragen/wat-is-een-freelance-uitzendbureau")).toBe("bedrijven");
  });

  it("zes vragen, elk met de vraag als h1, een direct antwoord van twee of drie zinnen, uitleg, bronnen en eigen vragen", () => {
    expect(BEDRIJFS_VRAGEN.length).toBeGreaterThanOrEqual(5);
    expect(BEDRIJFS_VRAGEN.length).toBeLessThanOrEqual(8);
    expect(new Set(BEDRIJFS_VRAGEN.map((v) => v.slug)).size).toBe(BEDRIJFS_VRAGEN.length);
    const vragen = new Set<string>();
    for (const v of BEDRIJFS_VRAGEN) {
      expect(v.slug, v.slug).toMatch(/^[a-z0-9-]+$/);
      expect(v.vraag, v.slug).toMatch(/\?$/);
      const zinnen = v.antwoord.match(/[.!?](?=\s|$)/g) ?? [];
      expect(zinnen.length, `${v.slug}: ${v.antwoord}`).toBeGreaterThanOrEqual(2);
      expect(zinnen.length, `${v.slug}: ${v.antwoord}`).toBeLessThanOrEqual(3);
      expect(v.antwoord.length, v.slug).toBeLessThanOrEqual(520);
      expect(v.secties.length, v.slug).toBeGreaterThanOrEqual(2);
      expect(v.bronnen.length, v.slug).toBeGreaterThanOrEqual(2);
      expect(v.faq.length, v.slug).toBeGreaterThanOrEqual(2);
      expect(v.bijgewerkt, v.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const f of v.faq) {
        expect(vragen.has(f.q) && f.q !== "Is ZekerFlex een uitzendbureau?", `${v.slug}: ${f.q}`).toBe(false);
        vragen.add(f.q);
      }
      // een interne bron bestaat als pagina, een externe is een officiële bron
      for (const b of v.bronnen) {
        if (/^https?:\/\//.test(b.href)) expect(b.href, v.slug).toMatch(/^https:\/\/(www\.belastingdienst\.nl|wetten\.overheid\.nl)\//);
        else expect(existsSync(path.join(ROOT, "app/(marketing)", b.href.replace(/^\//, ""), "page.tsx")), `${v.slug}: ${b.href}`).toBe(true);
      }
    }
    // de vragen uit de opdracht
    const slugs = BEDRIJFS_VRAGEN.map((v) => v.slug);
    for (const s of [
      "platform-uitzendbureau-of-zelf-werven",
      "wat-kost-een-flexwerker-per-uur",
      "zzp-er-inhuren-via-platform-wet-dba",
      "snel-horecapersoneel-inhuren-weekend",
      "schoonmaakpersoneel-inhuren-zzp-of-uitzend",
      "wat-is-een-freelance-uitzendbureau",
    ]) {
      expect(slugs).toContain(s);
    }
  });

  it("titels en beschrijvingen: op Google-lengte, met het merk, uniek, en een canonical naar zichzelf", () => {
    const metas = BEDRIJFS_VRAGEN.map((v) => ({ v, m: vraagMetadata(v) }));
    for (const { v, m } of metas) {
      expect(titel(m).length, titel(m)).toBeLessThanOrEqual(TITEL_MAX);
      expect(titel(m), v.slug).toMatch(/ \| ZekerFlex$/);
      expect(v.beschrijving.length, v.slug).toBeLessThanOrEqual(BESCHRIJVING_MAX);
      expect(String(m.description), v.slug).toBe(v.beschrijving);
      expect(m.alternates?.canonical, v.slug).toBe(vraagPad(v));
    }
    expect(new Set(metas.map(({ m }) => titel(m))).size).toBe(metas.length);
    expect(new Set(metas.map(({ m }) => String(m.description))).size).toBe(metas.length);
    expect(titel(vraagMetadata(BEDRIJFS_VRAGEN.find((v) => v.slug === "schoonmaakpersoneel-inhuren-zzp-of-uitzend")!))).toBe("Schoonmaakpersoneel inhuren: zzp of uitzend? | ZekerFlex");
    const hub = vragenHubMetadata();
    expect(titel(hub)).toBe("Vragen van bedrijven over personeel inhuren | ZekerFlex");
    expect(String(hub.description).length).toBeLessThanOrEqual(BESCHRIJVING_MAX);
    expect(hub.alternates?.canonical).toBe("/vragen");
  });

  it("JSON-LD: Article met de bronnen, FAQPage met de vraag zelf eerst, en het kruimelpad", () => {
    for (const v of BEDRIJFS_VRAGEN) {
      const [artikel, faq, kruimel] = vraagJsonLd(v) as [Record<string, unknown>, { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }, { itemListElement: { item: string }[] }];
      expect(artikel["@type"]).toBe("Article");
      expect(artikel.headline).toBe(v.vraag);
      expect(artikel.publisher).toEqual({ "@id": expect.stringMatching(/\/#organization$/) });
      expect((artikel.citation as string[]).every((u) => /^https?:\/\//.test(u)), v.slug).toBe(true);
      expect(faq.mainEntity[0]?.name).toBe(v.vraag);
      expect(faq.mainEntity[0]?.acceptedAnswer.text).toBe(v.antwoord);
      expect(faq.mainEntity).toHaveLength(v.faq.length + 1);
      expect(kruimel.itemListElement.map((i) => i.item.replace(/^https?:\/\/[^/]+/, ""))).toEqual(["/", "/vragen", vraagPad(v)]);
    }
    const [hubFaq] = vragenHubJsonLd() as [{ mainEntity: unknown[] }];
    expect(hubFaq.mainEntity).toHaveLength(BEDRIJFS_VRAGEN.length);
    const bron = lees("components/marketing/VraagLanding.tsx");
    expect(bron).toContain("ldJson(vraagJsonLd(v))");
    expect(bron).toContain("ldJson(vragenHubJsonLd())");
    expect(bron).not.toMatch(/JSON\.stringify/);
    expect(bron).not.toContain('"use client"');
    // één h1 per pagina; de knoppen naar klus plaatsen en voor bedrijven
    for (const naam of ["VraagLanding", "VragenHub"]) {
      const start = bron.indexOf(`export function ${naam}(`);
      const volgende = bron.indexOf("\nexport function ", start + 1);
      const stuk = bron.slice(start, volgende === -1 ? undefined : volgende);
      expect(stuk.match(/<h1[\s>]/g) ?? [], naam).toHaveLength(1);
      expect(stuk, naam).toContain("<Knoppen />");
    }
    expect(bron).toContain('const KLUS = { href: "/klus-plaatsen"');
    expect(bron).toContain('const BEDRIJVEN = { href: "/bedrijven"');
  });

  it("de bedragen komen uit de catalogus en de staffel, niet overgetypt", () => {
    const horeca = SHIFT_TEMPLATES.find((t) => t.key === "horeca")!;
    expect(VOORBEELD.uur).toBe(euro(horeca.hourlyRateCents));
    expect(VOORBEELD.samen).toBe(euro(horeca.hourlyRateCents + BASE_FEE_PER_HOUR_CENTS));
    expect(VOORBEELD.totaal).toBe(euro(Math.round((horeca.hourlyRateCents + BASE_FEE_PER_HOUR_CENTS) * 5.5)));
    const kosten = BEDRIJFS_VRAGEN.find((v) => v.slug === "wat-kost-een-flexwerker-per-uur")!;
    const min = Math.min(...SHIFT_TEMPLATES.map((t) => t.hourlyRateCents));
    const max = Math.max(...SHIFT_TEMPLATES.map((t) => t.hourlyRateCents));
    expect(kosten.antwoord).toContain(`tussen ${euro(min)} en ${euro(max)} per uur`);
    expect(kosten.antwoord).toContain(`${euro(BASE_FEE_PER_HOUR_CENTS)} platformkosten per gewerkt uur`);
    // elke functie in de tabel bestaat in de catalogus (een weggevallen sleutel zou stil een rij kosten)
    const tabel = kosten.secties[0]?.tabel;
    expect(tabel?.rijen.length).toBe(12);
    for (const r of tabel?.rijen ?? []) expect(SHIFT_TEMPLATES.some((t) => t.label === r[0]), r[0]).toBe(true);
    expect(richttarief("bestaat-niet")).toBeNull();
    // de uitzendopslag is niet openbaar: nergens een bedrag of percentage voor uitzenden
    for (const v of BEDRIJFS_VRAGEN) expect(vraagTekst(v), v.slug).not.toMatch(/(uitzendtarief|uitzendopslag|opslag|marge)\w*\s(van|is|bedraagt)\s(€|\d)/i);
  });

  it("eerlijk: ZekerFlex is geen uitzendbureau, uitzendkrachten via een aangesloten uitzendbureau, en geen beloftes of andere namen", () => {
    for (const v of BEDRIJFS_VRAGEN) {
      const t = vraagTekst(v);
      expect(t, v.slug).toContain("aangesloten uitzendbureau");
      expect(t, v.slug).not.toMatch(BELOFTE);
      expect(t, v.slug).not.toMatch(ANDEREN);
    }
    const freelance = BEDRIJFS_VRAGEN.find((v) => v.slug === "wat-is-een-freelance-uitzendbureau")!;
    expect(freelance.antwoord).toContain("geen officiële term");
    expect(freelance.antwoord).toContain("zelf geen uitzendbureau");
    expect(BEDRIJFS_VRAGEN.find((v) => v.slug === "zzp-er-inhuren-via-platform-wet-dba")?.noot).toMatch(/geen juridisch of fiscaal advies/);
  });

  it("het blok 'Veelgestelde vragen voor bedrijven' staat op /bedrijven, /personeel-inhuren en de branchehubs", () => {
    for (const f of ["app/(marketing)/bedrijven/page.tsx", "app/(marketing)/personeel-inhuren/page.tsx"]) expect(lees(f), f).toContain("<BedrijfsVragen />");
    expect(lees("components/marketing/SectorLanding.tsx")).toContain("<BedrijfsVragen branche={s.key} />");
    expect(vragenVoor("schoonmaak")[0]?.slug).toBe("schoonmaakpersoneel-inhuren-zzp-of-uitzend");
    expect(vragenVoor("horeca")[0]?.slug).toBe("snel-horecapersoneel-inhuren-weekend");
    expect(vragenVoor().length).toBe(BEDRIJFS_VRAGEN.length);
    expect(vragenVoor("logistiek").length).toBe(BEDRIJFS_VRAGEN.length);
  });

  it("geen extra exports in page.tsx (de build faalt, de controle ziet het niet)", () => {
    const toegestaan = new Set(["default", "metadata", "dynamicParams", "generateStaticParams", "generateMetadata"]);
    for (const f of ["app/(marketing)/vragen/page.tsx", "app/(marketing)/vragen/[vraag]/page.tsx"]) {
      const namen = [...lees(f).matchAll(/^export\s+(?:default\b|(?:async\s+)?(?:function|const|let)\s+(\w+))/gm)].map((m) => m[1] ?? "default");
      expect(namen.length, f).toBeGreaterThan(0);
      for (const n of namen) expect(toegestaan.has(n), `${f}: ${n}`).toBe(true);
    }
  });
});

describe("'Hoe kom ik snel aan … in <stad>?' op de stadspagina's van bedrijven", () => {
  it("per branche en stad: de stappen, de prijs en de uitzendkrachten, met per stad andere cijfers en zonder belofte", () => {
    for (const s of SECTORS) {
      const antwoorden = new Set<string>();
      for (const c of CITIES) {
        const v = sectorStadPagina(s, c).faq.find((f) => f.q === `Hoe kom ik snel aan ${personeelNaam(s)} in ${c.name}?`);
        expect(v, `${s.key} ${c.slug}`).toBeDefined();
        expect(v?.a.startsWith(SNEL_STAPPEN), `${s.key} ${c.slug}`).toBe(true);
        expect(v?.a, `${s.key} ${c.slug}`).toContain("€ 3,50 per gewerkt uur");
        expect(v?.a, `${s.key} ${c.slug}`).toContain("aangesloten uitzendbureau");
        expect(v?.a, `${s.key} ${c.slug}`).toContain("CBS");
        expect(v?.a, `${s.key} ${c.slug}`).not.toMatch(BELOFTE);
        antwoorden.add(v?.a ?? "");
      }
      expect(antwoorden.size, s.key).toBe(CITIES.length);
    }
    expect(SNEL_STAPPEN).toContain("Hoe snel er iemand reageert, hangt af van wie er op dat moment beschikbaar is");
    const rotterdam = CITIES.find((c) => c.slug === "rotterdam")!;
    const schoonmaak = SECTORS.find((s) => s.key === "schoonmaak")!;
    expect(sectorStadPagina(schoonmaak, rotterdam).faq.some((f) => f.q === "Hoe kom ik snel aan schoonmaakpersoneel in Rotterdam?")).toBe(true);
    expect(sectorStadPagina(schoonmaak, rotterdam).titel).toBe("Schoonmaakpersoneel inhuren in Rotterdam");
    const bosch = CITIES.find((c) => c.slug === "den-bosch")!;
    expect(snelVraag(bosch, "algemeen").q).toBe("Hoe kom ik snel aan personeel in 's-Hertogenbosch?");
    expect(lees("app/(marketing)/personeel-inhuren/[stad]/page.tsx")).toContain('snelVraag(c, "algemeen")');
    // de koppen uit de opdracht
    const kop = (k: string) => sectorStadPagina(SECTORS.find((s) => s.key === k)!, rotterdam).titel;
    expect(kop("horeca")).toBe("Horeca personeel inhuren in Rotterdam");
    expect(kop("evenementen")).toBe("Evenementenpersoneel inhuren in Rotterdam");
  });
});
