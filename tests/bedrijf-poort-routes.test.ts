import { beforeEach, describe, expect, it, vi } from "vitest";

// De server-kant van de poort (23 nov 2026): een bedrijf dat nog niet is gecontroleerd mag klussen plaatsen, maar niemand inplannen.
// De roosterplanner en de spoedoproep nodigen werkers uit voor een plek: die geven een 423 met de code BEDRIJF_NOG_NIET_GECONTROLEERD
// (geen 403: CrowdSec telt een reeks 403's als inbraakpoging). Hier met de echte poort (lib/company/verified.ts) en een nep-database.

const m = vi.hoisted(() => ({
  tenant: { type: "ENTERPRISE_HQ", companyRegistration: null as null | { isActive: boolean; insolvent: boolean } },
  kv: new Map<string, unknown>(),
  verstuur: vi.fn(async () => ({ aanbiedingen: 2, diensten: 1, overgeslagen: [] as string[] })),
  start: vi.fn(async () => ({ nieuw: 3, mislukt: 0 })),
  overzicht: vi.fn(async () => ({ actief: true })),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: async () => m.tenant },
    shiftAssignment: { count: async () => 0 },
    shift: { findFirst: async () => ({ branch: { tenantId: "t1" } }) },
  },
}));
vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => ({ userId: "u1", grants: [] }),
  requireRole: () => undefined,
}));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t1"], branchIds: null }) }));
vi.mock("@/lib/planner/plan", () => ({ verstuurVoorstel: (...a: unknown[]) => (m.verstuur as (...x: unknown[]) => Promise<unknown>)(...a) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => ({}) }));
vi.mock("@/lib/spoed/oproep", () => ({
  startSpoedoproep: (...a: unknown[]) => (m.start as (...x: unknown[]) => Promise<unknown>)(...a),
  spoedOverzicht: (...a: unknown[]) => (m.overzicht as (...x: unknown[]) => Promise<unknown>)(...a),
  stopSpoedoproep: async () => undefined,
}));

const planner = await import("@/app/api/werkgever/planner/verstuur/route");
const spoed = await import("@/app/api/werkgever/spoed/route");
const { setTenantApproval } = await import("@/lib/company/verified");

const post = (route: { POST: (r: Request) => Promise<Response> }, body: unknown) =>
  route.POST(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  m.tenant = { type: "ENTERPRISE_HQ", companyRegistration: null };
  m.kv.clear();
});

describe("roosterplanner: aanbiedingen aan werkers", () => {
  it("een bedrijf dat nog niet is gecontroleerd krijgt een 423 met een eigen code en er gaat niets naar werkers", async () => {
    const res = await post(planner, { week: "2026-W48" });
    expect(res.status).toBe(423);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("BEDRIJF_NOG_NIET_GECONTROLEERD");
    expect(body.error.message).toContain("Je klus staat live");
    expect(m.verstuur).not.toHaveBeenCalled();
  });

  it("een gecontroleerd bedrijf komt langs de poort (hier stopt het bij de onbekende week, niet bij de poort)", async () => {
    await setTenantApproval("t1", true, "beheer@zekerflex.nl");
    const res = await post(planner, { week: "geen-week" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  });
});

describe("spoedoproep: werkers uitnodigen voor een plek", () => {
  const verzoek = { shiftId: "s1", radiusKm: 25, kanalen: ["push"] };

  it("een bedrijf dat nog niet is gecontroleerd krijgt een 423 en er gaat geen oproep, sms of WhatsApp uit", async () => {
    const res = await post(spoed, verzoek);
    expect(res.status).toBe(423);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("BEDRIJF_NOG_NIET_GECONTROLEERD");
    expect(m.start).not.toHaveBeenCalled();
  });

  it("een gecontroleerd bedrijf mag een oproep versturen", async () => {
    await setTenantApproval("t1", true, "beheer@zekerflex.nl");
    const res = await post(spoed, verzoek);
    expect(res.status).toBe(200);
    expect(m.start).toHaveBeenCalledTimes(1);
  });
});
