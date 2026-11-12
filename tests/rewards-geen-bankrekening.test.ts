import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/me/rewards opende voor elke werker die de beloningskaart zag een bankrekening met zijn naam (12 nov: 31
// rekeningen, 8 bij gewiste accounts), terwijl ZekerFlex Bank uit staat. Nu alleen de organisatie uit de rechten.

const m = vi.hoisted(() => ({
  principal: null as unknown,
  bankCreate: vi.fn(),
  bankFind: vi.fn(),
  business: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePrincipal: async () => m.principal,
  hasRole: (p: { grants: { role: string }[] }, ...roles: string[]) => p.grants.some((g) => roles.includes(g.role)),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bankAccount: { create: (...a: unknown[]) => m.bankCreate(...a), findUnique: (...a: unknown[]) => m.bankFind(...a), findFirst: (...a: unknown[]) => m.bankFind(...a) },
    tenant: { findUnique: async () => ({ name: "Bedrijf" }) },
  },
}));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zekerflex.test" } }));
vi.mock("@/lib/rewards/levels", () => ({ LEVELS: [], rewardStatus: async () => ({ level: 1 }) }));
vi.mock("@/lib/rewards/referral", () => ({ codeFor: async () => "ABC123", getRewards: async () => ({}), referralStats: async () => ({ invited: 0 }) }));
vi.mock("@/lib/rewards/business", () => ({ BUSINESS_LEVELS: [], businessStatus: async (id: string) => { m.business(id); return { tenantId: id }; } }));

import { GET } from "@/app/api/me/rewards/route";
import { organisatieVanPrincipal } from "@/lib/bank/accounts";

const wie = (role: string, organizationId = "org_1") => ({ userId: "u1", email: "w@zekerflex.test", fullName: "Werker", grants: [{ role, organizationId, locationIds: [] }] });

beforeEach(() => {
  m.bankCreate.mockReset();
  m.bankFind.mockReset();
  m.business.mockReset();
});

describe("organisatieVanPrincipal", () => {
  it("de organisatie voor werkgeversrollen, niets voor werkers en beheer", () => {
    expect(organisatieVanPrincipal(wie("HQ_ADMIN") as never)).toBe("org_1");
    expect(organisatieVanPrincipal(wie("LOCAL_MANAGER", "org_2") as never)).toBe("org_2");
    expect(organisatieVanPrincipal(wie("FREELANCER", "org_platform") as never)).toBeNull();
    expect(organisatieVanPrincipal(wie("PLATFORM_ADMIN") as never)).toBeNull();
  });
});

describe("GET /api/me/rewards", () => {
  it("een werker: geen bankrekening opgezocht of geopend, geen bedrijfsniveau", async () => {
    m.principal = wie("FREELANCER", "org_platform");
    const r = await GET();
    expect(r.status).toBe(200);
    expect(m.bankCreate).not.toHaveBeenCalled();
    expect(m.bankFind).not.toHaveBeenCalled();
    expect(m.business).not.toHaveBeenCalled();
    expect((await r.json()).referral.link).toBe("https://zekerflex.test/r/ABC123");
  });

  it("een werkgever: het bedrijfsniveau van zijn organisatie, ook zonder bankrekening", async () => {
    m.principal = wie("HQ_ADMIN", "org_9");
    const r = await GET();
    expect(r.status).toBe(200);
    expect(m.business).toHaveBeenCalledWith("org_9");
    expect(m.bankCreate).not.toHaveBeenCalled();
  });
});
