import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";

// De eerste stap van een nieuwe site, rijschool of horecazaak staat al ingevuld
// met wat we van het bedrijf weten: naam, KvK en adres uit de registratie, en
// het eigen e-mailadres en telefoonnummer van wie hem aanmaakt.

const db = vi.hoisted(() => ({ tenant: null as unknown, phone: null as string | null }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: async () => db.tenant },
    user: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "u1" ? { phone: db.phone } : null) },
  },
}));
vi.mock("@/lib/billing/comp", () => ({ freeAccess: async () => false }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: [] }) }));
vi.mock("@/lib/website/manage", () => ({ getManagedWebsite: async () => null, isUnlocked: () => false }));

import { companyDefaults } from "@/lib/sites/access";

const p = { userId: "u1", email: "eigenaar@bedrijf.test" } as unknown as Principal;

beforeEach(() => {
  db.tenant = {
    name: "Bakkerij de Korst B.V.",
    kvkNumber: "12345678",
    companyRegistration: { kvkNumber: "12345678", tradeName: "De Korst", street: "Dorpsstraat", houseNumber: "1a", postalCode: "1234 AB", city: "Utrecht" },
    branches: [],
  };
  db.phone = null;
});

describe("companyDefaults", () => {
  it("vult het telefoonnummer van de gebruiker voor", async () => {
    db.phone = "0612345678";
    const d = await companyDefaults("t1", p);
    expect(d).toEqual({
      naam: "De Korst",
      kvk: "12345678",
      straat: "Dorpsstraat 1a",
      postcode: "1234 AB",
      plaats: "Utrecht",
      telefoon: "0612345678",
      email: "eigenaar@bedrijf.test",
    });
  });

  it("laat het telefoonveld leeg als de gebruiker geen nummer heeft", async () => {
    expect((await companyDefaults("t1", p)).telefoon).toBe("");
    expect((await companyDefaults("t1", { ...p, userId: "onbekend" } as Principal)).telefoon).toBe("");
  });
});
