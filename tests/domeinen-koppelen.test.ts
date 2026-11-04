import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Een domeinnaam die ZekerFlex vastlegt, komt meteen op de website van het
// bedrijf: geen TXT-bewijs (wij houden de DNS), wel netjes geclaimd, en een
// ander eigen domein dat al op de site staat blijft staan.

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void store.delete(k),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    keyValueStore: {
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        if (store.has(data.key)) throw new Prisma.PrismaClientKnownRequestError("dubbel", { code: "P2002", clientVersion: "5" });
        store.set(data.key, data.value);
        return data;
      },
    },
  },
}));
const audit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => audit(...a) }));

import { createSite, publishSite } from "@/lib/sites/store";
import { checkDomain, dnsRecords, getDomain, linkDomain, mayIssueCertificate, siteForHost, verificationRecord, type DomainLookups } from "@/lib/sites/domain";
import { dnsVoorWebsite, domeinenOpWebsite, koppelAanSite, koppelUitleg } from "@/lib/domeinen/koppelen";
import { env } from "@/lib/env";

const by = { userId: "admin1", name: "ZekerFlex" };
const jan = { userId: "u1", name: "Jan" };
const bedrijf = { naam: "Bakkerij Jansen", kvk: "12345678", straat: "", postcode: "", plaats: "Rijssen", telefoon: "", email: "" };

async function liveSite(tenant = "t1") {
  const s = await createSite(tenant, jan, { templateId: "algemeen", bedrijf });
  await publishSite(s.id, jan);
  return s;
}

const dns = (over: { a?: string[]; https?: string | null } = {}): DomainLookups => ({
  txt: async () => [],
  a: async () => over.a ?? [],
  aaaa: async () => [],
  https: async () => over.https ?? null,
});

beforeEach(() => {
  store.clear();
  audit.mockClear();
});

describe("vastgelegd via ZekerFlex → op de website", () => {
  it("zonder website: niets te koppelen", async () => {
    expect(await koppelAanSite("t1", "jansen.nl", by)).toEqual({ soort: "geen-site" });
    expect(await domeinenOpWebsite("t1")).toEqual([]);
  });

  it("geclaimd zonder TXT-regel; Caddy mag een certificaat halen en de site antwoordt op het domein", async () => {
    const s = await liveSite();
    expect(await koppelAanSite("t1", "jansen.nl", by)).toEqual({ soort: "gekoppeld" });
    const d = await getDomain(s.id);
    expect(d).toMatchObject({ host: "jansen.nl", alias: "www.jansen.nl", viaZekerflex: true, activeAt: null });
    expect(d?.verifiedAt).toBeTruthy();
    expect(store.get("site-host:jansen.nl")).toBe(s.id);
    expect(store.get("site-host:www.jansen.nl")).toBe(s.id);
    expect(await mayIssueCertificate("jansen.nl")).toBe(true);
    expect((await siteForHost("www.jansen.nl"))?.primary).toBe("jansen.nl");
    expect(await domeinenOpWebsite("t1")).toEqual(["jansen.nl", "www.jansen.nl"]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "site.domain.registered", actorUserId: "admin1" }));
  });

  it("geen TXT-regel in de lijst voor de klant, en de controle zegt dat wij de DNS zetten", async () => {
    const s = await liveSite();
    await koppelAanSite("t1", "jansen.nl", by);
    const d = await getDomain(s.id);
    if (!d) throw new Error("geen domein");
    expect(dnsRecords(s.id, d).map((r) => r.type)).toEqual(["A", "AAAA", "CNAME"]);
    const nogNiet = await checkDomain(s.id, by, dns());
    expect(nogNiet.check?.problem).toMatch(/ZekerFlex zet de DNS-regels/);
    const klaar = await checkDomain(s.id, by, dns({ a: [env.SITES_IPV4], https: verificationRecord(s.id) }));
    expect(klaar.activeAt).toBeTruthy();
    expect(klaar.check?.problem).toBeNull();
  });

  it("de klant had dezelfde naam al ingevuld (nog niet bewezen): nu bewezen, niet dubbel", async () => {
    const s = await liveSite();
    await linkDomain(s.id, "www.jansen.nl", jan);
    expect(await koppelAanSite("t1", "jansen.nl", by)).toEqual({ soort: "gekoppeld" });
    expect(await getDomain(s.id)).toMatchObject({ host: "www.jansen.nl", alias: "jansen.nl", viaZekerflex: true });
    expect(store.get("site-host:jansen.nl")).toBe(s.id);
    // nog een keer: verandert niets
    expect(await koppelAanSite("t1", "jansen.nl", by)).toEqual({ soort: "gekoppeld" });
    expect(audit.mock.calls.filter(([a]) => (a as { action: string }).action === "site.domain.registered")).toHaveLength(1);
  });

  it("een ander eigen domein op de site blijft staan", async () => {
    const s = await liveSite();
    await linkDomain(s.id, "oud.nl", jan);
    expect(await koppelAanSite("t1", "jansen.nl", by)).toEqual({ soort: "ander-domein", host: "oud.nl" });
    expect((await getDomain(s.id))?.host).toBe("oud.nl");
    expect(store.has("site-host:jansen.nl")).toBe(false);
  });

  it("al van een andere site: weigeren, niets half geclaimd", async () => {
    const ander = await liveSite("t2");
    await koppelAanSite("t2", "jansen.nl", by);
    await liveSite("t1");
    await expect(koppelAanSite("t1", "jansen.nl", by)).rejects.toMatchObject({ status: 409 });
    expect(store.get("site-host:jansen.nl")).toBe(ander.id);
  });
});

describe("DNS en uitleg", () => {
  it("de DNS-regels voor TransIP wijzen naar onze server", () => {
    expect(dnsVoorWebsite("jansen.nl")).toEqual([
      { name: "@", expire: 3600, type: "A", content: env.SITES_IPV4 },
      { name: "@", expire: 3600, type: "AAAA", content: env.SITES_IPV6 },
      { name: "www", expire: 3600, type: "CNAME", content: "jansen.nl." },
    ]);
  });
  it("de mail zegt per geval wat er gebeurt", () => {
    expect(koppelUitleg("jansen.nl", { soort: "gekoppeld" })).toMatch(/https:\/\/jansen\.nl/);
    expect(koppelUitleg("jansen.nl", { soort: "geen-site" })).toMatch(/Maak je website/);
    expect(koppelUitleg("jansen.nl", { soort: "ander-domein", host: "oud.nl" })).toMatch(/Koppel oud\.nl los/);
  });
});
