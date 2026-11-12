import { afterEach, describe, expect, it } from "vitest";
import { apmSnapshot, BEKEND_TRAAG_MAX_MS, meetQuery, meetVerzoek, percentiel, queryVorm, resetApm, routeLabel, trageQueryNiveau } from "@/lib/ops/apm";
import { gebeurtenisVan, parseDsn, stuurNaarGlitchtip } from "@/lib/ops/glitchtip";
import type { ErrorGroup } from "@/lib/ops/error-journal";

// Prestatiemeting in eigen beheer (Admin → Prestaties) en de koppeling met GlitchTip.

afterEach(() => resetApm());

describe("routeLabel", () => {
  it("vervangt id's in het pad door :id", () => {
    expect(routeLabel("get", "/api/invoices/cmw1i8527007rs8lr9qltnx2f/pdf")).toBe("GET /api/invoices/:id/pdf");
    expect(routeLabel("POST", "/api/timesheets/3f2504e0-4f89-11d3-9a0c-0305e82c3301/gps")).toBe("POST /api/timesheets/:id/gps");
    expect(routeLabel("GET", "/api/werkgever/branches/42")).toBe("GET /api/werkgever/branches/:id");
    expect(routeLabel("GET", "/api/me/agenda-link")).toBe("GET /api/me/agenda-link");
  });
});

describe("percentiel", () => {
  it("p95 van een reeks", () => {
    expect(percentiel([], 95)).toBe(0);
    expect(percentiel([10], 95)).toBe(10);
    expect(percentiel(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBe(95);
    expect(percentiel([5, 1, 3], 50)).toBe(3);
  });
});

describe("meetVerzoek / apmSnapshot", () => {
  it("telt per route, met fouten, p95 en het laatste uur", () => {
    const now = Date.UTC(2026, 10, 5, 10, 30);
    for (let i = 1; i <= 20; i++) meetVerzoek("GET /api/x", i * 10, 200, now);
    meetVerzoek("GET /api/x", 900, 500, now);
    meetVerzoek("POST /api/y", 50, 201, now - 2 * 3_600_000); // twee uur geleden: niet in "laatste uur"
    const s = apmSnapshot(now);
    expect(s.laatsteUur).toEqual({ verzoeken: 21, fouten: 1, gemMs: Math.round((2100 + 900) / 21) });
    const x = s.routes.find((r) => r.route === "GET /api/x");
    expect(x).toMatchObject({ count: 21, errors: 1, maxMs: 900 });
    expect(x?.p95Ms).toBe(200);
    expect(s.routes[0]?.route).toBe("GET /api/x");
  });

  it("houdt alleen de laatste 200 duren per route bij", () => {
    for (let i = 0; i < 300; i++) meetVerzoek("GET /a", i, 200);
    expect(apmSnapshot().routes[0]?.p95Ms).toBe(Math.ceil(0.95 * 200) - 1 + 100);
  });
});

describe("trageQueryNiveau", () => {
  // zoals op prod (12 nov): de RAG-zoekquery, 1,5–1,8 s
  const rag = `SELECT "public"."RagChunk"."id", "public"."RagChunk"."sourceType"::text, "public"."RagChunk"."title" FROM "public"."RagChunk" WHERE 1=1`;

  it("de bekende RAG-query onder de drempel is info, erboven blijft het een waarschuwing", () => {
    expect(trageQueryNiveau(1_720, rag)).toBe("info");
    expect(trageQueryNiveau(BEKEND_TRAAG_MAX_MS - 1, rag)).toBe("info");
    expect(trageQueryNiveau(BEKEND_TRAAG_MAX_MS, rag)).toBe("warn");
  });

  it("elke andere trage query blijft een waarschuwing, ook als hij RagChunk met iets anders samenvoegt", () => {
    expect(trageQueryNiveau(1_720, `SELECT "public"."Shift"."id" FROM "public"."Shift"`)).toBe("warn");
    expect(trageQueryNiveau(1_720, `SELECT "public"."RagChunk"."id" FROM "public"."RagChunk" JOIN "public"."User" ON 1=1`)).toBe("warn");
    expect(trageQueryNiveau(1_720, `DELETE FROM "public"."RagChunk" WHERE "sourceRef" = $1`)).toBe("warn");
  });
});

describe("meetQuery / queryVorm", () => {
  it("bewaart alleen de vorm van een trage query", () => {
    const sql = `SELECT "public"."Shift"."id" FROM "public"."Shift" LEFT JOIN "public"."Branch" ON "public"."Branch"."id" = "public"."Shift"."branchId" WHERE "public"."Shift"."id" = $1`;
    expect(queryVorm(sql)).toBe("SELECT Shift, Branch (1 join)");
    expect(queryVorm(`INSERT INTO "public"."GpsEvent" ("id") VALUES ($1)`)).toBe("INSERT GpsEvent");
    expect(meetQuery(20, sql, 500)).toBe(false);
    expect(meetQuery(800, sql, 500)).toBe(true);
    const q = apmSnapshot().queries;
    expect(q).toMatchObject({ count: 2, slow: 1, maxMs: 800 });
    expect(q.slowSamples[0]).toMatchObject({ ms: 800, sql: "SELECT Shift, Branch (1 join)" });
  });
});

describe("GlitchTip", () => {
  const groep: ErrorGroup = { id: "0123456789abcdef", level: "error", message: "unexpected server error", reason: "boom", route: "GET /api/x", count: 3, firstAt: "2026-11-05T08:00:00.000Z", lastAt: "2026-11-05T09:00:00.000Z", samples: [{ at: "2026-11-05T09:00:00.000Z", detail: "{}" }] };

  it("leest een DSN naar store-adres en auth-header", () => {
    expect(parseDsn("https://abc123@fouten.zekerflex.com/3")).toEqual({ storeUrl: "https://fouten.zekerflex.com/api/3/store/", authHeader: "Sentry sentry_version=7, sentry_client=zekerflex/1.0, sentry_key=abc123" });
    expect(parseDsn("https://fouten.zekerflex.com/3")).toBeNull();
    expect(parseDsn("https://abc@fouten.zekerflex.com/")).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("kapot")).toBeNull();
  });

  it("maakt een Sentry-gebeurtenis met dezelfde groepering als het logboek", () => {
    const e = gebeurtenisVan(groep, "abc123");
    expect(e).toMatchObject({ platform: "node", level: "error", fingerprint: ["0123456789abcdef"], tags: { route: "GET /api/x", groep: "0123456789abcdef" }, release: "abc123", message: { formatted: "unexpected server error — boom" } });
    expect(e.event_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("stuurt niets zonder DSN", async () => {
    let calls = 0;
    const n = await stuurNaarGlitchtip([groep], (async () => {
      calls += 1;
      return new Response("", { status: 200 });
    }) as typeof fetch);
    expect(n).toBe(0);
    expect(calls).toBe(0);
  });
});
