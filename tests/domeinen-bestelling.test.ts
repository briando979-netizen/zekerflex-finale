import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    site: null as null | { status: string },
    eerderBundel: 0,
    rij: null as null | Record<string, unknown>,
    updateCount: 1,
    mails: [] as { to: string; subject: string; text?: string }[],
    updates: [] as { where: unknown; data: unknown }[],
    transip: false,
    registraties: [] as { domein: string; dns: unknown[] }[],
    transipFout: null as null | Error,
    koppeling: { soort: "gekoppeld" } as { soort: string; host?: string } | Error,
    koppelingen: [] as { tenantId: string; domein: string; door: { userId: string } }[],
  };
  return {
    state,
    prisma: {
      managedWebsite: { findUnique: async () => state.site },
      domeinBestelling: {
        count: async () => state.eerderBundel,
        findUnique: async () => state.rij,
        findFirst: async ({ where }: { where: { id: string; tenantId: string; status: string } }) =>
          state.rij && state.rij.id === where.id && state.rij.tenantId === where.tenantId && state.rij.status === where.status ? state.rij : null,
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
  sendMail: async (m: { to: string; subject: string; text?: string }) => {
    h.state.mails.push(m);
    return { delivered: true };
  },
}));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: () => ({}) }));
vi.mock("@/lib/mail/hosting/transip", () => ({
  transipConfigured: () => h.state.transip,
  domainAvailability: async () => null,
  registerDomain: async (domein: string, dns: unknown[]) => {
    if (h.state.transipFout) throw h.state.transipFout;
    h.state.registraties.push({ domein, dns });
  },
}));
vi.mock("@/lib/domeinen/koppelen", async (orig) => {
  const echt = await orig<typeof import("@/lib/domeinen/koppelen")>();
  return {
    ...echt,
    koppelAanSite: async (tenantId: string, domein: string, door: { userId: string }) => {
      h.state.koppelingen.push({ tenantId, domein, door });
      if (h.state.koppeling instanceof Error) throw h.state.koppeling;
      return h.state.koppeling;
    },
  };
});

import { metBtw } from "@/lib/domeinen/extensies";
import { bundelVoor, koppelBestelling, MAG_NAAR, registreerBijTransip, terugMet, terugPad, verwerkDomeinSessie, zetStatus } from "@/lib/domeinen/bestelling";

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
  h.state.transip = false;
  h.state.registraties.length = 0;
  h.state.transipFout = null;
  h.state.koppeling = { soort: "gekoppeld" };
  h.state.koppelingen.length = 0;
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
    expect(terugPad("/studio/instellingen")).toBe("/studio/instellingen");
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

const notitieVan = (i: number): string => String((h.state.updates[i] as { data: { notitie?: string } }).data.notitie);

describe("geregistreerd = meteen op de website", () => {
  it("koppelt aan de site van het bedrijf (met de admin als uitvoerder) en zegt dat in mail en notitie", async () => {
    h.state.rij = best({ status: "BETAALD" });
    await zetStatus("b1", "GEREGISTREERD", "", "user:admin1");
    expect(h.state.koppelingen).toEqual([{ tenantId: "t1", domein: "jansen.nl", door: { userId: "admin1", name: "ZekerFlex" } }]);
    expect(notitieVan(0)).toMatch(/Op de website/);
    expect(h.state.mails[0]?.text).toMatch(/meteen aan je website gekoppeld/);
    expect(h.state.mails[0]?.text).toMatch(/https:\/\/jansen\.nl/);
  });
  it("nog geen website: mail legt uit hoe hij later koppelt", async () => {
    h.state.rij = best({ status: "BETAALD" });
    h.state.koppeling = { soort: "geen-site" };
    await zetStatus("b1", "GEREGISTREERD", "", "user:admin1");
    expect(notitieVan(0)).toMatch(/nog geen website/);
    expect(h.state.mails[0]?.text).toMatch(/Koppel aan mijn website/);
  });
  it("de site heeft al een ander domein: niet vervangen", async () => {
    h.state.rij = best({ status: "BETAALD" });
    h.state.koppeling = { soort: "ander-domein", host: "oud.nl" };
    await zetStatus("b1", "GEREGISTREERD", "", "user:admin1");
    expect(notitieVan(0)).toMatch(/al oud\.nl/);
    expect(h.state.mails[0]?.text).toMatch(/Koppel oud\.nl los/);
  });
  it("koppelen faalt: de status gaat toch door, met een notitie", async () => {
    h.state.rij = best({ status: "BETAALD" });
    h.state.koppeling = new Error("al van een andere site");
    await zetStatus("b1", "GEREGISTREERD", "", "user:admin1");
    expect((h.state.updates[0] as { data: { status: string } }).data.status).toBe("GEREGISTREERD");
    expect(notitieVan(0)).toMatch(/lukte niet: al van een andere site/);
    expect(h.state.mails).toHaveLength(1);
  });
  it("mislukt: niet koppelen, geen mail", async () => {
    h.state.rij = best({ status: "BETAALD" });
    await zetStatus("b1", "MISLUKT", "", "user:admin1");
    expect(h.state.koppelingen).toHaveLength(0);
    expect(h.state.mails).toHaveLength(0);
  });
});

