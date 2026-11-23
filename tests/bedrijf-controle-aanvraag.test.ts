import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

// "Nog een paar laatste checks" (23 nov 2026): een nieuw bedrijf plaatst en ziet reacties zonder controle; kiest het een
// freelancer, dan vult het zijn bedrijfsgegevens in. De selectie wordt bewaard, de reacties blijven openstaan, Beheer krijgt
// de aanvraag en het bedrijf bericht zodra het is goedgekeurd. De regels van de poort zelf blijven in lib/company/verified.ts.

const m = vi.hoisted(() => ({
  verified: false,
  koppel: vi.fn(),
  notify: vi.fn(async () => 0),
  alert: vi.fn(),
  audit: vi.fn(async () => undefined),
  extra: {} as Record<string, unknown>,
  saved: [] as Record<string, unknown>[],
  eigenKlussen: ["s1", "s2"] as string[],
  reacties: [] as { id: string; shiftId: string; status: string }[],
  kv: [] as { key: string; value: unknown }[],
  tenants: [] as { id: string; name: string }[],
  verifiedPer: {} as Record<string, boolean>,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((id) => m.eigenKlussen.includes(id)).map((id) => ({ id })) },
    tenant: { findMany: async () => m.tenants },
  },
}));
vi.mock("@/lib/offers/store", () => ({ listCounterOffers: async () => m.reacties }));
vi.mock("@/lib/profile/store", () => ({
  getOrgProfileExtra: async () => m.extra,
  saveOrgProfileExtra: async (_id: string, patch: Record<string, unknown>) => void m.saved.push(patch),
}));
vi.mock("@/lib/storage/kv", () => ({ kvListEntries: async () => m.kv }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => (m.audit as (...x: unknown[]) => Promise<void>)(...a) }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: (...a: unknown[]) => m.alert(...a) }));
vi.mock("@/lib/company/verified", () => ({
  isTenantVerified: async (id: string) => (id in m.verifiedPer ? m.verifiedPer[id] : m.verified),
  notifyPendingReactions: (...a: unknown[]) => (m.notify as (...x: unknown[]) => Promise<number>)(...a),
}));
vi.mock("@/lib/onboarding/employer", () => ({
  employerKvkSchema: { parse: (v: unknown) => v },
  koppelBedrijfsgegevens: (...a: unknown[]) => m.koppel(...a),
}));

import { openBedrijfAanvragen, vraagControleAan } from "@/lib/company/controle-aanvraag";

const VELDEN = {
  land: "NL",
  kvkNumber: "12345678",
  bedrijfsnaam: "Bakkerij Jansen B.V.",
  contactNaam: "Sanne Jansen",
  contactFunctie: "Eigenaar",
  telefoon: "0612345678",
  tekentZelf: true,
};
const NU = new Date("2026-11-23T10:00:00+01:00");
const aanroep = (over: Partial<Parameters<typeof vraagControleAan>[0]> = {}) =>
  vraagControleAan({ userId: "u1", tenantId: "t1", raw: VELDEN, keuzes: [{ offerId: "o1", shiftId: "s1" }], nu: NU, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.verified = false;
  m.extra = {};
  m.saved.length = 0;
  m.eigenKlussen = ["s1", "s2"];
  m.reacties = [
    { id: "o1", shiftId: "s1", status: "pending" },
    { id: "o2", shiftId: "s2", status: "pending" },
    { id: "o3", shiftId: "s1", status: "declined" },
    { id: "ovreemd", shiftId: "sx", status: "pending" },
  ];
  m.kv = [];
  m.tenants = [];
  m.verifiedPer = {};
  m.koppel.mockResolvedValue({ kvkValid: true, inControle: true, companyName: "Bakkerij Jansen B.V.", reasons: [], buitenlands: false, zelfControle: false });
});

