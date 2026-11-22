import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CTA_BV, CTA_WN, HOOFDKNOP, KOP_KNOPPEN, SNELLE_ACTIES, kantVanPad } from "@/lib/marketing/site-nav";

// De knoppen rechtsboven op de site. 22 nov 2026 (gebruikersonderzoek punt 8): "Inloggen" ging bij werkers naar het
// introscherm in plaats van het inlogscherm, en werkers zagen 6 knopteksten, bedrijven 7. Nu: Inloggen altijd naar /login, en
// per kant één hoofdknop met één tekst (werker: "Maak gratis je profiel", bedrijf: "Plaats een klus").

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("knoppen in de kopbalk per kant", () => {
  it("werkers: Inloggen naar /login en Maak gratis je profiel naar /register", () => {
    const w = KOP_KNOPPEN.werknemers;
    expect(w.eerste).toEqual({ label: "Inloggen", href: "/login" });
    expect(w.mobiel).toEqual({ label: "Inloggen", href: "/login" });
    expect(w.tweede).toEqual({ label: "Maak gratis je profiel", href: "/register" });
  });

  it("bedrijven: Inloggen naar /login en Plaats een klus naar /klus-plaatsen", () => {
    const b = KOP_KNOPPEN.bedrijven;
    expect(b.eerste).toEqual({ label: "Inloggen", href: "/login" });
    expect(b.mobiel).toEqual({ label: "Inloggen", href: "/login" });
    expect(b.tweede).toEqual({ label: "Plaats een klus", href: "/klus-plaatsen" });
  });

  it("één hoofdknoptekst per kant, ook in de uitklapmenu's; Download de app één keer in het mobiele menu", () => {
    expect(HOOFDKNOP.werknemers).toBe(CTA_WN);
    expect(HOOFDKNOP.bedrijven).toBe(CTA_BV);
    const menu = lees("components/marketing/MobileMenu.tsx");
    expect(menu).not.toContain('href="/app"');
    expect(menu).not.toContain("DOELGROEP_PAGINA");
    expect(SNELLE_ACTIES.werknemers.filter((s) => s.href === "/app")).toHaveLength(1);
    expect(SNELLE_ACTIES.bedrijven.some((s) => s.href === "/tarieven-overzicht")).toBe(false);
    for (const lijst of Object.values(SNELLE_ACTIES)) expect(lijst.some((s) => s.label === "Ga naar de app")).toBe(false);
  });

  it("elke bedrijvenpagina telt als bedrijven, werkerspagina's als werkers", () => {
    for (const pad of ["/bedrijven", "/voor-bedrijven", "/partners/uitzend", "/uitzendpartner/voorwaarden", "/prijzen", "/personeel-inhuren/groningen", "/klus-plaatsen", "/vragen", "/vragen/wat-kost-een-flexwerker-per-uur"]) {
      expect(kantVanPad(pad), pad).toBe("bedrijven");
    }
    for (const pad of ["/", "/voor-freelancers", "/starten-als-uitzendkracht", "/klussen", "/app", "/bijbaan", "/bijbaan/groningen", "/werken-als", "/werken-als/orderpicker"]) expect(kantVanPad(pad), pad).toBe("werknemers");
    for (const pad of ["/over-ons", "/kennis", "/contact"]) expect(kantVanPad(pad), pad).toBeNull();
    expect(lees("components/marketing/SiteHeader.tsx")).toContain('kantVanPad(pathname) ?? stored ?? "werknemers"');
  });

  it("de kopbalk en het mobiele menu gebruiken de knoppen per kant, niet een vaste inlogknop", () => {
    for (const f of ["components/marketing/SiteHeader.tsx", "components/marketing/MobileMenu.tsx"]) {
      const bron = lees(f);
      expect(bron, f).toContain("KOP_KNOPPEN");
      expect(bron, f).not.toContain('href="/login"');
      expect(bron, f).not.toContain(".inloggen");
    }
  });

  it("op /app kan een werker ook inloggen of een account aanmaken in de browser", () => {
    const bron = lees("components/marketing/AppDownload.tsx");
    expect(bron).toContain("Al een account?");
    expect(bron).toContain('href="/login"');
    expect(bron).toContain('href="/register"');
    expect(lees("app/(marketing)/app/page.tsx")).toContain("<AppDownload standalone />");
  });
});
