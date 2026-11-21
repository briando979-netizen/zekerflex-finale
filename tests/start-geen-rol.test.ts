import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 21 nov 2026: een ingelogd account zonder enige rol (het bedrijf ervan is gewist bij de reset) ging in de Android-app
// eindeloos /start → /dashboard → /start ("zekerflex.com heeft je te vaak omgeleid"), omdat de poort de oude rol in de
// sessie nog zag. /start logt zo'n account nu uit via /uitloggen en het inlogscherm legt uit waarom.

const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("een account zonder rol wordt op /start uitgelogd", () => {
  it("/start stuurt een account zonder rol naar /uitloggen, ná de horeca-medewerker en vóór /dashboard", () => {
    const s = lees("app/start/page.tsx");
    const medewerker = s.indexOf('if (principal.grants.length === 0 && (await isMedewerker(principal.userId))) redirect("/personeel");');
    const geenRol = s.indexOf('if (principal.grants.length === 0) redirect("/uitloggen?reden=GeenRol");');
    const dashboard = s.lastIndexOf('redirect("/dashboard");');
    expect(medewerker).toBeGreaterThan(0);
    expect(geenRol).toBeGreaterThan(medewerker);
    expect(dashboard).toBeGreaterThan(geenRol);
  });

  it("/uitloggen wist alleen de sessiecookie en stuurt naar /login met de reden als error-code", () => {
    const r = lees("app/uitloggen/route.ts");
    expect(r).toContain("res.cookies.set(SESSION_COOKIE, \"\", { path: \"/\", maxAge: 0");
    expect(r).toContain('new URL("/login", env.APP_BASE_URL)');
    expect(r).toContain('naar.searchParams.set("error", reden)');
    // alleen bekende redenen komen in de URL (geen open tekst van buiten)
    expect(r).toContain('const REDENEN = new Set(["GeenRol"]);');
    // geen extra exports in een route-bestand
    expect(r.match(/^export /gm)?.length).toBe(3);
  });

  it("het inlogscherm kent de melding", () => {
    expect(lees("components/auth/LoginForm.tsx")).toMatch(/GeenRol: "Dit account hoort bij geen bedrijf of werkersprofiel meer/);
  });
});
