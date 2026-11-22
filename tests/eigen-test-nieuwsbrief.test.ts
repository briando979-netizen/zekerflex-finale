import { beforeEach, describe, expect, it, vi } from "vitest";

// G12 (22 nov 2026, privé-accounts van de eigenaar): de nieuwsbriefdoelgroep (gebruikers, werkers, werkgevers) bevat geen
// eigen-test-accounts (lib/admin/eigen-test-regel.ts). Zonder markeringen vraagt hij precies wat hij altijd vroeg.

const h = vi.hoisted(() => ({
  et: { tenants: {} as Record<string, string>, users: {} as Record<string, string> },
  wheres: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "x".repeat(40), APP_BASE_URL: "https://www.zekerflex.com" } }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => h.et }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvListValues: async () => [] }));
vi.mock("@/lib/newsletter/store", () => ({ listSubscribers: async () => [] }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: async (a: { where: Record<string, unknown> }) => {
        h.wheres.push(a.where);
        return [{ email: "Jan@Mail.nl" }];
      },
    },
  },
}));

import { resolveAudience } from "@/lib/newsletter/audience";

const sinds = "2026-11-13T12:00:00.000Z";
const eersteVraag = (): Record<string, unknown> => h.wheres[0] ?? {};

beforeEach(() => {
  h.et = { tenants: {}, users: {} };
  h.wheres = [];
});

describe("de nieuwsbriefdoelgroep", () => {
  it("zonder markeringen vraagt hij precies wat hij altijd vroeg", async () => {
    const ontvangers = await resolveAudience("freelancers");
    expect(ontvangers.map((o) => o.email)).toEqual(["jan@mail.nl"]);
    expect(eersteVraag()).toEqual({
      disabledAt: null,
      emailVerifiedAt: { not: null },
      memberships: { some: { role: { in: ["FREELANCER"] } } },
    });
  });

  it("laat de eigen-test-accounts en de leden van een eigen-testbedrijf weg", async () => {
    h.et = { tenants: { t_prive: sinds }, users: { u_werker: sinds } };
    await resolveAudience("freelancers");
    expect(eersteVraag().AND).toEqual([
      { NOT: { OR: [{ id: { in: ["u_werker"] } }, { memberships: { some: { tenantId: { in: ["t_prive"] } } } }] } },
    ]);
    h.wheres = [];
    await resolveAudience("employers");
    expect(eersteVraag().AND).toBeDefined();
  });
});
