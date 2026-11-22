import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SECTORS } from "@/lib/seo-sectors";

// Interne links naar de branche- en stadspagina's (22 nov 2026, doel "bovenaan in Google"). Die pagina's kregen alleen
// links van elkaar en van hun eigen overzicht; Google vond ze dus weinig belangrijk. Nu linken de voorpagina's, /voor-
// freelancers, /bedrijven (waar /voor-bedrijven sinds 22 nov in opging) en de stadspagina's ernaar, en de branchekaarten op de voorpagina gaan niet meer naar
// /klussen (met de vlag publiek-alleen-flexwerk op noindex).

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("interne links naar de branche- en stadspagina's", () => {
  it("de branchekaarten op / en /bedrijven gaan naar de branchepagina, de steden eronder naar de stadspagina", () => {
    const src = lees("components/marketing/BranchShowcase.tsx");
    for (const s of SECTORS.filter((x) => ["horeca", "logistiek", "schoonmaak", "retail", "evenementen"].includes(x.key))) {
      expect(src, s.key).toContain(`sector: "${s.key}"`);
    }
    expect(src).toContain('voor === "werkers" ? `/${s.workerSlug}` : `/${s.slug}`');
    expect(src).not.toMatch(/kaartHref: "\/klussen"|knopHref: "\/klussen"/);
    expect(src).toContain("topSteden(STEDEN_IN_RIJ)");
    expect(src).toContain("`/freelance-werk/${slug}`");
    expect(src).toContain("`/personeel-inhuren/${slug}`");
  });

  it("/voor-freelancers en /bedrijven linken per stad (en bedrijven ook per branche)", () => {
    expect(lees("app/(marketing)/voor-freelancers/page.tsx")).toContain('<PerBrancheEnStad voor="werkers" branches={false} />');
    expect(lees("app/(marketing)/bedrijven/page.tsx")).toContain('<PerBrancheEnStad voor="bedrijven" />');
  });

  it("de stadspagina's linken naar de branches in dezelfde stad, en de branchepagina's naar elkaar", () => {
    expect(lees("app/(marketing)/freelance-werk/[stad]/page.tsx")).toContain("href={`/${s.workerSlug}/${c.slug}`}");
    expect(lees("app/(marketing)/personeel-inhuren/[stad]/page.tsx")).toContain("href={`/${s.slug}/${c.slug}`}");
    // de stadspagina's per branche komen sinds 22 nov uit lib/seo-stad-pagina.ts (SectorLanding.tsx tekent ze)
    const sector = lees("lib/seo-stad-pagina.ts");
    expect(sector).toContain("href: `/${x.workerSlug}/${c.slug}`");
    expect(sector).toContain("href: `/${x.slug}/${c.slug}`");
    expect(lees("components/marketing/SectorLanding.tsx")).toMatch(/sectorStadPagina\(s, c\)[\s\S]*sectorWerkStadPagina\(s, c\)/);
    // het kruimelpad van /freelance-werk/<stad> gaat naar het overzicht, niet naar het verborgen /klussen
    expect(lees("app/(marketing)/freelance-werk/[stad]/page.tsx")).not.toContain('["Klussen", "/klussen"]');
  });

  it("de bijbaanpagina's krijgen links: voettekst, /voor-freelancers, de werkerkant per branche en per stad", () => {
    expect(lees("lib/ontwerp/menu.ts")).toContain('{ href: "/bijbaan", label: "Bijbaan per stad" }');
    expect(lees("components/marketing/PerBrancheEnStad.tsx")).toContain('{ href: "/bijbaan", label: "Bijbaan per stad" }');
    expect(lees("components/marketing/SectorLanding.tsx")).toContain('{ href: "/bijbaan", label: "Bijbaan" }');
    expect(lees("lib/seo-stad-pagina.ts")).toContain("{ href: `/bijbaan/${c.slug}`, label: `Bijbaan in ${c.name}` }");
    expect(lees("app/(marketing)/freelance-werk/[stad]/page.tsx")).toContain("href={`/bijbaan/${c.slug}`}");
  });
});