describe("vraagControleAan", () => {
  it("een niet ingevulde aanvraag wordt niet bewaard en koppelt niets", async () => {
    const fout = await aanroep({ raw: { ...VELDEN, telefoon: "", contactNaam: "" } }).then(() => null, (e: unknown) => e as AppError);
    expect(fout).toMatchObject({ status: 422, details: { fouten: { telefoon: "leeg", contactNaam: "leeg" } } });
    expect(m.koppel).not.toHaveBeenCalled();
    expect(m.saved).toEqual([]);
  });

  it("een KVK-nummer dat niet bestaat of al van een ander is: de reden terug, niets bewaard", async () => {
    m.koppel.mockResolvedValue({ kvkValid: false, inControle: false, companyName: null, reasons: ["Dit KVK-nummer staat niet in het Handelsregister."], buitenlands: false, zelfControle: false });
    const fout = await aanroep().then(() => null, (e: unknown) => e as AppError);
    expect(fout).toMatchObject({ status: 422, message: "Dit KVK-nummer staat niet in het Handelsregister.", details: { fouten: { kvkNumber: "ongeldig" } } });
    expect(m.saved).toEqual([]);
    expect(m.alert).not.toHaveBeenCalled();
  });

  it("de KVK-dienst kon nu niet (tegoed op): wel bewaard, ZekerFlex controleert zelf", async () => {
    m.koppel.mockResolvedValue({ kvkValid: false, inControle: false, companyName: null, reasons: ["We controleren je KVK-nummer zelf"], buitenlands: false, zelfControle: true });
    const uit = await aanroep();
    expect(uit).toEqual({ status: "aangevraagd", keuzes: 1 });
    expect(m.saved).toHaveLength(1);
  });

  it("niet gecontroleerd: de aanvraag wordt bewaard met de gekozen reacties, Beheer krijgt een melding, geen bericht aan werkers", async () => {
    const uit = await aanroep({ keuzes: [{ offerId: "o1", shiftId: "s1" }, { offerId: "o2", shiftId: "s2" }] });

    expect(uit).toEqual({ status: "aangevraagd", keuzes: 2 });
    expect(m.koppel).toHaveBeenCalledWith("u1", "t1", expect.objectContaining({ land: "NL", kvkNumber: "12345678" }));
    expect(m.saved).toHaveLength(1);
    const controle = (m.saved[0] as { controle: Record<string, unknown> }).controle;
    expect(controle).toMatchObject({
      op: "2026-11-23T09:00:00.000Z",
      land: "NL",
      kvkNumber: "12345678",
      bedrijfsnaam: "Bakkerij Jansen B.V.",
      contactNaam: "Sanne Jansen",
      contactFunctie: "Eigenaar",
      telefoon: "0612345678",
      tekenaarNaam: null,
      gemeldOp: null,
      keuzes: [{ offerId: "o1", shiftId: "s1" }, { offerId: "o2", shiftId: "s2" }],
    });
    expect(m.alert).toHaveBeenCalledWith(expect.objectContaining({ key: "bedrijf-inplannen:t1", severity: "warning", url: "/admin/kvk-controle" }));
    expect(m.alert.mock.calls[0]?.[0]).toMatchObject({ title: expect.stringContaining("Bakkerij Jansen B.V.") });
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "employer.controle.aangevraagd", targetId: "t1", metadata: expect.objectContaining({ gecontroleerd: false, keuzes: 2 }) }));
  });

  it("een keuze die niet bij dit bedrijf hoort, al is afgehandeld of niet bestaat, wordt niet bewaard", async () => {
    const uit = await aanroep({
      keuzes: [
        { offerId: "o1", shiftId: "s1" },
        { offerId: "o3", shiftId: "s1" }, // al afgewezen
        { offerId: "ovreemd", shiftId: "sx" }, // een klus van een ander bedrijf
        { offerId: "o2", shiftId: "s1" }, // reactie hoort bij een andere klus
        { offerId: "bestaatniet", shiftId: "s2" },
      ],
    });
    expect(uit.keuzes).toBe(1);
    expect((m.saved[0] as { controle: { keuzes: unknown[] } }).controle.keuzes).toEqual([{ offerId: "o1", shiftId: "s1" }]);
  });

  it("een tweede aanvraag houdt de eerder bewaarde keuzes", async () => {
    m.extra = { controle: { keuzes: [{ offerId: "o2", shiftId: "s2" }], gemeldOp: null } };
    const uit = await aanroep({ keuzes: [{ offerId: "o1", shiftId: "s1" }] });
    expect(uit.keuzes).toBe(2);
    expect((m.saved[0] as { controle: { keuzes: unknown[] } }).controle.keuzes).toEqual([{ offerId: "o2", shiftId: "s2" }, { offerId: "o1", shiftId: "s1" }]);
  });

  it("klopt alles en hoort de aanmelder bij het bedrijf: meteen gecontroleerd, werkers horen het, geen melding aan Beheer en geen mail achteraf", async () => {
    m.verified = true;
    const uit = await aanroep();
    expect(uit.status).toBe("gecontroleerd");
    expect(m.notify).toHaveBeenCalledWith("t1");
    expect(m.alert).not.toHaveBeenCalled();
    // het bedrijf leest het in het venster zelf: gemeldOp staat al, dus notifyCompanyChecked stuurt niets meer
    expect((m.saved[0] as { controle: { gemeldOp: string | null } }).controle.gemeldOp).toBe("2026-11-23T09:00:00.000Z");
  });

  it("een buitenlands bedrijf: het btw-nummer gaat mee en het bedrijf wacht op Beheer", async () => {
    m.koppel.mockResolvedValue({ kvkValid: true, inControle: true, companyName: "Muster GmbH", reasons: [], buitenlands: true, zelfControle: false });
    const uit = await aanroep({ raw: { ...VELDEN, land: "DE", kvkNumber: "", btwNummer: "DE123456789", bedrijfsnaam: "Muster GmbH" } });
    expect(uit.status).toBe("aangevraagd");
    expect(m.koppel).toHaveBeenCalledWith("u1", "t1", expect.objectContaining({ land: "DE", btwNummer: "DE123456789" }));
    expect((m.saved[0] as { controle: Record<string, unknown> }).controle).toMatchObject({ land: "DE", kvkNumber: null, btwNummer: "DE123456789" });
    expect(m.alert.mock.calls[0]?.[0]).toMatchObject({ detail: expect.stringContaining("Btw-nummer DE123456789") });
  });

  it("een lid zonder beheerdersrol krijgt de 423 van koppelBedrijfsgegevens terug en er wordt niets bewaard", async () => {
    m.koppel.mockRejectedValue(AppError.alleenBeheerder("Alleen de beheerder"));
    await expect(aanroep()).rejects.toMatchObject({ status: 423, code: "ALLEEN_BEHEERDER" });
    expect(m.saved).toEqual([]);
  });
});

