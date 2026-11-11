import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  admin: true,
  ingelogd: true,
  tenant: "t1" as string | undefined,
  audit: vi.fn(),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
}));
vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      if (!m.ingelogd) throw AppError.unauthenticated();
      return { userId: "u1" };
    },
    hasRole: () => m.admin,
  };
});
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: m.tenant ? [m.tenant] : [] }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => m.audit(...a) }));

import * as route from "@/app/api/werkgever/voorraad/route";
import * as exportRoute from "@/app/api/werkgever/voorraad/export/route";

const url = (p: string) => `http://app:3000${p}`;
const json = (method: string, p: string, body?: unknown) => new Request(url(p), { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const lees = async (r: Response) => (await r.json()) as Record<string, any>;

const maak = async (over: Record<string, unknown> = {}) => {
  const res = await route.POST(json("POST", "/api/werkgever/voorraad", { naam: "Schroeven", eenheid: "doos", aantal: 5, minimum: 2, ...over }));
  return { res, b: await lees(res) };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
  m.kv.clear();
  m.admin = true;
  m.ingelogd = true;
  m.tenant = "t1";
  m.audit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("toegang", () => {
  it("niet ingelogd geeft 401", async () => {
    m.ingelogd = false;
    expect((await route.GET(json("GET", "/api/werkgever/voorraad"))).status).toBe(401);
  });
  it("een lid zonder beheerdersrol krijgt 423 met een eigen code, geen 403", async () => {
    m.admin = false;
    for (const res of [await route.GET(json("GET", "/api/werkgever/voorraad")), await route.POST(json("POST", "/api/werkgever/voorraad", {})), await exportRoute.GET()]) {
      expect(res.status).toBe(423);
      expect((await lees(res)).error.code).toBe("ALLEEN_BEHEERDER");
    }
  });
  it("zonder organisatie: niet gevonden", async () => {
    m.tenant = undefined;
    expect((await route.GET(json("GET", "/api/werkgever/voorraad"))).status).toBe(404);
  });
});

describe("artikelen", () => {
  it("POST maakt een artikel en GET geeft de lijst zonder cache", async () => {
    const { res, b } = await maak();
    expect(res.status).toBe(201);
    expect(b.artikel.aantal).toBe(5);
    const lijst = await route.GET(json("GET", "/api/werkgever/voorraad"));
    expect(lijst.headers.get("cache-control")).toBe("no-store");
    expect((await lees(lijst)).artikelen).toHaveLength(1);
  });
  it("een ongeldig artikel geeft 422 met een Nederlandse tekst, een dubbel artikelnummer 409", async () => {
    const slecht = await maak({ naam: "a" });
    expect(slecht.res.status).toBe(422);
    expect(slecht.b.error.message).toMatch(/naam/);
    await maak({ sku: "S1" });
    expect((await maak({ sku: "s1", naam: "Anders" })).res.status).toBe(409);
  });
  it("een andere organisatie ziet de artikelen niet", async () => {
    const { b } = await maak();
    m.tenant = "t2";
    expect((await lees(await route.GET(json("GET", "/api/werkgever/voorraad")))).artikelen).toEqual([]);
    const res = await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id: b.artikel.id, actie: "mutatie", reden: "inkoop", hoeveelheid: 1 }));
    expect(res.status).toBe(404);
  });
});

