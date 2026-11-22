import { beforeEach, describe, expect, it, vi } from "vitest";

// G1 (22 nov 2026, privé-accounts van de eigenaar): zoeken naar mensen. Een echte werkgever vindt een eigen-test-werker niet,
// en een eigen-testbedrijf vindt de demo-werkers én de eigen-test-werkers (lib/admin/eigen-test-regel.ts).

const h = vi.hoisted(() => ({
  et: { tenants: {} as Record<string, string>, users: {} as Record<string, string> },
  principal: { userId: "u_ik", grants: [{ role: "HQ_ADMIN" }], memberships: [{ tenantId: "t_ik" }] } as unknown,
  wheres: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => h.principal }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => h.et }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: async (a: { where: Record<string, unknown> }) => {
        h.wheres.push(a.where);
        return [];
      },
    },
  },
}));
vi.mock("@/lib/messaging/store", () => ({ listThreadsForUser: async () => [] }));
vi.mock("@/lib/messaging/contacts", () => ({ userDirectory: async () => new Map() }));
vi.mock("@/lib/profile/store", () => ({ getUserAvatars: async () => ({}) }));

import { GET } from "@/app/api/people/search/route";

const sinds = "2026-11-13T12:00:00.000Z";
const gemarkeerd = { tenants: { t_prive: sinds }, users: { u_werker: sinds } };
const zoek = () => GET(new Request("http://zf.test/api/people/search"));
/** De vraag die de werkgever aan de database stelde. */
const eersteVraag = (): Record<string, unknown> => h.wheres[0] ?? {};

beforeEach(() => {
  h.et = { tenants: {}, users: {} };
  h.principal = { userId: "u_ik", grants: [{ role: "HQ_ADMIN" }], memberships: [{ tenantId: "t_ik" }] };
  h.wheres = [];
});

describe("zoeken naar werkers", () => {
  it("zonder markeringen vraagt een werkgever precies wat hij altijd vroeg", async () => {
    await zoek();
    expect(eersteVraag()).toEqual({ freelancerProfile: { isNot: null }, disabledAt: null });
  });

  it("een echte werkgever vindt geen eigen-test-werker, ook niet de leden van een eigen-testbedrijf", async () => {
    h.et = gemarkeerd;
    await zoek();
    const w = eersteVraag();
    expect(w.freelancerProfile).toEqual({ isNot: null });
    expect(w.AND).toEqual([
      { NOT: { OR: [{ id: { in: ["u_werker"] } }, { memberships: { some: { tenantId: { in: ["t_prive"] } } } }] } },
    ]);
    expect(w.OR).toBeUndefined();
  });

  it("een eigen-testbedrijf vindt de demo-werkers én de eigen-test-werkers, geen echte", async () => {
    h.et = gemarkeerd;
    h.principal = { userId: "u_ik", grants: [{ role: "HQ_ADMIN" }], memberships: [{ tenantId: "t_prive" }] };
    await zoek();
    const w = eersteVraag();
    expect(w.freelancerProfile).toBeUndefined();
    expect(w.AND).toBeUndefined();
    expect(w.OR).toEqual([
      { freelancerProfile: { id: { startsWith: "demo_fp_" } } },
      {
        freelancerProfile: { isNot: null },
        OR: [{ id: { in: ["u_werker"] } }, { memberships: { some: { tenantId: { in: ["t_prive"] } } } }],
      },
    ]);
  });

  it("een werkgever die zelf als eigen test staat, vindt ook alleen demo en eigen test", async () => {
    h.et = { tenants: {}, users: { u_ik: sinds, u_werker: sinds } };
    await zoek();
    const w = eersteVraag();
    expect(w.OR).toEqual([
      { freelancerProfile: { id: { startsWith: "demo_fp_" } } },
      { freelancerProfile: { isNot: null }, OR: [{ id: { in: ["u_ik", "u_werker"] } }] },
    ]);
  });
});
