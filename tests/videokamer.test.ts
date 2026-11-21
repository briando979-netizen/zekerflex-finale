import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VIDEOKAMER, paginaVideo, videoPad } from "@/lib/marketing/paginavideos";
import { UITLEG_VIDEOS } from "@/lib/marketing/uitleg-videos";
import { NAV } from "@/lib/marketing/site-nav";
import { NIET_FLEXWERK_NAV_KEYS } from "@/lib/marketing/flexwerk-only";

// 21 nov 2026 (eigenaar): "alle uitlegvideo's: maak daar een aparte ruimte voor bij Uitleg, bekijk alle video's", en "die 3,50 in
// het menu bij bedrijven kan weg".

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("de videokamer", () => {
  it("bevat alleen flexwerkvideo's die echt bestaan", () => {
    for (const id of VIDEOKAMER) {
      const v = paginaVideo(id);
      expect(v, id).toBeDefined();
      expect(existsSync(path.join(process.cwd(), "public", videoPad(v!))), id).toBe(true);
    }
    for (const weg of ["rijschool-software", "website-maken", "uitzendbureau", "voor-freelancers"]) expect(VIDEOKAMER).not.toContain(weg);
    expect(UITLEG_VIDEOS.length).toBeGreaterThanOrEqual(5);
  });

  it("de pagina's tonen hun video niet meer; /uitleg wijst naar alle video's", () => {
    for (const f of ["app/(marketing)/voor-bedrijven/page.tsx", "app/(marketing)/voor-freelancers/page.tsx", "app/(marketing)/prijzen/page.tsx", "components/marketing/SectorLanding.tsx"]) {
      expect(lees(f), f).not.toMatch(/PaginaVideoBlok|ReclameVideoBlok/);
    }
    expect(lees("app/(marketing)/uitleg/page.tsx")).toContain('href="/uitleg/videos"');
    expect(lees("app/sitemap.ts")).toContain('entry("/uitleg/videos"');
    const kamer = lees("app/(marketing)/uitleg/videos/page.tsx");
    expect(kamer).toContain("VIDEOKAMER");
    expect(kamer).toContain('preload="none"');
  });

  it("het menu voor bedrijven noemt geen € 3,50 en geen 'personeel zonder abonnement' meer", () => {
    const prijzen = NAV.find((n) => n.key === "prijzen");
    const items = prijzen && "menu" in prijzen && prijzen.menu ? prijzen.menu.bedrijven.items : [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => /3,50|zonder abonnement/i.test(i.title + i.desc))).toBe(false);
  });

  it("Branches staat in het menu; Kennis bij werknemers is kort", () => {
    const b = NAV.find((n) => n.key === "branches");
    expect(b?.menu?.werknemers.items.map((i) => i.href)).toEqual(expect.arrayContaining(["/horeca-vacatures", "/logistiek-vacatures", "/evenementen-vacatures", "/retail-vacatures", "/schoonmaak-vacatures"]));
    expect(b?.menu?.werknemers.items[0]?.title).toBe("Horeca & catering");
    expect(b?.menu?.bedrijven.items.map((i) => i.href)).toContain("/horeca-personeel-inhuren");
    expect(NIET_FLEXWERK_NAV_KEYS).not.toContain("branches");
    expect(NAV.find((n) => n.key === "kennis")?.menu?.werknemers.items.map((i) => i.title)).toEqual(["Informatie", "Kennisbank", "Blogs", "FAQ"]);
    expect(lees("app/(marketing)/voor-freelancers/page.tsx")).toContain('id="branches"');
  });

  it("Prijzen staat niet meer in de bovenbalk; tarievenoverzicht en rekenhulp staan onder Kennis; geen GPS- of facturatieregel", () => {
    expect(NIET_FLEXWERK_NAV_KEYS).toContain("prijzen");
    const kennis = NAV.find((n) => n.key === "kennis")?.menu?.bedrijven.items ?? [];
    expect(kennis.map((i) => i.href)).toEqual(expect.arrayContaining(["/tarieven-overzicht", "/rekentools/platformkosten-berekenen"]));
    const hoe = NAV.find((n) => n.key === "hoe")?.menu?.bedrijven.items ?? [];
    expect(hoe.some((i) => /GPS check-in|Wet DBA-monitor/.test(i.title))).toBe(false);
    expect(lees("app/(marketing)/rekentools/page.tsx")).not.toMatch(/href: "\/(review|website)-check"/);
    const over = NAV.find((n) => n.key === "over")?.menu?.bedrijven.items ?? [];
    expect(over.some((i) => i.title === "Drie uitgangspunten")).toBe(false);
    expect(lees("app/(marketing)/rekentools/platformkosten-berekenen/page.tsx")).toContain("<PlatformFeeEstimate />");
  });
});
