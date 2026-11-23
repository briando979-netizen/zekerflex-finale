import { beforeEach, describe, expect, it, vi } from "vitest";

// Rond de eerste klus van een bedrijf dat nog niet is gecontroleerd (23 nov 2026):
//  - de feiten voor blok 2 van "Jouw start" (eersteKlusFeiten),
//  - Beheer ziet een nieuw bedrijf met een klus (meldEersteKlusVanNieuwBedrijf),
//  - het bedrijf krijgt bericht zodra het is goedgekeurd, maar alleen als het zijn gegevens invulde en maar één keer (notifyCompanyChecked).

const NU = new Date("2026-11-23T10:00:00+01:00");
const MORGEN = new Date("2026-11-24T10:00:00+01:00");

const m = vi.hoisted(() => ({
  verified: false,
  klussen: [] as Record<string, unknown>[],
  reacties: [] as { id: string; shiftId: string; status: string }[],
  shiftCount: 1,
  tenantNaam: "Bakkerij Jansen" as string | null,
  beheerderEmail: "sanne@bakkerijjansen.nl",
  eigenTest: { tenants: {} as Record<string, string>, users: {} as Record<string, string> },
  alert: vi.fn(),
  extra: {} as Record<string, unknown>,
  saved: [] as Record<string, unknown>[],
  admins: [] as { userId: string; user: { email: string; fullName: string } }[],
  push: vi.fn(async () => 1),
  mail: vi.fn(async () => ({ id: "m1", delivered: true })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: { findMany: async () => m.klussen, count: async () => m.shiftCount },
    tenant: { findUnique: async () => (m.tenantNaam === null ? null : { name: m.tenantNaam }) },
    membership: { findFirst: async () => ({ user: { email: m.beheerderEmail } }), findMany: async () => m.admins },
    shiftMatch: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/offers/store", () => ({ listCounterOffers: async () => m.reacties }));
// de echte poort, behalve of het bedrijf nu gecontroleerd is (notifyCompanyChecked blijft echt)
vi.mock("@/lib/company/verified", async (orig) => ({ ...(await orig<typeof import("@/lib/company/verified")>()), isTenantVerified: async () => m.verified }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://zf.example/" } }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: (...a: unknown[]) => m.alert(...a) }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => m.eigenTest }));
vi.mock("@/lib/profile/store", () => ({
  getOrgProfileExtra: async () => m.extra,
  saveOrgProfileExtra: async (_id: string, patch: Record<string, unknown>) => {
    m.saved.push(patch);
    m.extra = { ...m.extra, ...patch };
  },
}));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => (m.push as (...x: unknown[]) => Promise<number>)(...a) }));
vi.mock("@/lib/mail", () => ({
  sendMail: (...a: unknown[]) => (m.mail as (...x: unknown[]) => Promise<unknown>)(...a),
  mailShell: (titel: string, html: string) => `<shell>${titel}${html}</shell>`,
  mailButton: (href: string, label: string) => `<a href="${href}">${label}</a>`,
  escapeHtml: (s: string) => s,
}));

const { eersteKlusFeiten, GEEN_KLUS } = await import("@/lib/onboarding/eerste-klus");
const { meldEersteKlusVanNieuwBedrijf } = await import("@/lib/company/eerste-klus");
const { notifyCompanyChecked } = await import("@/lib/company/verified");

const klus = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  status: "OPEN",
  visibility: "PUBLIC",
  startsAt: MORGEN,
  _count: { assignments: 0, matches: 0 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.alert.mockReset();
  m.verified = false;
  m.klussen = [];
  m.reacties = [];
  m.shiftCount = 1;
  m.tenantNaam = "Bakkerij Jansen";
  m.beheerderEmail = "sanne@bakkerijjansen.nl";
  m.eigenTest = { tenants: {}, users: {} };
  m.extra = {};
  m.saved.length = 0;
  m.admins = [{ userId: "u1", user: { email: "sanne@bakkerijjansen.nl", fullName: "Sanne Jansen" } }];
});

describe("eersteKlusFeiten (blok 2 van Jouw start)", () => {
  it("zonder klus: niets gedaan", async () => {
    expect(await eersteKlusFeiten("t1", NU)).toEqual(GEEN_KLUS);
  });

  it("een klus die live staat telt, ook zonder controle van het bedrijf; reacties en inplannen volgen uit de gegevens", async () => {
    m.klussen = [klus()];
    expect(await eersteKlusFeiten("t1", NU)).toEqual({ heeftKlus: true, klusLive: true, heeftReactie: false, heeftIngepland: false });

    m.klussen = [klus({ _count: { assignments: 0, matches: 2 } })];
    expect((await eersteKlusFeiten("t1", NU)).heeftReactie).toBe(true);

    m.klussen = [klus({ _count: { assignments: 1, matches: 0 } })];
    expect(await eersteKlusFeiten("t1", NU)).toMatchObject({ heeftReactie: true, heeftIngepland: true });
  });

  it("een reactie met een eigen tarief staat niet in de database maar bij de reacties: die telt ook, een ingetrokken niet", async () => {
    m.klussen = [klus()];
    m.reacties = [{ id: "o1", shiftId: "s1", status: "withdrawn" }];
    expect((await eersteKlusFeiten("t1", NU)).heeftReactie).toBe(false);
    m.reacties = [{ id: "o2", shiftId: "s1", status: "pending" }, { id: "o3", shiftId: "van-een-ander", status: "pending" }];
    expect((await eersteKlusFeiten("t1", NU)).heeftReactie).toBe(true);
    m.reacties = [{ id: "o3", shiftId: "van-een-ander", status: "pending" }];
    expect((await eersteKlusFeiten("t1", NU)).heeftReactie).toBe(false);
  });

  it("een klus in concept, in een privé-pool of in het verleden staat niet live", async () => {
    for (const over of [{ status: "DRAFT" }, { visibility: "POOL_ONLY" }, { startsAt: new Date("2026-11-20T10:00:00+01:00") }]) {
      m.klussen = [klus(over)];
      expect(await eersteKlusFeiten("t1", NU), JSON.stringify(over)).toMatchObject({ heeftKlus: true, klusLive: false });
    }
  });
});

describe("meldEersteKlusVanNieuwBedrijf: Beheer ziet een nieuw bedrijf met een klus", () => {
  it("een bedrijf dat nog niet is gecontroleerd en zijn eerste klus plaatst: een melding met een link naar het bedrijf", async () => {
    await meldEersteKlusVanNieuwBedrijf("t1", "Magazijnmedewerker", 1);
    expect(m.alert).toHaveBeenCalledTimes(1);
    expect(m.alert).toHaveBeenCalledWith(
      expect.objectContaining({ key: "bedrijf-eerste-klus:t1", severity: "warning", url: "/admin/bedrijven/t1", title: expect.stringContaining("Bakkerij Jansen") }),
    );
    expect(m.alert.mock.calls[0]?.[0].detail).toContain("naar concept");
  });

  it("geen melding bij een tweede klus, bij een gecontroleerd bedrijf, een eigen testbedrijf of een intern adres", async () => {
    m.shiftCount = 3; // eerder al klussen: dit is niet de eerste
    await meldEersteKlusVanNieuwBedrijf("t1", "Klus", 1);
    m.shiftCount = 1;
    m.verified = true;
    await meldEersteKlusVanNieuwBedrijf("t1", "Klus", 1);
    m.verified = false;
    m.eigenTest = { tenants: { t1: "2026-11-01T10:00:00.000Z" }, users: {} };
    await meldEersteKlusVanNieuwBedrijf("t1", "Klus", 1);
    m.eigenTest = { tenants: {}, users: {} };
    m.beheerderEmail = "nieuw@bedrijf.test";
    await meldEersteKlusVanNieuwBedrijf("t1", "Klus", 1);
    m.beheerderEmail = "eigenaar@zekerflex.com";
    await meldEersteKlusVanNieuwBedrijf("t1", "Klus", 1);

    expect(m.alert).not.toHaveBeenCalled();
  });

  it("een reeks dagen telt als één plaatsing, en een storing houdt het plaatsen nooit tegen", async () => {
    m.shiftCount = 5;
    await meldEersteKlusVanNieuwBedrijf("t1", "Weekdienst", 5);
    expect(m.alert).toHaveBeenCalledTimes(1);

    m.alert.mockImplementation(() => {
      throw new Error("alert stuk");
    });
    await expect(meldEersteKlusVanNieuwBedrijf("t1", "Weekdienst", 5)).resolves.toBeUndefined();
  });
});

describe("notifyCompanyChecked: het bedrijf hoort dat het kan inplannen", () => {
  const aanvraag = (over: Record<string, unknown> = {}) => ({ op: "2026-11-23T09:00:00.000Z", keuzes: [{ offerId: "o1", shiftId: "s1" }], gemeldOp: null, ...over });

  it("alleen als het bedrijf zijn gegevens invulde: push en mail, met een link naar de klussen", async () => {
    m.extra = { controle: aanvraag() };
    expect(await notifyCompanyChecked("t1")).toBe(true);
    expect(m.push).toHaveBeenCalledTimes(1);
    expect(m.push.mock.calls[0]).toMatchObject([["u1"], { data: { url: "/werkgever/diensten" } }]);
    expect(m.mail).toHaveBeenCalledTimes(1);
    const mail = m.mail.mock.calls[0]?.[0] as { to: string; subject: string; text: string; kind: string };
    expect(mail).toMatchObject({ to: "sanne@bakkerijjansen.nl", kind: "bedrijf-gecontroleerd" });
    expect(mail.text).toContain("https://zf.example/werkgever/diensten");
    expect(mail.subject + mail.text).not.toMatch(/test|proef/i);
  });

  it("maar één keer: de aanvraag krijgt gemeldOp, een tweede goedkeuring stuurt niets opnieuw", async () => {
    m.extra = { controle: aanvraag() };
    await notifyCompanyChecked("t1");
    expect((m.saved[0] as { controle: { gemeldOp: string | null } }).controle.gemeldOp).not.toBeNull();
    expect(await notifyCompanyChecked("t1")).toBe(false);
    expect(m.push).toHaveBeenCalledTimes(1);
    expect(m.mail).toHaveBeenCalledTimes(1);
  });

  it("zonder aanvraag (het bedrijf vroeg niets, of werd meteen gecontroleerd) gaat er niets uit", async () => {
    m.extra = {};
    expect(await notifyCompanyChecked("t1")).toBe(false);
    m.extra = { controle: aanvraag({ gemeldOp: "2026-11-23T09:00:00.000Z" }) };
    expect(await notifyCompanyChecked("t1")).toBe(false);
    expect(m.push).not.toHaveBeenCalled();
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("een storing bij het versturen laat de goedkeuring niet mislukken", async () => {
    m.extra = { controle: aanvraag() };
    m.push.mockRejectedValueOnce(new Error("push stuk"));
    m.mail.mockRejectedValueOnce(new Error("mail stuk"));
    await expect(notifyCompanyChecked("t1")).resolves.toBe(true);
  });
});