describe("registreren via TransIP (alleen op een klik)", () => {
  it("zonder sleutel: een duidelijke melding, niets geregistreerd", async () => {
    h.state.rij = best({ status: "BETAALD" });
    await expect(registreerBijTransip("b1", "user:admin1")).rejects.toThrow(/TransIP staat nog niet aan/);
    expect(h.state.registraties).toHaveLength(0);
    expect(h.state.updates).toHaveLength(0);
  });
  it("met sleutel: registreert met DNS naar onze server, daarna geregistreerd en op de website", async () => {
    h.state.transip = true;
    h.state.rij = best({ status: "BETAALD" });
    await registreerBijTransip("b1", "user:admin1");
    expect(h.state.registraties).toHaveLength(1);
    const dns = h.state.registraties[0]?.dns as { name: string; type: string; content: string }[];
    expect(dns.map((r) => `${r.type} ${r.name}`)).toEqual(["A @", "AAAA @", "CNAME www"]);
    expect(dns[2]?.content).toBe("jansen.nl.");
    expect((h.state.updates[0] as { data: { status: string } }).data.status).toBe("GEREGISTREERD");
    expect(notitieVan(0)).toMatch(/Geregistreerd via TransIP\. Op de website/);
    expect(h.state.koppelingen).toHaveLength(1);
  });
  it("TransIP weigert: status blijft staan", async () => {
    h.state.transip = true;
    h.state.transipFout = new Error("TransIP: domein niet beschikbaar");
    h.state.rij = best({ status: "BETAALD" });
    await expect(registreerBijTransip("b1", "user:admin1")).rejects.toThrow(/niet beschikbaar/);
    expect(h.state.updates).toHaveLength(0);
    expect(h.state.mails).toHaveLength(0);
  });
  it("niet betaald of al klaar: weigeren", async () => {
    h.state.transip = true;
    for (const status of ["OPEN", "GEREGISTREERD", "GEANNULEERD"]) {
      h.state.rij = best({ status });
      await expect(registreerBijTransip("b1", "user:admin1")).rejects.toThrow(/betaalde bestelling/);
    }
    expect(h.state.registraties).toHaveLength(0);
  });
});

describe("het bedrijf koppelt een vastgelegde naam zelf", () => {
  const door = { userId: "u1", name: "Jan" };
  it("alleen een eigen, geregistreerde bestelling", async () => {
    h.state.rij = best({ status: "BETAALD" });
    await expect(koppelBestelling("t1", "b1", door)).rejects.toThrow(/niet voor je vastgelegd/);
    h.state.rij = best({ status: "GEREGISTREERD" });
    await expect(koppelBestelling("t2", "b1", door)).rejects.toThrow(/niet voor je vastgelegd/);
    expect(h.state.koppelingen).toHaveLength(0);
    await koppelBestelling("t1", "b1", door);
    expect(h.state.koppelingen).toEqual([{ tenantId: "t1", domein: "jansen.nl", door }]);
  });
  it("geen website of al een ander domein: zeg wat er moet gebeuren", async () => {
    h.state.rij = best({ status: "GEREGISTREERD" });
    h.state.koppeling = { soort: "geen-site" };
    await expect(koppelBestelling("t1", "b1", door)).rejects.toThrow(/Maak eerst je website/);
    h.state.koppeling = { soort: "ander-domein", host: "oud.nl" };
    await expect(koppelBestelling("t1", "b1", door)).rejects.toThrow(/gebruikt nu oud\.nl/);
  });
});
