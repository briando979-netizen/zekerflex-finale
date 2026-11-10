import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Principal } from "@/lib/auth";

// De eerste stap van een nieuwe site, rijschool of horecazaak staat al ingevuld
// met wat we van het bedrijf weten: naam, KvK en adres uit de registratie, en
// het eigen e-mailadres en telefoonnummer van wie hem aanmaakt. Ontbreekt iets,
// dan wat het bedrijf al invulde bij zijn rijschool of horecazaak (een ander dashboard).

type Pakket = { kvk: string; adres: string; plaats: string; telefoon: string } | null;
const db = vi.hoisted(() => ({ tenant: null as unknown, phone: null as string | null, rijschool: null as Pakket, horeca: null as Pakket, storing: false }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: async () => db.tenant },
    user: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "u1" ? { phone: db.phone } : null) },
    rijschool: { findUnique: async () => (db.storing ? Promise.reject(new Error("tabel ontbreekt")) : db.rijschool) },
    horecaZaak: { findUnique: async () => db.horeca },
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
  db.rijschool = null;
  db.horeca = null;
  db.storing = false;
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

  it("neemt KvK en adres van het bedrijf zelf als er geen registratie is", async () => {
    db.tenant = { name: "De Korst", kvkNumber: "87654321", companyRegistration: null, branches: [{ addressLine: "Molenweg 3", postalCode: "3512 JK", city: "Utrecht" }] };
    expect(await companyDefaults("t1", p)).toMatchObject({ kvk: "87654321", straat: "Molenweg 3", postcode: "3512 JK", plaats: "Utrecht" });
  });

  it("vult wat ontbreekt aan met de gegevens van de horecazaak", async () => {
    db.tenant = { name: "Eetcafe De Hoek", kvkNumber: null, companyRegistration: null, branches: [] };
    db.horeca = { kvk: "1122 3344", adres: "Kerkstraat 12, 1234ab", plaats: "Zwolle", telefoon: "038 123 45 67" };
    expect(await companyDefaults("t1", p)).toEqual({
      naam: "Eetcafe De Hoek",
      kvk: "11223344",
      straat: "Kerkstraat 12",
      postcode: "1234 AB",
      plaats: "Zwolle",
      telefoon: "038 123 45 67",
      email: "eigenaar@bedrijf.test",
    });
  });

  it("laat staan wat al bekend is: de rijschool vult alleen de lege velden", async () => {
    db.phone = "0612345678";
    db.rijschool = { kvk: "99999999", adres: "Stationsplein 1, 9999 ZZ Assen", plaats: "Assen", telefoon: "0592 000000" };
    expect(await companyDefaults("t1", p)).toMatchObject({ kvk: "12345678", straat: "Dorpsstraat 1a", postcode: "1234 AB", plaats: "Utrecht", telefoon: "0612345678" });
  });

  it("haalt de plaats uit het adres als de rijschool geen aparte plaats heeft", async () => {
    db.tenant = { name: "Rijschool Vlot", kvkNumber: null, companyRegistration: null, branches: [] };
    db.rijschool = { kvk: "", adres: "Stationsplein 1, 9401 AA Assen", plaats: "", telefoon: "" };
    expect(await companyDefaults("t1", p)).toMatchObject({ kvk: "", straat: "Stationsplein 1", postcode: "9401 AA", plaats: "Assen", telefoon: "" });
  });

  it("verzint niets: zonder postcode alleen de straat, en een storing laat de rest staan", async () => {
    db.tenant = { name: "Rijschool Vlot", kvkNumber: null, companyRegistration: null, branches: [] };
    db.horeca = { kvk: "", adres: "Stationsplein 1, Assen", plaats: "", telefoon: "" };
    expect(await companyDefaults("t1", p)).toMatchObject({ straat: "Stationsplein 1", postcode: "", plaats: "" });
    db.storing = true;
    expect(await companyDefaults("t1", p)).toMatchObject({ naam: "Rijschool Vlot", straat: "Stationsplein 1" });
  });
});
