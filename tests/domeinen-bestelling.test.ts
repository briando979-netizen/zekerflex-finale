import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    site: null as null | { status: string },
    eerderBundel: 0,
    rij: null as null | Record<string, unknown>,
    updateCount: 1,
    mails: [] as { to: string; subject: string }[],
    updates: [] as { where: unknown; data: unknown }[],
  };
  return {
    state,
    prisma: {
      managedWebsite: { findUnique: async () => state.site },
      domeinBestelling: {
        count: async () => state.eerderBundel,
        findUnique: async () => state.rij,
        updateMany: async (a: { where: unknown; data: unknown }) => {
          state.updates.push(a);
          return { count: state.updateCount };
        },
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/mail", () => ({
  // zoals lib/mail: alleen .test/.example/.invalid/localhost, NIET example.com
  isReservedTestAddress: (a: string) => /\.(test|example|invalid|localhost)$/i.test(a),
  sendMail: async (m: { to: string; subject: string }) => {
    h.state.mails.push(m);
    return { delivered: true };
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: () => ({}) }));
vi.mock("@/lib/mail/hosting/transip", () => ({ transipConfigured: () => false, domainAvailability: async () => null }));

import { metBtw } from "@/lib/domeinen/extensies";
import { bundelVoor, MAG_NAAR, terugMet, terugPad, verwerkDomeinSessie, zetStatus } from "@/lib/domeinen/bestelling";

const best = (extra: Record<string, unknown> = {}) => ({
  id: "b1",
  tenantId: "t1",
  userId: "u1",
  email: "k.test@example.com",
  domein: "jansen.nl",
  jaren: 1,
  prijsCent: 995,
  btwCent: 209,
  bundel: false,
  status: "OPEN",
  stripeSessionId: "cs_1",
  betaaldOp: null,
  afgerondOp: null,
  notitie: "",
  createdAt: new Date("2026-11-04T08:00:00Z"),
  updatedAt: new Date("2026-11-04T08:00:00Z"),
  ...extra,
});
const sessie = (extra: Record<string, unknown> = {}) =>
  ({ id: "cs_1", payment_status: "paid", amount_total: 1204, metadata: { domeinBestellingId: "b1" }, ...extra }) as never;

beforeEach(() => {
  h.state.site = null;
  h.state.eerderBundel = 0;
  h.state.rij = best();
  h.state.updateCount = 1;
  h.state.mails.length = 0;
  h.state.updates.length = 0;
});

describe("btw", () => {
  it("21% op hele centen", () => {
    expect(metBtw(995)).toEqual({ exclCent: 995, btwCent: 209, inclCent: 1204 });
    expect(metBtw(1495)).toEqual({ exclCent: 1495, btwCent: 314, inclCent: 1809 });
    expect(metBtw(0)).toEqual({ exclCent: 0, btwCent: 0, inclCent: 0 });
  });
});

describe("terug na de betaalpagina", () => {
  it("alleen vaste eigen pagina's, anders /domeinnaam", () => {
    expect(terugPad("/werkgever/website/bouwer")).toBe("/werkgever/website/bouwer");
    expect(terugPad("/studio")).toBe("/studio");
    for (const slecht of ["https://evil.example", "//evil.example", "/werkgever/website/bouwer?x=1", "/admin", undefined, 42]) {
      expect(terugPad(slecht)).toBe("/domeinnaam");
    }
  });
  it("zet uitkomst en domein netjes in de querystring", () => {
    expect(terugMet("/werkgever/website/bouwer", "gelukt", "café.nl")).toBe("/werkgever/website/bouwer?bestelling=gelukt&domein=caf%C3%A9.nl");
    expect(terugMet("//evil.example", "geannuleerd", "a.nl")).toBe("/domeinnaam?bestelling=geannuleerd&domein=a.nl");
  });
});

describe("bundel", () => {
  it("alleen met een websiteabonnement, alleen nl/com/eu/be, één keer", async () => {
    expect(await bundelVoor("t1", "nl")).toBe(false);
    h.state.site = { status: "ACTIVE" };
    expect(await bundelVoor("t1", "nl")).toBe(true);
    expect(await bundelVoor("t1", "shop")).toBe(false);
    h.state.site = { status: "PENDING_PAYMENT" };
    expect(await bundelVoor("t1", "com")).toBe(false);
    h.state.site = { status: "SUBMITTED" };
    h.state.eerderBundel = 1;
    expect(await bundelVoor("t1", "com")).toBe(false);
  });
});

describe("webhook", () => {
  it("betaald → BETAALD en mails aan sales en klant", async () => {
    h.state.rij = best({ email: "eigenaar@bakkerij-jansen.nl" });
    expect(await verwerkDomeinSessie(sessie())).toEqual({ verwerkt: true });
    const u = h.state.updates[0] as { where: { id: string; status: string }; data: { status: string } };
    expect(u.where).toEqual({ id: "b1", status: "OPEN" });
    expect(u.data.status).toBe("BETAALD");
    expect(h.state.mails.map((m) => m.to)).toEqual(["sales@zekerflex.com", "eigenaar@bakkerij-jansen.nl"]);
  });
  it("een testadres (example.com) vraagt sales nooit een echt domein te kopen", async () => {
    await verwerkDomeinSessie(sessie());
    expect(h.state.mails.map((m) => m.to)).toEqual(["k.test@example.com"]);
  });
  it("dubbel gestuurd: geen tweede mail", async () => {
    h.state.updateCount = 0;
    await verwerkDomeinSessie(sessie());
    expect(h.state.mails).toHaveLength(0);
  });
  it("afwijkend bedrag: niet op betaald, wel een notitie", async () => {
    expect(await verwerkDomeinSessie(sessie({ amount_total: 100 }))).toEqual({ verwerkt: false });
    const u = h.state.updates[0] as { data: Record<string, unknown> };
    expect(u.data.status).toBeUndefined();
    expect(String(u.data.notitie)).toMatch(/wijkt af/);
    expect(h.state.mails).toHaveLength(0);
  });
  it("niet betaald of andere metadata: niets", async () => {
    expect(await verwerkDomeinSessie(sessie({ payment_status: "unpaid" }))).toEqual({ verwerkt: false });
    expect(await verwerkDomeinSessie(sessie({ metadata: {} }))).toEqual({ verwerkt: false });
    expect(h.state.updates).toHaveLength(0);
  });
});

describe("admin zet de status", () => {
  it("BETAALD → GEREGISTREERD mailt de klant", async () => {
    h.state.rij = best({ status: "BETAALD" });
    await zetStatus("b1", "GEREGISTREERD", "", "user:admin");
    expect(h.state.mails.map((m) => m.subject)).toEqual(["jansen.nl is vastgelegd"]);
  });
  it("een afgeronde bestelling verandert niet meer", async () => {
    h.state.rij = best({ status: "GEREGISTREERD" });
    await expect(zetStatus("b1", "GEANNULEERD", "", "user:admin")).rejects.toThrow();
    expect(MAG_NAAR.GEREGISTREERD).toEqual([]);
    expect(MAG_NAAR.OPEN).toEqual(["GEANNULEERD"]);
  });
  it("tegelijk aangepast: foutmelding", async () => {
    h.state.rij = best({ status: "BETAALD" });
    h.state.updateCount = 0;
    await expect(zetStatus("b1", "MISLUKT", "", "user:admin")).rejects.toThrow(/net door iemand anders/);
  });
});
