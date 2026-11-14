import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => undefined) }));
vi.mock("@/lib/ops/error-journal", () => ({ journal: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { journal } from "@/lib/ops/error-journal";
import { beoordeel, draaiRondgang, openbareRoutes, rondgangRoutes } from "@/lib/ops/rondgang";

// Nachtelijke rondgang (lib/ops/rondgang.ts): welke pagina's, en wat telt als kapot.

describe("openbareRoutes", () => {
  it("neemt alleen vaste, openbare pagina's mee", () => {
    const routes = openbareRoutes([
      { route: "/", dynamic: false },
      { route: "/prijzen", dynamic: false },
      { route: "/klussen/[id]", dynamic: true },
      { route: "/dashboard/klussen", dynamic: false },
      { route: "/admin", dynamic: false },
      { route: "/werkgever/uren", dynamic: false },
      { route: "/start", dynamic: false },
      { route: "/kaart", dynamic: false },
      { route: "/i/[code]", dynamic: true },
    ]);
    expect(routes).toEqual(["/", "/prijzen"]);
  });

  it("vindt in de echte lijst tientallen openbare pagina's en geen privépagina's", () => {
    const routes = openbareRoutes();
    expect(routes.length).toBeGreaterThan(50);
    expect(routes.some((r) => r.startsWith("/dashboard") || r.startsWith("/admin") || r.startsWith("/werkgever"))).toBe(false);
    expect(routes).toContain("/rekentools/btw-nummer-check");
    // nieuwe openbare pagina (13 nov): hoort in de nachtelijke ronde
    expect(routes).toContain("/website-maken");
  });
});

describe("beoordeel", () => {
  const html = (t: string) => `<html><head><style>a{}</style><script>var x=1</script></head><body><main>${t}</main></body></html>`;
  it("keurt een gewone pagina goed en herkent lege, kapotte en ontbrekende pagina's", () => {
    expect(beoordeel(200, html("Welkom bij ZekerFlex. ".repeat(30)))).toBeNull();
    expect(beoordeel(200, html("<h1>Sorry, dit onderdeel haperde even</h1>"))).toBe("toont de foutgrens");
    expect(beoordeel(200, html("<p>hoi</p>"))).toMatch(/bijna lege pagina/);
    expect(beoordeel(404, "")).toBe("pagina bestaat niet (404)");
    expect(beoordeel(500, "")).toBe("serverfout 500");
    expect(beoordeel(null, "")).toBe("geen antwoord");
    // een niet-HTML-antwoord (bv. robots.txt via een route) telt als in orde
    expect(beoordeel(200, "User-agent: *", "text/plain")).toBeNull();
  });
});

describe("draaiRondgang", () => {
  it("haalt elke pagina op en zet wat kapot is in het foutenlogboek", async () => {
    const gezien: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        gezien.push(url);
        const kapot = url.endsWith("/prijzen");
        return new Response(kapot ? "<html><body><h1>Sorry, dit onderdeel haperde even</h1></body></html>" : `<html><body>${"Tekst ".repeat(100)}</body></html>`, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }),
    );
    // de klok vast: de steekproef van stadspagina's hangt af van de Amsterdamse dag (lib/ops/rondgang.ts rondgangRoutes)
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T04:20:00+01:00"));
    const uit = await draaiRondgang("https://voorbeeld.test/", 2);
    expect(uit.totaal).toBe(rondgangRoutes(new Date("2026-11-14T04:20:00+01:00")).length);
    expect(uit.totaal).toBeGreaterThan(openbareRoutes().length);
    expect(gezien.some((u) => u.endsWith("/register?type=bedrijf"))).toBe(true);
    vi.useRealTimers();
    expect(gezien.every((u) => u.startsWith("https://voorbeeld.test/"))).toBe(true);
    expect(uit.problemen).toEqual([{ route: "/prijzen", status: 200, reden: "toont de foutgrens" }]);
    expect(journal).toHaveBeenCalledWith("error", "pagina kapot", expect.objectContaining({ route: "/prijzen" }));
    vi.unstubAllGlobals();
  });
});
