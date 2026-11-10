import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INGELOGDE_DELEN, inlogAdres, isIngelogdDeel, sessieIsWeg } from "@/lib/ops/uitgelogd";

// Foutenlogboek 10 nov: GET /dashboard/verificatie viel om met "Je bent niet (meer) ingelogd"
// (requirePrincipal in de pagina, sessie net verlopen). Het foutscherm stuurt een uitgelogde
// bezoeker van een ingelogd deel nu naar /login met terugkeer, in plaats van "Er ging iets mis".

describe("uitgelogd op een pagina achter een inlog", () => {
  it("herkent de ingelogde delen, en niet de openbare site", () => {
    for (const p of ["/dashboard", "/dashboard/verificatie", "/werkgever/diensten/x", "/studio/webshop/kassa", "/admin/systeem", "/os"]) expect(isIngelogdDeel(p), p).toBe(true);
    for (const p of ["/", "/kennis/faq", "/dashboardx", "/werkgevers", "/login", "/site/demo"]) expect(isIngelogdDeel(p), p).toBe(false);
    expect(INGELOGDE_DELEN).toContain("/dashboard");
  });

  it("stuurt naar /login met terugkeer, alleen naar een pad op onze eigen site", () => {
    expect(inlogAdres("/dashboard/verificatie")).toBe("/login?callbackUrl=%2Fdashboard%2Fverificatie");
    expect(inlogAdres("/dashboard/klussen", "?employer=Bakker")).toBe("/login?callbackUrl=%2Fdashboard%2Fklussen%3Femployer%3DBakker");
    expect(inlogAdres("//evil.example/x")).toBe("/login?callbackUrl=%2F");
    expect(inlogAdres("https://evil.example/")).toBe("/login?callbackUrl=%2F");
  });

  it("alleen null van /api/auth/session telt als uitgelogd", () => {
    expect(sessieIsWeg(null)).toBe(true);
    expect(sessieIsWeg({ user: { email: "a@b.test" } })).toBe(false);
    expect(sessieIsWeg(undefined)).toBe(false);
  });

  it("beide foutschermen gebruiken het", () => {
    for (const f of ["app/error.tsx", "app/admin/error.tsx"]) {
      expect(readFileSync(path.join(process.cwd(), f), "utf8"), f).toMatch(/useNaarInlogAlsUitgelogd\(/);
    }
  });
});
