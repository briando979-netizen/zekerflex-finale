import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLEEN_APP_VLAG, APP_PAGINA_URL, isStandaloneBrowser, PWA_COOKIE, toestelVan, werkerOmgevingToegestaan } from "@/lib/app-vereist";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { FLAG_REGISTRY } from "@/lib/flags";

// 21 nov 2026 (eigenaar, zoals YoungOnes): de werker-omgeving alleen in de app. 22 nov 2026 (eigenaar, na het
// gebruikersonderzoek: "eerst browser, dan app"): dat staat nu achter een vlag, standaard uit. De werker doet zijn startstappen
// en bekijkt de klussen in de browser; na de ID-check stelt een wegklikbare kaart de app voor. Werkgevers houden de website.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("eerst browser, dan app", () => {
  it("met de vlag uit (de standaard) mag de werker-omgeving gewoon in de browser", () => {
    expect(werkerOmgevingToegestaan({ alleenApp: false, inApp: false, pwaCookie: false, beheerder: false })).toBe(true);
    const vlag = FLAG_REGISTRY.find((f) => f.key === ALLEEN_APP_VLAG);
    expect(vlag?.default).toBe(false);
    expect(ALLEEN_APP_VLAG).toBe("werker-alleen-app");
  });

  it("met de vlag aan: alleen app, geïnstalleerde web-app of beheerder; een gewone browser niet", () => {
    expect(werkerOmgevingToegestaan({ alleenApp: true, inApp: true, pwaCookie: false, beheerder: false })).toBe(true);
    expect(werkerOmgevingToegestaan({ alleenApp: true, inApp: false, pwaCookie: true, beheerder: false })).toBe(true);
    expect(werkerOmgevingToegestaan({ alleenApp: true, inApp: false, pwaCookie: false, beheerder: true })).toBe(true);
    expect(werkerOmgevingToegestaan({ alleenApp: true, inApp: false, pwaCookie: false, beheerder: false })).toBe(false);
  });

  it("herkent een geïnstalleerde web-app (standalone of iOS)", () => {
    const w = (standalone: boolean, ios?: boolean) =>
      ({ matchMedia: () => ({ matches: standalone }), navigator: { standalone: ios } }) as unknown as Pick<Window, "matchMedia" | "navigator">;
    expect(isStandaloneBrowser(w(true))).toBe(true);
    expect(isStandaloneBrowser(w(false, true))).toBe(true);
    expect(isStandaloneBrowser(w(false))).toBe(false);
    expect(isStandaloneBrowser(undefined)).toBe(false);
  });

  it("per toestel één weg: iPhone (ook een iPad als Mac), Android of computer", () => {
    expect(toestelVan({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" })).toBe("iphone");
    expect(toestelVan({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 })).toBe("iphone");
    expect(toestelVan({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36" })).toBe("android");
    expect(toestelVan({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36", platform: "Win32", maxTouchPoints: 0 })).toBe("computer");
    expect(toestelVan({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 0 })).toBe("computer");
    expect(APP_PAGINA_URL).toBe("https://zekerflex.com/app");
  });

  it("de layout van /dashboard leest de vlag en gebruikt de poort vóór de shell; de server leest de cookie", () => {
    const layout = lees("app/dashboard/layout.tsx");
    expect(layout).toContain("featureEnabled(ALLEEN_APP_VLAG");
    const poort = layout.indexOf("werkerOmgevingToegestaan({ alleenApp, inApp: await inEigenApp()");
    expect(poort).toBeGreaterThan(0);
    expect(poort).toBeLessThan(layout.indexOf("<FreelancerShell"));
    expect(layout).toContain('beheerder: hasRole(principal, "PLATFORM_ADMIN")');
    expect(layout).toContain("<AppVereist");
    const server = lees("lib/app-mode-server.ts");
    expect(server).toContain(`c.get(PWA_COOKIE)?.value === "1"`);
    expect(PWA_COOKIE).toBe("zf_pwa");
  });

  it("het installatiescherm zet de cookie alleen als de pagina standalone draait, houdt de community en is client-veilig", () => {
    const s = lees("components/app/AppVereist.tsx");
    expect(s).toContain("if (!isStandaloneBrowser(window)) return;");
    expect(s).toContain("document.cookie = `${PWA_COOKIE}=1;");
    expect(s).toContain("<AppInstallatie />");
    expect(s).toContain("COMMUNITY_URL");
    for (const f of ["components/app/AppVereist.tsx", "components/app/AppInstallatie.tsx", "components/app/AppVoorstelKaart.tsx"]) {
      expect(lees(f), f).not.toMatch(/@\/lib\/(prisma|storage\/kv|mail|i18n\/server|flags)/);
      expect(lees(f), f).not.toContain("FREELANCER_DICTS");
    }
  });

  it("de installatie toont per toestel één weg en op de computer een QR-code naar de appspagina", () => {
    const s = lees("components/app/AppInstallatie.tsx");
    expect(s).toContain("setToestel(toestelVan(navigator))");
    expect(s).toContain('if (toestel === "computer")');
    expect(s).toContain("<QrCode value={APP_PAGINA_URL}");
    // een iPhone ziet geen Android-stappen en andersom
    expect(s).toMatch(/toestel === "iphone" \? \(\s*<div[\s\S]*TESTFLIGHT_URL[\s\S]*\) : \(\s*<div[\s\S]*TESTGROEP_URL/);
  });

  it("Ontdekken stelt de app pas na de ID-check voor, alleen in een gewone browser, en de kaart is weg te klikken", () => {
    const p = lees("app/dashboard/klussen/page.tsx");
    expect(p).toContain("const toonAppVoorstel = poort?.identiteitIngestuurd === true && !(await inEigenApp());");
    expect(p).toContain("{toonAppVoorstel && <AppVoorstelKaart />}");
    const k = lees("components/app/AppVoorstelKaart.tsx");
    expect(k).toContain("if (isStandaloneBrowser(window)) return;");
    expect(k).toContain("localStorage.setItem(WEG_KEY");
  });

  it("de teksten in vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const k of ["kop", "tekst", "android", "iphone", "alKop", "alTekst", "openen", "werkgever", "site", "uitloggen", "qrKop", "qrTekst", "qrLabel", "kaartKop", "kaartTekst", "kaartHoe", "kaartWeg"] as const) {
        expect(d.appVereist[k].length, `${taal} ${k}`).toBeGreaterThan(2);
      }
      if (taal !== "nl") {
        expect(d.appVereist.kop, taal).not.toBe(FREELANCER_DICTS.nl.appVereist.kop);
        expect(d.appVereist.kaartTekst, taal).not.toBe(FREELANCER_DICTS.nl.appVereist.kaartTekst);
      }
    }
  });
});