describe("PATCH", () => {
  it("mutatie en telling geven het bijgewerkte artikel en de logregel terug", async () => {
    const { b } = await maak();
    const id = b.artikel.id as string;
    const r1 = await lees(await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id, actie: "mutatie", reden: "verkoop", hoeveelheid: 2, opmerking: "Klus" })));
    expect(r1.artikel.aantal).toBe(3);
    expect(r1.mutatie).toMatchObject({ verschil: -2, door: "u1", opmerking: "Klus" });
    const r2 = await lees(await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id, actie: "mutatie", reden: "telling", hoeveelheid: 8 })));
    expect(r2.artikel.aantal).toBe(8);
    expect(m.audit).toHaveBeenCalledTimes(1);
    const auditRegel = JSON.stringify(m.audit.mock.calls[0]);
    expect(auditRegel).toContain("voorraad.telling");
    expect(auditRegel).not.toContain("Schroeven");
    const geschiedenis = await lees(await route.GET(json("GET", `/api/werkgever/voorraad?artikel=${id}`)));
    expect(geschiedenis.mutaties).toHaveLength(2);
  });
  it("een mutatie onder nul geeft 422", async () => {
    const { b } = await maak({ aantal: 1 });
    expect((await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id: b.artikel.id, actie: "mutatie", reden: "gebruikt", hoeveelheid: 5 }))).status).toBe(422);
  });
  it("bewerken, archiveren en terughalen", async () => {
    const { b } = await maak();
    const id = b.artikel.id as string;
    const bew = await lees(await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id, actie: "bewerken", naam: "Schroeven nieuw", eenheid: "doos", minimum: 3 })));
    expect(bew.artikel).toMatchObject({ naam: "Schroeven nieuw", minimum: 3, aantal: 5 });
    expect((await lees(await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id, actie: "archiveren" })))).artikel.gearchiveerd).toBe(true);
    expect((await lees(await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id, actie: "terughalen" })))).artikel.gearchiveerd).toBe(false);
  });
  it("ongeldige id's en onbekende acties", async () => {
    for (const id of ["constructor", "../etc", 5, null, undefined]) {
      expect((await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id, actie: "archiveren" }))).status).toBe(404);
    }
    const { b } = await maak();
    expect((await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id: b.artikel.id, actie: "constructor" }))).status).toBe(422);
    expect((await route.GET(json("GET", "/api/werkgever/voorraad?artikel=constructor"))).status).toBe(404);
  });
  it("een kapotte body geeft een Nederlandse fout", async () => {
    const res = await route.PATCH(new Request(url("/api/werkgever/voorraad"), { method: "PATCH", body: "{kapot" }));
    expect(res.status).toBe(422);
  });
});

describe("DELETE", () => {
  it("wist een artikel zonder mutaties; met mutaties 409", async () => {
    const { b } = await maak();
    const id = b.artikel.id as string;
    await route.PATCH(json("PATCH", "/api/werkgever/voorraad", { id, actie: "mutatie", reden: "inkoop", hoeveelheid: 1 }));
    expect((await route.DELETE(json("DELETE", `/api/werkgever/voorraad?id=${id}`))).status).toBe(409);
    const schoon = (await maak({ naam: "Pluggen" })).b.artikel.id as string;
    expect((await route.DELETE(json("DELETE", `/api/werkgever/voorraad?id=${schoon}`))).status).toBe(200);
    expect((await route.DELETE(json("DELETE", "/api/werkgever/voorraad?id=nee"))).status).toBe(404);
    expect((await route.DELETE(json("DELETE", "/api/werkgever/voorraad"))).status).toBe(404);
  });
});

describe("export", () => {
  it("geeft een CSV-bijlage met BOM, puntkomma en een datum in de bestandsnaam", async () => {
    await maak({ naam: "=EVIL()", leverancier: "Groothandel", kostprijsCent: 250 });
    const res = await exportRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="voorraad-2026-11-12.csv"');
    // res.text() haalt de BOM zelf weg: kijk dus naar de ruwe bytes (EF BB BF)
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const tekst = await res.text();
    expect(tekst.startsWith("Naam;")).toBe(true);
    expect(tekst).toContain("'=EVIL();;doos;5;2;2,50;12,50;Op voorraad;Groothandel;;");
  });
  it("bevat alleen de artikelen van de eigen organisatie", async () => {
    await maak();
    m.tenant = "t2";
    const tekst = await (await exportRoute.GET()).text();
    expect(tekst.trim().split("\r\n")).toHaveLength(1);
  });
});
