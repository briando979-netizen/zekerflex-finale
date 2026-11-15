import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lijst } from "@/lib/http/zod-lijst";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

// Lijsten die zonder inloggen binnenkomen: eerst de lengte, dan pas de elementen (15 nov 2026, lib/http/zod-lijst.ts).
// Zod 3 bekeek bij z.array(x).max(n) eerst elk element: 1 MB met 500.000 foute elementen kostte 840 ms en 185 MB.

const item = z.object({ variantId: z.string().min(1), qty: z.number().int().positive().max(99) });
const oud = z.object({ items: z.array(item).min(1).max(40) });
const nieuw = z.object({ items: lijst(item, { min: 1, max: 40 }) });
const codes = (r: z.SafeParseReturnType<unknown, unknown>) => (r.success ? [] : r.error.issues.map((i) => [i.code, i.path.join("."), i.message]));

describe("lijst: dezelfde uitkomst als z.array, maar te lang = meteen klaar", () => {
  it("geldige invoer: dezelfde gegevens", () => {
    const goed = { items: [{ variantId: "v1", qty: 2 }] };
    expect(nieuw.parse(goed)).toEqual(oud.parse(goed));
  });

  it("foute elementen, te kort, geen lijst: dezelfde meldingen", () => {
    for (const data of [{ items: [{ variantId: "", qty: 2 }, { variantId: "v", qty: 0 }] }, { items: [] }, { items: "x" }, {}]) {
      expect(codes(nieuw.safeParse(data))).toEqual(codes(oud.safeParse(data)));
    }
  });

  it("te lang: één melding, gelijk aan die van z.array().max, zonder de elementen te bekijken", () => {
    const groot = { items: new Array(500_000).fill(0) };
    const r = nieuw.safeParse(groot);
    expect(r.success).toBe(false);
    expect(codes(r)).toEqual([["too_big", "items", "Array must contain at most 40 element(s)"]]);
    // de oude vorm geeft een melding per element
    expect(codes(oud.safeParse(groot)).length).toBeGreaterThan(400_000);
  });

  it("zonder min, en optioneel", () => {
    const s = z.object({ tags: lijst(z.string().max(5), { max: 2 }).optional() });
    expect(s.parse({})).toEqual({});
    expect(s.parse({ tags: ["a", "b"] })).toEqual({ tags: ["a", "b"] });
    expect(s.safeParse({ tags: ["a", "b", "c"] }).success).toBe(false);
    expect(s.safeParse({ tags: ["te lang"] }).success).toBe(false);
  });
});

describe("bewaker: openbare schrijfroutes gebruiken lijst()", () => {
  // Deze routes controleren eerst een sleutel of sessie en lezen pas daarna de body: daar komt niemand van buiten.
  const NA_TOEGANG = new Set([
    "app/api/internal/agents/route.ts",
    "app/api/internal/pricing/route.ts",
    "app/api/internal/ai-node/register/route.ts",
    "app/api/public/v1/webhooks/route.ts",
    "app/api/voorstel/schwarzwald/beheer/instellingen/route.ts",
    "app/api/voorstel/schwarzwald/beheer/klanten/route.ts",
    "app/api/voorstel/schwarzwald/beheer/paginas/route.ts",
    "app/api/chat/settings/route.ts",
  ]);
  const loop = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? loop(path.join(d, e.name)) : e.name === "route.ts" ? [path.join(d, e.name)] : []));

  it("geen z.array in een openbare POST/PUT/PATCH-route, behalve achter een sleutel of sessie", () => {
    const fout: string[] = [];
    for (const bestand of loop(path.join(process.cwd(), "app", "api"))) {
      const rel = path.relative(process.cwd(), bestand).split(path.sep).join("/");
      const url = "/" + rel.replace(/^app\//, "").replace(/\/route\.ts$/, "").replace(/\[[^\]]+\]/g, "x");
      if (!isPublicApiRoute(url) || NA_TOEGANG.has(rel)) continue;
      const s = readFileSync(bestand, "utf8");
      if (/export (async function|const) (POST|PUT|PATCH)/.test(s) && /\bz\s*\.\s*array\(/.test(s)) fout.push(rel);
    }
    expect(fout, "gebruik lijst() uit lib/http/zod-lijst.ts").toEqual([]);
  });
});
