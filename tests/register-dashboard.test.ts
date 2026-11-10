import { beforeEach, describe, expect, it, vi } from "vitest";
import { WERKRUIMTES } from "@/lib/werkgever/werkruimte";
import { AANMELDEN_PER_DASHBOARD, aanmeldAdres, dashboardUitParam } from "@/lib/auth/aanmelden-dashboard";
import { AANBOD } from "@/lib/marketing/aanbod";

// Aanmelden voor één dashboard: /register?type=bedrijf&dashboard=<soort> (lib/auth/aanmelden-dashboard.ts).

const m = vi.hoisted(() => ({
  tenantCreate: vi.fn(),
  userCreate: vi.fn(),
  voegDashboardToe: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ tenant: { create: m.tenantCreate, findFirst: async () => null }, user: { create: m.userCreate } }),
  },
}));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/fiscal/store", () => ({ setFiscal: async () => undefined }));
vi.mock("@/lib/analytics/funnel", () => ({ recordFunnel: async () => undefined }));
vi.mock("@/lib/werkgever/werkruimte-server", () => ({ voegDashboardToe: m.voegDashboardToe }));

const { registerAccount, registerSchema } = await import("@/lib/auth/register");

const bedrijf = {
  type: "bedrijf" as const,
  fullName: "Jan Jansen",
  email: "jan@winkel.test",
  password: "een-sterk-wachtwoord-1",
  companyName: "Winkel van Jan",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.tenantCreate.mockResolvedValue({ id: "t1" });
  m.userCreate.mockResolvedValue({ id: "u1" });
  m.voegDashboardToe.mockResolvedValue(undefined);
  m.recordAudit.mockResolvedValue(undefined);
});

describe("registerSchema: dashboard", () => {
  it("neemt elk dashboard aan", () => {
    for (const dashboard of WERKRUIMTES) expect(registerSchema.safeParse({ ...bedrijf, dashboard }).success, dashboard).toBe(true);
  });

  it("weigert een onbekend dashboard, met een Nederlandse melding", () => {
    const r = registerSchema.safeParse({ ...bedrijf, dashboard: "kapper" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Kies waarvoor je ZekerFlex gebruikt.");
  });

  it("zonder dashboard blijft het geldig", () => {
    expect(registerSchema.safeParse(bedrijf).success).toBe(true);
  });
});

describe("registerAccount: het gekozen dashboard", () => {
  it("bewaart het gekozen dashboard bij het nieuwe bedrijf", async () => {
    await registerAccount(registerSchema.parse({ ...bedrijf, dashboard: "webshop" }));
    expect(m.voegDashboardToe).toHaveBeenCalledWith("t1", "webshop");
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { type: "bedrijf", dashboard: "webshop" } }));
  });

  it("zonder keuze is het dashboard personeel", async () => {
    await registerAccount(registerSchema.parse(bedrijf));
    expect(m.voegDashboardToe).toHaveBeenCalledWith("t1", "personeel");
  });

  it("een storing bij het bewaren laat het aanmelden niet mislukken", async () => {
    m.voegDashboardToe.mockRejectedValue(new Error("kv weg"));
    await expect(registerAccount(registerSchema.parse({ ...bedrijf, dashboard: "rijschool" }))).resolves.toEqual({
      userId: "u1",
      type: "bedrijf",
      email: "jan@winkel.test",
    });
    expect(m.voegDashboardToe).toHaveBeenCalledWith("t1", "rijschool");
  });

  it("een werker krijgt geen dashboard, ook niet als er een meekomt", async () => {
    await registerAccount(registerSchema.parse({ ...bedrijf, type: "freelancer", dashboard: "horeca" }));
    expect(m.voegDashboardToe).not.toHaveBeenCalled();
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { type: "freelancer" } }));
  });
});

describe("teksten per dashboard (lib/auth/aanmelden-dashboard.ts)", () => {
  it("elk dashboard heeft een titel en een uitleg", () => {
    for (const w of WERKRUIMTES) {
      const tekst = AANMELDEN_PER_DASHBOARD[w];
      expect(tekst.titel.trim().length, w).toBeGreaterThan(3);
      expect(tekst.titel.length, w).toBeLessThanOrEqual(40);
      expect(tekst.uitleg.trim().length, w).toBeGreaterThan(20);
      expect(tekst.uitleg.length, w).toBeLessThanOrEqual(160);
    }
  });

  it("alleen een bekend dashboard telt uit de adresbalk", () => {
    expect(dashboardUitParam("webshop")).toBe("webshop");
    expect(dashboardUitParam("kapper")).toBeUndefined();
    expect(dashboardUitParam("constructor")).toBeUndefined();
    expect(dashboardUitParam(undefined)).toBeUndefined();
    expect(dashboardUitParam(["webshop"])).toBeUndefined();
  });

  it("de productpagina's melden je aan voor hun eigen dashboard", () => {
    for (const soort of ["website", "webshop", "horeca", "rijschool"] as const) {
      const item = AANBOD.find((a) => a.slug === soort);
      expect(item?.start.href, soort).toBe(aanmeldAdres(soort));
      const params = new URL(item?.start.href ?? "/", "https://zekerflex.test").searchParams;
      expect(params.get("type")).toBe("bedrijf");
      expect(dashboardUitParam(params.get("dashboard"))).toBe(soort);
    }
  });
});
