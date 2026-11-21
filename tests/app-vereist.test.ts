import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isStandaloneBrowser, PWA_COOKIE, werkerOmgevingToegestaan } from "@/lib/app-vereist";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";

// 21 nov 2026 (eigenaar, zoals YoungOnes): de werker-omgeving alleen in de app; in een gewone browser het scherm
// "Installeer de app". Werkgevers houden de website; beheerders mogen altijd kijken.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("de werker-omgeving alleen in de app", () => {
  it("toegang: app, geïnstalleerde web-app of beheerder; een gewone browser niet", () => {
    expect(werkerOmgevingToegestaan({ inApp: true, pwaCookie: false, beheerder: false })).toBe(true);
    expect(werkerOmgevingToegestaan({ inApp: false, pwaCookie: true, beheerder: false })).toBe(true);
    expect(werkerOmgevingToegestaan({ inApp: false, pwaCookie: false, beheerder: true })).toBe(true);
    expect(werkerOmgevingToegestaan({ inApp: false, pwaCookie: false, beheerder: false })).toBe(false);
  });

  it("herkent een geïnstalleerde web-app (standalone of iOS)", () => {
    const w = (standalone: boolean, ios?: boolean) =>
      ({ matchMedia: () => ({ matches: standalone }), navigator: { standalone: ios } }) as unknown as Pick<Window, "matchMedia" | "navigator">;
    expect(isStandaloneBrowser(w(true))).toBe(true);
    expect(isStandaloneBrowser(w(false, true))).toBe(true);
    expect(isStandaloneBrowser(w(false))).toBe(false);
    expect(isStandaloneBrowser(undefined)).toBe(false);
  });

  it("de layout van /dashboard gebruikt de poort vóór de shell, en de server leest de cookie", () => {
    const layout = lees("app/dashboard/layout.tsx");
    const poort = layout.indexOf("werkerOmgevingToegestaan({ inApp: await inEigenApp()");
    expect(poort).toBeGreaterThan(0);
    expect(poort).toBeLessThan(layout.indexOf("<FreelancerShell"));
    expect(layout).toContain('beheerder: hasRole(principal, "PLATFORM_ADMIN")');
    expect(layout).toContain("<AppVereist");
    const server = lees("lib/app-mode-server.ts");
    expect(server).toContain(`c.get(PWA_COOKIE)?.value === "1"`);
    expect(PWA_COOKIE).toBe("zf_pwa");
  });

  it("het scherm zet de cookie alleen als de pagina standalone draait, en is client-veilig", () => {
    const s = lees("components/app/AppVereist.tsx");
    expect(s).toContain("if (!isStandaloneBrowser(window)) return;");
    expect(s).toContain("document.cookie = `${PWA_COOKIE}=1;");
    expect(s).not.toMatch(/@\/lib\/(prisma|storage\/kv|mail|i18n\/server)/);
  });

  it("de teksten in vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const k of ["kop", "tekst", "android", "iphone", "alKop", "alTekst", "openen", "werkgever", "site", "uitloggen"] as const) {
        expect(d.appVereist[k].length, `${taal} ${k}`).toBeGreaterThan(2);
      }
      if (taal !== "nl") expect(d.appVereist.kop, taal).not.toBe(FREELANCER_DICTS.nl.appVereist.kop);
    }
  });
});
