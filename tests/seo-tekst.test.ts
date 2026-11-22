import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BESCHRIJVING_MAX, seoBeschrijving, seoTitel, TITEL_MAX } from "@/lib/seo-tekst";
import { sectorCityMetadata, sectorHubMetadata, sectorWorkerCityMetadata, sectorWorkerHubMetadata } from "@/lib/seo-sector-meta";
import { SECTORS, rollenKort } from "@/lib/seo-sectors";
import { CITIES } from "@/lib/seo-cities";
import { SEO_STANDAARD } from "@/lib/ontwerp/seo";

// Titels en beschrijvingen op Google-lengte (paginacheck 15 nov: 332 van 435 titels boven 65 tekens, 384 beschrijvingen
// boven 165). De titel verliest eerst de toelichting na het streepje, de beschrijving stopt na een hele zin.

const titelVan = (m: { title?: unknown }) => (m.title as { absolute: string }).absolute;

describe("seoTitel en seoBeschrijving", () => {
  it("een korte titel blijft heel; een lange verliest de toelichting na het streepje, met het merk erachter", () => {
    expect(seoTitel("Prijzen")).toBe("Prijzen | ZekerFlex");
    expect(seoTitel("Freelance werk in Amsterdam — klussen, flexwerk & uitzendwerk")).toBe("Freelance werk in Amsterdam | ZekerFlex");
    const lang = seoTitel("Een heel erg lange titel zonder streepje die maar doorgaat en doorgaat en nog langer is dan zestig");
    expect(lang.length).toBeLessThanOrEqual(TITEL_MAX);
    expect(lang.endsWith("…")).toBe(true);
  });

  it("een beschrijving stopt na de laatste hele zin binnen de grens, anders op een heel woord", () => {
    const t = "Vind flexwerk en klussen bij jou in de buurt. Je ziet vooraf wat je verdient, checkt in met je telefoon en krijgt je geld op je eigen rekening. Zzp'er of zonder KVK via ons uitzendbureau.";
    expect(seoBeschrijving(t)).toBe("Vind flexwerk en klussen bij jou in de buurt. Je ziet vooraf wat je verdient, checkt in met je telefoon en krijgt je geld op je eigen rekening.");
    const zonderPunt = seoBeschrijving("woord ".repeat(60));
    expect(zonderPunt.length).toBeLessThanOrEqual(BESCHRIJVING_MAX);
    expect(zonderPunt.endsWith("woord…")).toBe(true);
    expect(seoBeschrijving("Kort.")).toBe("Kort.");
  });
});

describe("de pagina's", () => {
  it("alle sector- en stadspagina's: op Google-lengte, uniek, en het verkoopargument blijft staan", () => {
    const metas = SECTORS.flatMap((s) => [sectorHubMetadata(s), sectorWorkerHubMetadata(s), ...CITIES.flatMap((c) => [sectorCityMetadata(s, c), sectorWorkerCityMetadata(s, c)])]);
    const titels = metas.map(titelVan);
    for (const m of metas) {
      expect(titelVan(m).length, titelVan(m)).toBeLessThanOrEqual(TITEL_MAX);
      expect(String(m.description).length, titelVan(m)).toBeLessThanOrEqual(BESCHRIJVING_MAX);
    }
    expect(new Set(titels).size).toBe(titels.length);
    // inkorten mag de prijs (werkgevers) en "met of zonder KVK" (werkers) niet wegsnijden
    for (const s of SECTORS) {
      for (const c of CITIES) {
        expect(String(sectorCityMetadata(s, c).description), `${s.slug} ${c.slug}`).toContain("€ 3,50 per gewerkt uur");
        expect(String(sectorWorkerCityMetadata(s, c).description), `${s.workerSlug} ${c.slug}`).toContain("met of zonder KVK");
      }
    }
  });

  it("de koppen volgen de echte zoekwoorden (Search Console 22 nov 2026) en beloven niets over snelheid", () => {
    const sector = (k: string) => SECTORS.find((s) => s.key === k)!;
    const stad = (k: string) => CITIES.find((c) => c.slug === k)!;
    expect(titelVan(sectorWorkerCityMetadata(sector("schoonmaak"), stad("enschede")))).toBe("Schoonmaakwerk en vacatures in Enschede | ZekerFlex");
    expect(titelVan(sectorWorkerCityMetadata(sector("horeca"), stad("haarlem")))).toBe("Horeca vacatures in Haarlem | ZekerFlex");
    expect(titelVan(sectorWorkerCityMetadata(sector("logistiek"), stad("eindhoven")))).toBe("Logistieke vacatures in Eindhoven | ZekerFlex");
    expect(titelVan(sectorWorkerHubMetadata(sector("schoonmaak")))).toBe("Schoonmaakwerk: werken als schoonmaker | ZekerFlex");
    expect(titelVan(sectorHubMetadata(sector("schoonmaak")))).toBe("Schoonmakers en schoonmaakpersoneel inhuren | ZekerFlex");
    expect(titelVan(sectorCityMetadata(sector("horeca"), stad("groningen")))).toBe("Horeca personeel inhuren in Groningen | ZekerFlex");
    expect(titelVan(sectorCityMetadata(sector("schoonmaak"), stad("enschede")))).toBe("Schoonmaakpersoneel inhuren in Enschede | ZekerFlex");
    expect(rollenKort(sector("horeca"))).toBe("bediening, keuken, bar en afwas");
    // geen "vaak nog dezelfde dag gevuld" of "binnen uren": dat kunnen we niet waarmaken zolang het aanbod klein is
    const bronnen = [
      "lib/seo-sector-meta.ts",
      "components/marketing/SectorLanding.tsx",
      "lib/seo-stad.ts",
      "lib/seo-stad-pagina.ts",
      "lib/seo-bijbaan.ts",
      "components/marketing/BijbaanLanding.tsx",
      "components/marketing/StadCijfers.tsx",
    ].map((f) => readFileSync(path.join(process.cwd(), f), "utf8"));
    for (const b of bronnen) expect(b).not.toMatch(/dezelfde dag|binnen uren|snel uitbetaald|word snel/i);
    for (const s of SECTORS) expect(s.werkUitleg.length, s.key).toBeGreaterThan(80);
  });

  it("de vaste pagina's: standaardteksten op lengte (zonder verborgen inkorting), een eigen versie wordt ingekort", () => {
    expect(SEO_STANDAARD["/"].titel.length).toBeLessThanOrEqual(TITEL_MAX);
    for (const [pad, s] of Object.entries(SEO_STANDAARD)) expect(s.omschrijving.length, pad).toBeLessThanOrEqual(BESCHRIJVING_MAX);
    expect(readFileSync(path.join(process.cwd(), "lib/ontwerp/seo-store.ts"), "utf8")).toContain("description: seoBeschrijving(omschrijving),");
  });
});
