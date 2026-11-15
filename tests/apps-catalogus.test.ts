import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZF_APPS, appVan, icoonSvg, manifestVan } from "@/lib/apps/catalogus";

// De apps van ZekerFlex per doelgroep (15 nov 2026): elk een eigen installeerbare app met een eigen manifest-id, naam,
// kleur, icoon en beginscherm (lib/apps/catalogus.ts, /apps en /apps/<id>).

const ROOT = process.cwd();
const paginaVan = (start: string) => path.join(ROOT, "app", ...(start.split("?")[0] ?? "").split("/").filter(Boolean), "page.tsx");

describe("de catalogus", () => {
  it("unieke ids, een korte naam die onder een icoon past, en een geldige kleur", () => {
    expect(new Set(ZF_APPS.map((a) => a.id)).size).toBe(ZF_APPS.length);
    for (const a of ZF_APPS) {
      expect(a.kort.length, a.id).toBeLessThanOrEqual(12);
      expect(a.kleur, a.id).toMatch(/^#[0-9A-F]{6}$/i);
      expect(a.start.startsWith("/"), a.id).toBe(true);
      expect(a.start, a.id).toContain(`utm_source=pwa-${a.id}`);
    }
  });

  it("elke beschikbare app opent op een pagina die bestaat; een app zonder pagina staat uit", () => {
    for (const a of ZF_APPS) {
      if (a.beschikbaar) expect(existsSync(paginaVan(a.start)), `${a.id} → ${a.start}`).toBe(true);
    }
    // een app die uit staat, is ook niet op te vragen
    for (const a of ZF_APPS) expect(appVan(a.id), a.id).toBe(a.beschikbaar ? a : undefined);
  });

  it("de opdrachtgevers, horeca, horecapersoneel, rijschool, webshop en website zijn er", () => {
    for (const id of ["zakelijk", "horeca", "personeel", "rijschool", "webshop", "website", "werk"]) expect(appVan(id), id).toBeDefined();
  });

  it("de personeel-app belooft niet meer dan /personeel heeft", () => {
    const uitleg = appVan("personeel")?.uitleg ?? "";
    const heeft = (onderdeel: string) => existsSync(path.join(ROOT, "components/personeel", onderdeel));
    expect(uitleg).toMatch(/taken/);
    // elke belofte alleen zolang de omgeving van de medewerker dat onderdeel heeft
    if (/loonstro/i.test(uitleg)) expect(heeft("LoonstrokenBlok.tsx")).toBe(true);
    if (/chat/i.test(uitleg)) expect(heeft("ChatPaneel.tsx")).toBe(true);
    if (/rooster|verlof|uren/i.test(uitleg)) expect(heeft("PlanningBlokken.tsx")).toBe(true);
    if (/documenten/i.test(uitleg)) expect(heeft("DocumentenBlok.tsx")).toBe(true);
    const pagina = readFileSync(path.join(ROOT, "app/personeel/page.tsx"), "utf8");
    if (/fooi/i.test(uitleg)) expect(pagina).toMatch(/fooi/);
    if (/melding/i.test(uitleg)) expect(pagina).toContain("<PushToggle");
  });
});

describe("het manifest en het icoon", () => {
  it("een eigen id per app, dus losse apps naast elkaar; het beginscherm binnen het bereik", () => {
    const ids = ZF_APPS.map((a) => manifestVan(a).id);
    expect(new Set(ids).size).toBe(ZF_APPS.length);
    expect(ids).not.toContain("/");
    for (const a of ZF_APPS) {
      const m = manifestVan(a);
      expect(m.start_url.startsWith(m.scope), a.id).toBe(true);
      expect(m.display).toBe("standalone");
      expect(m.icons.some((i) => i.purpose === "maskable"), a.id).toBe(true);
    }
  });

  it("het icoon is alleen vormen (de container heeft geen lettertypes) in de kleur van de app", () => {
    for (const a of ZF_APPS) {
      for (const masker of [false, true]) {
        const svg = icoonSvg(a, masker);
        expect(svg, a.id).not.toMatch(/<text|currentColor/);
        expect(svg, a.id).toContain(a.kleur);
      }
    }
  });

  it("de installeerpagina gebruikt het manifest van de app zelf, en /app verwijst naar /apps", () => {
    const pagina = readFileSync(path.join(ROOT, "app/(marketing)/apps/[id]/page.tsx"), "utf8");
    expect(pagina).toContain("manifest: `/apps/${a.id}/manifest.webmanifest`");
    expect(pagina).toContain("<InstallAppButton />");
    expect(readFileSync(path.join(ROOT, "app/(marketing)/app/page.tsx"), "utf8")).toContain('href="/apps"');
    expect(existsSync(path.join(ROOT, "app/(marketing)/apps/[id]/manifest.webmanifest/route.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "app/(marketing)/apps/[id]/icoon.png/route.ts"))).toBe(true);
  });
});
