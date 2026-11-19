import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPS } from "@/lib/marketing/apps";
import { NAV } from "@/lib/marketing/site-nav";

// "Apps & spelletjes" (19 nov 2026, eigenaar): een aparte menu-categorie, los van de voorbeelden op /website-maken,
// met knoppen "Ga naar …" naar de eigen apps. Eén lijst (lib/marketing/apps.ts) voor menu, pagina en sitemap.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("apps & spelletjes", () => {
  it("de lijst heeft spelletjes, Talkaro, FlikFlak en de webshop, met een 'Ga naar'-knop en een echt adres", () => {
    expect(APPS.map((a) => a.sleutel)).toEqual(["spelletjes", "talkaro", "flikflak", "webshop"]);
    for (const a of APPS) {
      expect(a.knop.startsWith("Ga naar ")).toBe(true);
      expect(a.extern ? /^https:\/\/[a-z]+\.zekerflex\.com$/.test(a.href) : a.href.startsWith("/")).toBe(true);
      expect(a.tekst).not.toMatch(/binnenkort/i);
    }
  });

  it("staat als eigen categorie in het hoofdmenu, voor werknemers én bedrijven, los van de voorbeelden", () => {
    const n = NAV.find((x) => x.key === "apps");
    expect(n?.href).toBe("/apps-en-spelletjes"); // niet /apps: dat is de pagina met de ZekerFlex-apps per doelgroep
    expect(n?.label).toBe("Apps & spelletjes");
    for (const a of ["werknemers", "bedrijven"] as const) {
      expect(n?.menu?.[a].items.map((i) => i.title)).toEqual(APPS.map((x) => x.knop));
    }
    expect(n?.href).not.toContain("voorbeelden");
  });

  it("de pagina /apps-en-spelletjes bestaat, gebruikt de lijst, ldJson en staat in de sitemap; /apps blijft de app-catalogus", () => {
    const pagina = bron("app/(marketing)/apps-en-spelletjes/page.tsx");
    expect(pagina).toContain("APPS.map(");
    expect(pagina).toContain("ldJson(breadcrumbJsonLd(");
    expect(pagina).not.toContain("JSON.stringify");
    expect(pagina).toContain('canonical("/apps-en-spelletjes")');
    expect(bron("app/sitemap.ts")).toContain('entry("/apps-en-spelletjes"');
    expect(bron("app/(marketing)/apps/page.tsx")).toContain("ZF_APPS");
  });
});
