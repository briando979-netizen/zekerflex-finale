import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

// De routes van "Introduceer een bedrijf" (lib/introducties): alleen ingelogd, gecontroleerde invoer, begrensd per dag, en
// het beheer alleen voor PLATFORM_ADMIN. De opslag zelf staat in tests/introductie-opslag.test.ts.

const m = vi.hoisted(() => ({
  principal: { userId: "usr_werker", email: "werker@zekerflex.test", fullName: "Wendy Werker" } as Record<string, unknown>,
  rate: vi.fn(async () => ({ ok: true })),
  dien: vi.fn(async () => ({ uitkomst: "nieuw", introducties: [] })),
  mijn: vi.fn(async () => [{ id: "i1", at: "2026-11-17T09:00:00.000Z", bedrijf: "Bakkerij De Korf", contactNaam: "Piet", status: "ingediend" }]),
  alle: vi.fn(async () => []),
  koppel: vi.fn(async () => ({ tenantId: "t1" })),
  zoek: vi.fn(async () => [{ id: "t1", naam: "Bakkerij De Korf B.V.", sinds: "2026-11-17T09:00:00.000Z" }]),
}));

vi.mock("@/lib/auth/handlers", async () => {
  const { toErrorBody } = await import("@/lib/errors");
  type H = (req: Request, ctx: { params: Record<string, string>; principal: Record<string, unknown> }) => Promise<Response>;
  const wrap = (handler: H) => async (req: Request) => {
    try {
      return await handler(req, { params: {}, principal: m.principal });
    } catch (e) {
      const { status, body } = toErrorBody(e, { logged: true });
      return Response.json(body, { status });
    }
  };
  return { withAuth: wrap, withAdminAccess: (_roles: string[], handler: H) => wrap(handler) };
});
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => m.rate(...(a as [])) }));
vi.mock("@/lib/introducties/opslag", () => ({
  dienIntroductieIn: (...a: unknown[]) => m.dien(...(a as [])),
  mijnIntroducties: (...a: unknown[]) => m.mijn(...(a as [])),
  alleIntroducties: (...a: unknown[]) => m.alle(...(a as [])),
  koppelIntroductie: (...a: unknown[]) => m.koppel(...(a as [])),
  zoekBedrijven: (...a: unknown[]) => m.zoek(...(a as [])),
}));

const me = await import("@/app/api/me/introducties/route");
const beheer = await import("@/app/api/admin/sales/introducties/route");

type Handler = (r: Request) => Promise<Response>;
const post = (route: unknown, body: unknown) => (route as Handler)(new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) }));
const get = (route: unknown, url = "http://localhost/x") => (route as Handler)(new Request(url));

const GOED = { rol: "werker", contactNaam: " Piet de Vries ", bedrijf: "Bakkerij De Korf", email: " Piet@DeKorf.NL ", telefoon: "06 12345678", toestemming: true };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/me/introducties", () => {
  it("geldig: 201, genormaliseerd doorgegeven met de gebruiker uit de sessie, en begrensd per gebruiker per dag", async () => {
    const res = await post(me.POST, GOED);
    expect(res.status).toBe(201);
    expect(m.dien).toHaveBeenCalledWith({
      contactNaam: "Piet de Vries",
      bedrijf: "Bakkerij De Korf",
      email: "piet@dekorf.nl",
      telefoon: "+31612345678",
      userId: "usr_werker",
      eigenEmail: "werker@zekerflex.test",
      rol: "werker",
    });
    expect(m.rate).toHaveBeenCalledWith(expect.objectContaining({ name: "introductie", identifier: "usr_werker", limit: 10, windowSeconds: 86_400 }));
  });

  it("zonder vinkje, zonder contact of met een fout adres: 422 met het veld, en niets opgeslagen of geteld", async () => {
    for (const [body, veld] of [
      [{ ...GOED, toestemming: false }, "toestemming"],
      [{ ...GOED, email: "", telefoon: "" }, "contact"],
      [{ ...GOED, contactNaam: "" }, "contactNaam"],
      [{ ...GOED, email: "piet@" }, "email"],
      [{ ...GOED, telefoon: "12" }, "telefoon"],
    ] as const) {
      const res = await post(me.POST, body);
      expect(res.status, veld).toBe(422);
      expect((await res.json()).error.details.veld, veld).toBe(veld);
    }
    expect(m.dien).not.toHaveBeenCalled();
    expect(m.rate).not.toHaveBeenCalled();
  });

  it("een kapotte body (geen rol, te lang, geen JSON) is 422", async () => {
    for (const body of [{ ...GOED, rol: "beheerder" }, { ...GOED, bedrijf: "x".repeat(400) }, "geen json"]) {
      const res = await post(me.POST, body);
      expect(res.status).toBe(422);
    }
    expect(m.dien).not.toHaveBeenCalled();
  });

  it("te vaak: 429 en niets opgeslagen", async () => {
    const { AppError } = await import("@/lib/errors");
    m.rate.mockRejectedValueOnce(AppError.rateLimited("te vaak", 3600, 10));
    const res = await post(me.POST, GOED);
    expect(res.status).toBe(429);
    expect(m.dien).not.toHaveBeenCalled();
  });
});

describe("GET /api/me/introducties", () => {
  it("alleen de eigen lijst", async () => {
    const res = await get(me.GET);
    expect(res.status).toBe(200);
    expect(m.mijn).toHaveBeenCalledWith("usr_werker");
    expect((await res.json()).introducties[0].status).toBe("ingediend");
  });
});

describe("Beheer → Sales → Introducties", () => {
  it("GET: de lijst, of bedrijven zoeken", async () => {
    await get(beheer.GET);
    expect(m.alle).toHaveBeenCalledTimes(1);
    const res = await get(beheer.GET, "http://localhost/x?zoek=De%20Korf");
    expect(m.zoek).toHaveBeenCalledWith("De Korf");
    expect((await res.json()).bedrijven[0].naam).toBe("Bakkerij De Korf B.V.");
  });

  it("POST koppel: met de beheerder als actor; een andere actie of een lege id is 422", async () => {
    m.principal = { userId: "usr_admin", email: "admin@zekerflex.test", fullName: "Beheer" };
    const res = await post(beheer.POST, { actie: "koppel", leadId: "lead1", tenantId: "t1" });
    expect(res.status).toBe(200);
    expect(m.koppel).toHaveBeenCalledWith({ leadId: "lead1", tenantId: "t1", actorUserId: "usr_admin" });
    for (const body of [{ actie: "wis", leadId: "lead1", tenantId: "t1" }, { actie: "koppel", leadId: "", tenantId: "t1" }]) {
      expect((await post(beheer.POST, body)).status).toBe(422);
    }
    expect(m.koppel).toHaveBeenCalledTimes(1);
  });
});

describe("toegang", () => {
  const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

  it("geen van beide routes is openbaar; het beheer is strikt PLATFORM_ADMIN", () => {
    expect(isPublicApiRoute("/api/me/introducties")).toBe(false);
    expect(isPublicApiRoute("/api/admin/sales/introducties")).toBe(false);
    expect(bron("app/api/me/introducties/route.ts")).toMatch(/export const (GET|POST) = withAuth\(/);
    const admin = bron("app/api/admin/sales/introducties/route.ts");
    expect(admin.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g)).toHaveLength(2);
  });
});
