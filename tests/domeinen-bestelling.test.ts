import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    site: null as null | { status: string; stripeSubId?: string | null },
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
    kv: new Map<string, unknown>(),
    alerts: [] as { key: string }[],
    facturen: [] as Record<string, unknown>[],
    beschikbaar: null as null | { status: string },
    aangemaakt: [] as Record<string, unknown>[],
    sloten: [] as { domein: string; dicht: boolean }[],
    houder: { contacten: null, reden: "geen KVK-gegevens van het bedrijf" } as { contacten: unknown[] | null; reden?: string },
    houderFout: null as null | Error,
    contactenBijRegistratie: [] as (unknown[] | undefined)[],
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
        create: async ({ data }: { data: Record<string, unknown> }) => {
          state.aangemaakt.push(data);
          return { id: "nieuw1", ...data };
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
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: () => ({}), ensureStripeCustomer: async () => "cus_1" }));
vi.mock("@/lib/mail/hosting/transip", () => ({
  transipConfigured: () => h.state.transip,
  domainAvailability: async () => h.state.beschikbaar,
  domainInfo: async () => ({ name: "jansen.nl", renewalDate: "2027-11-05" }),
  registerDomain: async (domein: string, dns: unknown[], contacten?: unknown[]) => {
    if (h.state.transipFout) throw h.state.transipFout;
    if (contacten && h.state.houderFout) throw h.state.houderFout;
    h.state.contactenBijRegistratie.push(contacten);
    h.state.registraties.push({ domein, dns });
  },
  setTransferLock: async (domein: string, dicht: boolean) => void h.state.sloten.push({ domein, dicht }),
}));
vi.mock("@/lib/domeinen/houder", () => ({ houderContacten: async () => h.state.houder }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.state.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.state.kv.set(k, v),
}));
vi.mock("@/lib/domeinen/beschikbaar", () => ({ beschikbaarheid: async () => "vrij" }));
vi.mock("@/lib/ops/alert", () => ({ alertOwnerLater: (a: { key: string }) => void h.state.alerts.push(a) }));
vi.mock("@/lib/domeinen/factuur", () => ({
  maakDomeinFactuur: async (f: Record<string, unknown>) => {
    h.state.facturen.push(f);
    return { id: "inv1" };
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
import { bundelOver, bundelVoor, koppelBestelling, legVast, startBestelling, MAG_NAAR, registreerBijTransip, terugMet, terugPad, verwerkDomeinSessie, zetStatus } from "@/lib/domeinen/bestelling";
import { AUTO_REGISTREREN_PER_DAG } from "@/lib/domeinen/verlengen-core";

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
  h.state.kv.clear();
  h.state.alerts.length = 0;
  h.state.facturen.length = 0;
  h.state.beschikbaar = null;
  h.state.aangemaakt.length = 0;
  h.state.sloten.length = 0;
  h.state.houder = { contacten: null, reden: "geen KVK-gegevens van het bedrijf" };
  h.state.houderFout = null;
  h.state.contactenBijRegistratie.length = 0;
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
  it("alleen met een betaald websiteabonnement, alleen nl/com/eu/be, één keer", async () => {
    expect(await bundelVoor("t1", "nl")).toBe(false);
    h.state.site = { status: "ACTIVE", stripeSubId: "sub_1" };
    expect(await bundelVoor("t1", "nl")).toBe(true);
    expect(await bundelOver("t1")).toBe(true);
    expect(await bundelVoor("t1", "shop")).toBe(false);
    h.state.site = { status: "PENDING_PAYMENT", stripeSubId: null };
    expect(await bundelVoor("t1", "com")).toBe(false);
    h.state.site = { status: "SUBMITTED", stripeSubId: "sub_1" };
    h.state.eerderBundel = 1;
    expect(await bundelVoor("t1", "com")).toBe(false);
    expect(await bundelOver("t1")).toBe(false);
  });
  it("een kosteloos account of beheerdersrecord (actief zonder Stripe-abonnement) betaalt gewoon", async () => {
    h.state.site = { status: "ACTIVE", stripeSubId: null };
    expect(await bundelVoor("t1", "nl")).toBe(false);
    expect(await bundelOver("t1")).toBe(false);
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
  it("betaald → meteen een betaalde ZekerFlex-factuur voor het eerste jaar", async () => {
    h.state.rij = best({ email: "eigenaar@bakkerij-jansen.nl" });
    await verwerkDomeinSessie(sessie({ payment_intent: "pi_1" }));
    expect(h.state.facturen).toHaveLength(1);
    const f = h.state.facturen[0] as { soort: string; exclCent: number; betaald: { stripePaymentIntentId: string; stripeCheckoutSessionId: string } };
    expect(f.soort).toBe("eerste-jaar");
    expect(f.exclCent).toBe(995);
    expect(f.betaald.stripePaymentIntentId).toBe("pi_1");
    expect(f.betaald.stripeCheckoutSessionId).toBe("cs_1");
  });
  it("met de TransIP-koppeling: geen mail aan sales, de klant hoort dat het nu gebeurt", async () => {
    h.state.transip = true;
    h.state.rij = best({ email: "eigenaar@bakkerij-jansen.nl" });
    await verwerkDomeinSessie(sessie());
    expect(h.state.mails.map((m) => m.to)).toEqual(["eigenaar@bakkerij-jansen.nl"]);
    expect(h.state.mails[0]?.text).toMatch(/nu voor je vast/);
    expect(h.state.mails[0]?.text).not.toMatch(/TransIP/);
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
    expect(MAG_NAAR.GEREGISTREERD).toEqual(["OPGEZEGD"]);
    expect(MAG_NAAR.OPGEZEGD).toEqual(["GEREGISTREERD"]);
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

describe("registreren via TransIP (knop in Admin)", () => {
  it("zonder sleutel: een duidelijke melding, niets geregistreerd", async () => {
    h.state.rij = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    await expect(registreerBijTransip("b1", "user:admin1")).rejects.toThrow(/TransIP staat nog niet aan/);
    expect(h.state.registraties).toHaveLength(0);
    expect(h.state.updates).toHaveLength(0);
  });
  it("met sleutel: registreert met DNS naar onze server, daarna geregistreerd en op de website", async () => {
    h.state.transip = true;
    h.state.rij = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    await registreerBijTransip("b1", "user:admin1");
    expect(h.state.registraties).toHaveLength(1);
    const dns = h.state.registraties[0]?.dns as { name: string; type: string; content: string }[];
    expect(dns.map((r) => `${r.type} ${r.name}`)).toEqual(["A @", "AAAA @", "CNAME www"]);
    expect(dns[2]?.content).toBe("jansen.nl.");
    const u = h.state.updates[0] as { data: { status: string; verlooptOp: Date } };
    expect(u.data.status).toBe("GEREGISTREERD");
    // de verlengdatum komt van het register
    expect(u.data.verlooptOp.toISOString()).toBe("2027-11-05T12:00:00.000Z");
    expect(notitieVan(0)).toMatch(/Vastgelegd via TransIP \(knop\)\. Houder: ZekerFlex \(.*\)\. Op de website/);
    expect(h.state.koppelingen).toHaveLength(1);
  });
  it("TransIP weigert: op mislukt, melding aan de beheerder, geen mail aan de klant", async () => {
    h.state.transip = true;
    h.state.transipFout = new Error("TransIP: domein niet beschikbaar");
    h.state.rij = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    await expect(registreerBijTransip("b1", "user:admin1")).rejects.toThrow(/niet beschikbaar/);
    expect((h.state.updates[0] as { data: { status: string } }).data.status).toBe("MISLUKT");
    expect(h.state.alerts.map((a) => a.key)).toEqual(["domein-mislukt:b1"]);
    expect(h.state.mails).toHaveLength(0);
  });
  it("staat de naam al in ons account (half gelukte poging): niet nog eens registreren", async () => {
    h.state.transip = true;
    h.state.beschikbaar = { status: "inyouraccount" };
    h.state.rij = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    await registreerBijTransip("b1", "user:admin1");
    expect(h.state.registraties).toHaveLength(0);
    expect((h.state.updates[0] as { data: { status: string } }).data.status).toBe("GEREGISTREERD");
  });
  it("net door een ander vastgelegd: niet registreren, op mislukt", async () => {
    h.state.transip = true;
    h.state.beschikbaar = { status: "notfree" };
    h.state.rij = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    await expect(registreerBijTransip("b1", "user:admin1")).rejects.toThrow(/niet meer vrij/);
    expect(h.state.registraties).toHaveLength(0);
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

describe("bestellen", () => {
  it("de route geeft meer mee (naam): alleen bedrijf, gebruiker en e-mail gaan naar de database", async () => {
    h.state.site = { status: "ACTIVE", stripeSubId: "sub_1" };
    h.state.rij = null;
    const besteller = { tenantId: "t1", userId: "u1", email: "eigenaar@bakkerij-jansen.nl", naam: "Jan" };
    const uit = await startBestelling(besteller, "jansen.nl", (pad) => pad);
    expect(uit.soort).toBe("bundel");
    const data = h.state.aangemaakt[0] ?? {};
    expect(data).not.toHaveProperty("naam");
    expect(data).toMatchObject({ tenantId: "t1", userId: "u1", email: "eigenaar@bakkerij-jansen.nl", domein: "jansen.nl", bundel: true, status: "BETAALD" });
  });
});

describe("houder en verhuisslot", () => {
  it("het bedrijf van de klant als houder, daarna het verhuisslot dicht", async () => {
    h.state.transip = true;
    h.state.houder = { contacten: [{ type: "registrant" }, { type: "administrative" }, { type: "technical" }] };
    const b = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    h.state.rij = b;
    expect(await legVast(b as never, "systeem:na-betaling", false)).toBe("vastgelegd");
    expect(h.state.contactenBijRegistratie[0]).toHaveLength(3);
    expect(h.state.sloten).toEqual([{ domein: "jansen.nl", dicht: true }]);
    expect(notitieVan(0)).toMatch(/Houder: het bedrijf zelf\./);
  });
  it("weigert het register de bedrijfsgegevens: toch vastleggen, met ZekerFlex als houder", async () => {
    h.state.transip = true;
    h.state.houder = { contacten: [{ type: "registrant" }] };
    const { AppError } = await import("@/lib/errors");
    h.state.houderFout = AppError.validation("TransIP: invalid contact");
    const b = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    h.state.rij = b;
    expect(await legVast(b as never, "systeem:na-betaling", false)).toBe("vastgelegd");
    expect(h.state.registraties).toHaveLength(1);
    expect(h.state.contactenBijRegistratie[0]).toBeUndefined();
    expect(notitieVan(0)).toMatch(/Houder: ZekerFlex \(het register weigerde/);
  });
  it("geen bedrijfsgegevens: ZekerFlex houder, met de reden in de notitie", async () => {
    h.state.transip = true;
    const b = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    h.state.rij = b;
    await legVast(b as never, "systeem:na-betaling", false);
    expect(notitieVan(0)).toMatch(/Houder: ZekerFlex \(geen KVK-gegevens van het bedrijf\)/);
  });
});

describe("vanzelf vastleggen na betaling", () => {
  it("betaald + koppeling: vastgelegd zonder klik, de teller loopt op", async () => {
    h.state.transip = true;
    const b = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    h.state.rij = b;
    expect(await legVast(b as never, "systeem:na-betaling", false)).toBe("vastgelegd");
    expect(h.state.registraties).toHaveLength(1);
    expect([...h.state.kv.values()]).toEqual([{ n: 1 }]);
  });
  it("de dagelijkse grens: daarna wacht hij op de beheerder", async () => {
    h.state.transip = true;
    for (const k of ["x"]) h.state.kv.set(k, null);
    const b = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    h.state.rij = b;
    // de teller van vandaag staat al op de grens
    const { amsterdamDayKey } = await import("@/lib/time/amsterdam");
    h.state.kv.set(`domein-auto-vastgelegd:${amsterdamDayKey(new Date())}`, { n: AUTO_REGISTREREN_PER_DAG });
    expect(await legVast(b as never, "systeem:na-betaling", false)).toBe("wacht");
    expect(h.state.registraties).toHaveLength(0);
    expect(h.state.alerts.map((a) => a.key)[0]).toMatch(/^domein-grens:/);
  });
  it("lukt het vanzelf niet: mislukt, de beheerder een melding, de klant een geruststellende mail zonder TransIP", async () => {
    h.state.transip = true;
    h.state.transipFout = new Error("TransIP: tijdelijk niet bereikbaar");
    const b = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    h.state.rij = b;
    expect(await legVast(b as never, "systeem:na-betaling", false)).toBe("mislukt");
    expect(h.state.alerts.map((a) => a.key)).toEqual(["domein-mislukt:b1"]);
    expect(h.state.mails.map((m) => m.subject)).toEqual(["jansen.nl: we regelen het voor je"]);
    expect(h.state.mails[0]?.text).not.toMatch(/TransIP/);
  });
  it("een testbestelling komt nooit bij het register, maar loopt verder net als echt", async () => {
    h.state.transip = true;
    const b = best({ status: "BETAALD", email: "proef@zekerflex.test" });
    h.state.rij = b;
    expect(await legVast(b as never, "systeem:na-betaling", false)).toBe("vastgelegd");
    expect(h.state.registraties).toHaveLength(0);
    expect(notitieVan(0)).toMatch(/Testbestelling/);
  });
  it("zonder koppeling: wacht (sales legt hem met de hand vast)", async () => {
    const b = best({ status: "BETAALD", email: "eigenaar@bakkerij-jansen.nl" });
    expect(await legVast(b as never, "systeem:na-betaling", false)).toBe("wacht");
    expect(h.state.updates).toHaveLength(0);
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
