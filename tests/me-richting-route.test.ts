import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  fiscal: { workerKind: null as null | "zzp" | "flexwerker" | "uitzendkracht" },
  setFiscal: vi.fn(),
  grants: [{ role: "FREELANCER" }] as { role: string }[],
  loggedIn: true,
  kyc: "NOT_STARTED" as string,
}));

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => ({ kycStatus: m.kyc }) } } }));

vi.mock("@/lib/auth", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requirePrincipal: async () => {
      if (!m.loggedIn) throw AppError.unauthenticated();
      return { userId: "u1", grants: m.grants };
    },
    requireRole: (p: { grants: { role: string }[] }, ...roles: string[]) => {
      if (!p.grants.some((g) => roles.includes(g.role))) throw AppError.forbidden("Geen recht.");
    },
  };
});
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => ({ ...m.fiscal }),
  setFiscal: m.setFiscal,
}));

const { POST } = await import("@/app/api/me/richting/route");

const verzoek = (body: unknown) => new Request("http://app/api/me/richting", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  m.fiscal = { workerKind: null };
  m.grants = [{ role: "FREELANCER" }];
  m.loggedIn = true;
  m.kyc = "NOT_STARTED";
  m.setFiscal.mockImplementation(async (_id: string, patch: { workerKind: "zzp" | "flexwerker" | "uitzendkracht" }) => ({ workerKind: patch.workerKind }));
});

describe("POST /api/me/richting", () => {
  it("bewaart de gekozen richting als er nog geen is, en alleen de richting", async () => {
    const res = await POST(verzoek({ workerKind: "uitzendkracht" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workerKind: "uitzendkracht" });
    expect(m.setFiscal).toHaveBeenCalledWith("u1", { workerKind: "uitzendkracht" });
  });

  it("is herhaalbaar: dezelfde keuze nog eens doet niets en geeft 200", async () => {
    m.fiscal = { workerKind: "zzp" };
    const res = await POST(verzoek({ workerKind: "zzp" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workerKind: "zzp" });
    expect(m.setFiscal).not.toHaveBeenCalled();
  });

  it("laat een eerdere keuze wijzigen zolang er nog niets is ingediend", async () => {
    m.fiscal = { workerKind: "zzp" };
    m.kyc = "NOT_STARTED";
    const res = await POST(verzoek({ workerKind: "uitzendkracht" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workerKind: "uitzendkracht" });
    expect(m.setFiscal).toHaveBeenCalledWith("u1", { workerKind: "uitzendkracht" });
  });

  it("zet de richting vast zodra de identiteitscontrole is gestart: 409 met uitleg", async () => {
    m.fiscal = { workerKind: "zzp" };
    for (const kyc of ["PENDING", "VERIFIED", "REJECTED"]) {
      m.kyc = kyc;
      const res = await POST(verzoek({ workerKind: "uitzendkracht" }));
      expect(res.status, kyc).toBe(409);
      expect(JSON.stringify(await res.json())).toMatch(/Fiscaal/);
    }
    expect(m.setFiscal).not.toHaveBeenCalled();
  });

  it("weigert een onbekende richting met een Nederlandse melding", async () => {
    const res = await POST(verzoek({ workerKind: "piraat" }));
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toMatch(/Kies een van de drie richtingen/);
  });

  it("is alleen voor werkers en vraagt een sessie", async () => {
    m.grants = [{ role: "HQ_ADMIN" }];
    expect((await POST(verzoek({ workerKind: "zzp" }))).status).toBe(403);
    m.loggedIn = false;
    expect((await POST(verzoek({ workerKind: "zzp" }))).status).toBe(401);
    expect(m.setFiscal).not.toHaveBeenCalled();
  });
});
