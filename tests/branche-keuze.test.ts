import { beforeEach, describe, expect, it, vi } from "vitest";
import { BRANCHE_OPTIES, brancheSamenvatting, isBranche, maakBrancheKeuze, standaardFilter } from "@/lib/shifts/branche-keuze";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>(), grants: [{ role: "FREELANCER" }] as { role: string }[], loggedIn: true }));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
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

const { POST, GET } = await import("@/app/api/me/branches/route");
const { ERASABLE_KV_PREFIXES } = await import("@/lib/privacy/user-kv");

const verzoek = (body: unknown) => new Request("http://app/api/me/branches", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  m.kv.clear();
  m.grants = [{ role: "FREELANCER" }];
  m.loggedIn = true;
});

describe("branche-keuze (puur)", () => {
  it("biedt alle branches aan behalve Overig", () => {
    const keys = BRANCHE_OPTIES.map((o) => o.key);
    expect(keys).not.toContain("algemeen");
    expect(keys).toContain("horeca");
    expect(keys).toHaveLength(14);
  });

  it("neemt een of meer branches aan, in de volgorde van de lijst, zonder dubbele of onbekende", () => {
    expect(maakBrancheKeuze({ branches: ["retail", "horeca", "horeca", "piraat"] })).toEqual({ alle: false, branches: ["retail", "horeca"] });
    expect(isBranche("horeca")).toBe(true);
    expect(isBranche("algemeen")).toBe(false);
  });

  it("telt 'alle' en 'alles aangevinkt' allebei als alle branches", () => {
    expect(maakBrancheKeuze({ alle: true })).toEqual({ alle: true, branches: [] });
    expect(maakBrancheKeuze({ branches: BRANCHE_OPTIES.map((o) => o.key) })).toEqual({ alle: true, branches: [] });
  });

  it("geeft niets terug als er niets gekozen is", () => {
    expect(maakBrancheKeuze({})).toBeNull();
    expect(maakBrancheKeuze({ branches: ["piraat"] })).toBeNull();
    expect(maakBrancheKeuze({ alle: false, branches: [] })).toBeNull();
  });

  it("filtert de klussenlijst alleen bij gekozen branches, niet bij alle", () => {
    expect(standaardFilter({ alle: false, branches: ["horeca"] })).toEqual(["horeca"]);
    expect(standaardFilter({ alle: true, branches: [] })).toEqual([]);
    expect(standaardFilter(null)).toEqual([]);
  });

  it("maakt een korte samenvatting", () => {
    const t = (k: Parameters<typeof brancheSamenvatting>[0]) => brancheSamenvatting(k, "Alle branches", "en", "{n} andere");
    expect(t({ alle: true, branches: [] })).toBe("Alle branches");
    expect(t({ alle: false, branches: ["horeca"] })).toBe("Horeca");
    expect(t({ alle: false, branches: ["retail", "horeca"] })).toBe("Retail en Horeca");
    expect(t({ alle: false, branches: ["retail", "horeca", "logistiek", "bouw"] })).toBe("Retail, Horeca en 2 andere");
    expect(t(null)).toBe("");
  });
});

describe("/api/me/branches", () => {
  it("bewaart de keuze en geeft hem terug", async () => {
    const res = await POST(verzoek({ branches: ["horeca", "retail"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keuze: { alle: false, branches: ["retail", "horeca"] } });
    const terug = await GET();
    expect(await terug.json()).toEqual({ keuze: { alle: false, branches: ["retail", "horeca"] } });
  });

  it("bewaart 'alle branches'", async () => {
    const res = await POST(verzoek({ alle: true }));
    expect(await res.json()).toEqual({ keuze: { alle: true, branches: [] } });
  });

  it("weigert een lege keuze in gewoon Nederlands en bewaart niets", async () => {
    const res = await POST(verzoek({ branches: ["piraat"] }));
    expect(res.status).toBe(422);
    expect(JSON.stringify(await res.json())).toMatch(/minstens één branche/);
    expect(m.kv.size).toBe(0);
  });

  it("is alleen voor werkers en vraagt een sessie", async () => {
    m.grants = [{ role: "HQ_ADMIN" }];
    expect((await POST(verzoek({ alle: true }))).status).toBe(403);
    m.loggedIn = false;
    expect((await POST(verzoek({ alle: true }))).status).toBe(401);
    expect(m.kv.size).toBe(0);
  });

  it("valt onder het wissen van gegevens (AVG)", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("werker-branches:");
  });
});
