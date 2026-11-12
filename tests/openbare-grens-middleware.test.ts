import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPublicApiRoute } from "@/lib/auth/public-routes";
import { STANDAARD_GRENS, UITZONDERINGEN, maxVoor, teGroot } from "@/lib/http/openbare-grens";

// De centrale groottegrens voor openbare schrijfroutes (12 nov 2026, 86): 413 in de middleware als Content-Length boven
// de grens ligt. Bewaker (tests/bewakers.json): elke openbare route die bestanden aanneemt, staat in UITZONDERINGEN.

const ROOT = process.cwd();

/** Alle route.ts onder app/api, als [bestand, pad] (dynamische stukken als [x]). */
function routes(dir = path.join(ROOT, "app", "api")): [string, string][] {
  const uit: [string, string][] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) uit.push(...routes(p));
    else if (d.name === "route.ts") {
      const rel = path.relative(path.join(ROOT, "app"), path.dirname(p)).split(path.sep).join("/");
      uit.push([p, `/${rel}`]);
    }
  }
  return uit;
}
/** Een concreet pad om isPublicApiRoute mee te vragen: [slug] → x, [...pad] → x. */
const concreet = (pad: string) => pad.replace(/\[\[?\.{0,3}[^\]]+\]\]?/g, "x");

describe("de grens", () => {
  it("1 MB standaard, de uitzonderingen per pad (ook voor wat eronder hangt)", () => {
    expect(maxVoor("/api/demo")).toBe(STANDAARD_GRENS);
    expect(maxVoor("/api/werken-bij")).toBeGreaterThan(25_000_000);
    expect(maxVoor("/api/webhooks/stripe")).toBe(2_000_000);
    expect(maxVoor("/api/werken-bij-nep")).toBe(STANDAARD_GRENS);
  });

  it("alleen schrijven, alleen openbaar, alleen /api, alleen met een opgegeven Content-Length", () => {
    expect(teGroot("POST", "/api/demo", "2000000", true)).toBe(true);
    expect(teGroot("POST", "/api/demo", "900000", true)).toBe(false);
    expect(teGroot("GET", "/api/demo", "2000000", true)).toBe(false);
    expect(teGroot("POST", "/api/demo", "2000000", false)).toBe(false); // ingelogde route: ongemoeid
    expect(teGroot("POST", "/dashboard", "2000000", true)).toBe(false);
    expect(teGroot("POST", "/api/demo", null, true)).toBe(false);
    expect(teGroot("PUT", "/api/werken-bij", "20000000", true)).toBe(false);
    expect(teGroot("patch", "/api/werken-bij", "30000000", true)).toBe(true);
  });

  it("de middleware past hem toe, vóór de rest, met 413 en een eigen code", () => {
    const mw = readFileSync(path.join(ROOT, "middleware.ts"), "utf8");
    expect(mw).toMatch(/teGroot\(req\.method, req\.nextUrl\.pathname, req\.headers\.get\("content-length"\), isPublicApiRoute\(req\.nextUrl\.pathname\)\)/);
    expect(mw).toMatch(/TE_GROOT_ANTWOORD, \{ status: 413, headers: \{ Connection: "close" \} \}/);
  });
});

describe("bewaker: openbare routes die bestanden aannemen", () => {
  it("staan allemaal in UITZONDERINGEN (anders weigert de grens van 1 MB hun uploads)", () => {
    const missen: string[] = [];
    for (const [bestand, pad] of routes()) {
      if (!isPublicApiRoute(concreet(pad))) continue;
      const t = readFileSync(bestand, "utf8");
      // alleen wat het verzoek zelf binnenkrijgt (niet een antwoord van buiten, zoals een kaarttegel) en alleen bij schrijven
      const schrijft = /export (async )?function (POST|PUT|PATCH)\b|export const (POST|PUT|PATCH)\b/.test(t);
      const neemtBestanden = schrijft && /instanceof File\b|\b(request|req)\.arrayBuffer\(\)/.test(t);
      if (neemtBestanden && maxVoor(concreet(pad)) <= STANDAARD_GRENS) missen.push(pad);
    }
    expect(missen, "zet deze in UITZONDERINGEN (lib/http/openbare-grens.ts)").toEqual([]);
  });

  it("elke uitzondering is een bestaande, openbare route", () => {
    for (const u of UITZONDERINGEN) {
      expect(isPublicApiRoute(u.pad), u.pad).toBe(true);
      expect(existsSync(path.join(ROOT, "app", ...u.pad.split("/").filter(Boolean), "route.ts")), u.pad).toBe(true);
      expect(u.max).toBeGreaterThan(STANDAARD_GRENS);
    }
  });
});
