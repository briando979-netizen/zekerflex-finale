import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { ADMIN_HUBS } from "@/lib/admin/nav";
import { COMMUNITY_URL } from "@/lib/hulp/hulpjes";
import { NAV } from "@/lib/marketing/site-nav";
import { STANDAARD_KOLOMMEN } from "@/lib/ontwerp/menu";
import { EXTRA_ADRESSEN, openbareRoutes } from "@/lib/ops/rondgang";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";
import { WELKOM, onderwerpPad } from "@/lib/community/regels";

// De community op de site zelf (22 nov 2026) moet vindbaar zijn: menu, voettekst, contact, de linkpagina, de werker-app
// (ook in de Android-app), Beheer, de sitemap en de nachtelijke rondgang. En de AVG: de sleutels per gebruiker zijn wisbaar.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

describe("de community is overal te vinden", () => {
  it("de oude Google Groep is weg; elke link is intern, zonder nieuw tabblad", () => {
    expect(COMMUNITY_URL).toBe("/community");
    for (const f of ["app/(marketing)/contact/page.tsx", "app/links/page.tsx", "components/app/AppVereist.tsx", "components/app/HulpPaginaInhoud.tsx"]) {
      const src = lees(f);
      expect(src, f).toContain("COMMUNITY_URL");
      expect(src, f).not.toMatch(/href=\{COMMUNITY_URL\}\s+target="_blank"/);
      expect(src, f).not.toContain("groups.google.com/g/zekerflex-community");
    }
    expect(lees("app/links/page.tsx")).not.toMatch(/href: COMMUNITY_URL, extern: true/);
    // "Join de community" in de werker-app gaat naar de community zelf
    expect(lees("app/dashboard/account/page.tsx")).toContain('{ label: t.community, href: "/community" }');
  });

  it("in het menu (Over ons) en in de voettekst (Kennis)", () => {
    const over = NAV.find((n) => n.key === "over");
    for (const kant of ["werknemers", "bedrijven"] as const) expect(over?.menu?.[kant].items.some((i) => i.href === "/community"), kant).toBe(true);
    expect(STANDAARD_KOLOMMEN.find((k) => k.titel === "Kennis")?.links.some((l) => l.href === "/community")).toBe(true);
  });

  it("de Android-app laat /community door, Beheer heeft een pagina, de sitemap noemt hem", () => {
    const m = lees("middleware.ts");
    const lijst = m.slice(m.indexOf("const APP_ALLOWED = ["), m.indexOf("];", m.indexOf("const APP_ALLOWED = [")));
    expect(lijst).toContain('"/community"');
    expect(ADMIN_HUBS.find((h) => h.id === "communicatie")?.pages.some((p) => p.href === "/admin/community")).toBe(true);
    const sitemap = lees("app/sitemap.ts");
    expect(sitemap).toContain('entry("/community", ');
    expect(sitemap).toContain('entry("/community/regels", ');
    expect(sitemap).toContain("sitemapOnderwerpen()");
  });

  it("de nachtelijke rondgang haalt het overzicht, de huisregels en het welkomstonderwerp op", () => {
    const r = openbareRoutes();
    expect(r).toContain("/community");
    expect(r).toContain("/community/regels");
    expect(EXTRA_ADRESSEN).toContain(onderwerpPad(WELKOM));
  });

  it("AVG: de sleutels per gebruiker gaan mee bij inzage en wissen; de berichten zelf via lib/community/avg.ts", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("community-gebruiker:");
    expect(ERASABLE_KV_PREFIXES).toContain("community-uitsluiting:");
    expect(lees("lib/privacy/anonymize.ts")).toContain("m.wisCommunityVan(userId)");
    expect(lees("lib/privacy/export.ts")).toContain("m.exportCommunityVan(userId)");
    // en het privacybeleid zegt wat openbaar is, hoe je zelf verwijdert, wat er bij het opheffen van je account gebeurt en hoe melden werkt
    const privacy = lees("app/(marketing)/privacy/page.tsx");
    for (const stuk of ['heading="De community"', "eerste letter van je achternaam", "knop Verwijderen", "'Verwijderd account'", "Iedereen kan een bericht melden"]) {
      expect(privacy, stuk).toContain(stuk);
    }
  });

  it("JSON-LD alleen via ldJson, nooit JSON.stringify in een script", () => {
    for (const f of ["app/(marketing)/community/page.tsx", "app/(marketing)/community/[id]/page.tsx"]) {
      const src = lees(f);
      expect(src, f).toContain("ldJson(");
      expect(src, f).not.toContain("JSON.stringify");
    }
  });

  it("tekst van gebruikers is platte tekst: geen dangerouslySetInnerHTML buiten de JSON-LD, links met nofollow ugc", () => {
    expect(lees("components/community/PlatteTekst.tsx")).toContain('rel="nofollow ugc noopener"');
    for (const f of ["components/community/BerichtKaart.tsx", "components/community/PlatteTekst.tsx", "components/admin/CommunityBeheer.tsx"]) {
      expect(lees(f), f).not.toContain("dangerouslySetInnerHTML");
    }
  });
});
