import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KOP_KNOPPEN } from "@/lib/marketing/site-nav";

// De knoppen rechtsboven op de site (21 nov 2026, eigenaar: "die login knopje bedoelde ik, bij werknemers moet daar staan ga naar
// de app"). Werkers: Ga naar de app + Start vandaag (account aanmaken); bedrijven: Inloggen + Start vandaag (aanmelden).

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("knoppen in de kopbalk per kant", () => {
  it("werkers: in plaats van Inloggen staat er Ga naar de app; Start vandaag blijft account aanmaken", () => {
    const w = KOP_KNOPPEN.werknemers;
    expect(w.eerste).toEqual({ label: "Ga naar de app", href: "/app" });
    expect(w.mobiel.href).toBe("/app");
    expect(w.tweede).toEqual({ label: "Start vandaag", href: "/register" });
  });

  it("bedrijven: inloggen en start vandaag (aanmelden als bedrijf)", () => {
    const b = KOP_KNOPPEN.bedrijven;
    expect(b.eerste).toEqual({ label: "Inloggen", href: "/login" });
    expect(b.tweede.label).toBe("Start vandaag");
    expect(b.tweede.href).toContain("type=bedrijf");
    expect(b.mobiel.href).toBe("/login");
  });

  it("de kopbalk en het mobiele menu gebruiken de knoppen per kant, niet een vaste inlogknop", () => {
    for (const f of ["components/marketing/SiteHeader.tsx", "components/marketing/MobileMenu.tsx"]) {
      const bron = lees(f);
      expect(bron, f).toContain("KOP_KNOPPEN");
      expect(bron, f).not.toContain('href="/login"');
    }
  });

  it("op /app kan een werker ook inloggen of een account aanmaken in de browser", () => {
    const bron = lees("components/marketing/AppDownload.tsx");
    expect(bron).toContain('href="/login"');
    expect(bron).toContain('href="/register"');
    expect(lees("app/(marketing)/app/page.tsx")).toContain("<AppDownload standalone />");
  });
});