describe("openBedrijfAanvragen (Admin → KVK-controle)", () => {
  const aanvraag = (op: string) => ({ op, land: "NL", kvkNumber: "12345678", btwNummer: null, registratieNummer: null, bedrijfsnaam: "X", contactNaam: "A B", contactFunctie: "Eigenaar", telefoon: "0612345678", tekenaarNaam: null, keuzes: [], gemeldOp: null });

  it("toont alleen bedrijven met een aanvraag die nog niet zijn gecontroleerd, oudste eerst", async () => {
    m.kv = [
      { key: "profile-org:t-nieuw", value: { controle: aanvraag("2026-11-23T10:00:00.000Z") } },
      { key: "profile-org:t-oud", value: { controle: aanvraag("2026-11-20T10:00:00.000Z") } },
      { key: "profile-org:t-klaar", value: { controle: aanvraag("2026-11-21T10:00:00.000Z") } },
      { key: "profile-org:t-zonder", value: { about: "geen aanvraag" } },
      { key: "profile-org:t-weg", value: { controle: aanvraag("2026-11-22T10:00:00.000Z") } },
    ];
    m.tenants = [
      { id: "t-nieuw", name: "Nieuw BV" },
      { id: "t-oud", name: "Oud BV" },
      { id: "t-klaar", name: "Klaar BV" },
    ];
    m.verifiedPer = { "t-klaar": true };

    const rijen = await openBedrijfAanvragen();

    expect(rijen.map((r) => r.id)).toEqual(["t-oud", "t-nieuw"]);
    expect(rijen[0]).toMatchObject({ naam: "Oud BV", href: "/admin/bedrijven/t-oud" });
  });

  it("zonder aanvragen: een lege lijst en geen vraag aan de database", async () => {
    m.kv = [{ key: "profile-org:t1", value: { about: "x" } }];
    expect(await openBedrijfAanvragen()).toEqual([]);
  });
});
