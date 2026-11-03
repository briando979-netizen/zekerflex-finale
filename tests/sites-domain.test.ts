import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// Een eigen domein voor een website: koppelen, eigendom bewijzen met een
// TXT-regel (pas dan geclaimd), en pas na een geslaagde https-controle actief.
// Caddy krijgt alleen toestemming voor bewezen domeinen van een gepubliceerde site.

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
import { checkDomain, dnsRecords, getDomain, linkDomain, mayIssueCertificate, normalizeDomain, siteForHost, unlinkDomain, verificationRecord, type DomainLookups } from "@/lib/sites/domain";
import { env } from "@/lib/env";

const by = { userId: "u1", name: "Jan" };
const bedrijf = { naam: "Bakkerij Jansen", kvk: "12345678", straat: "", postcode: "", plaats: "Rijssen", telefoon: "", email: "" };

/** A DNS that the test controls; https answers with whatever `https` returns. */
function fakeDns(over: Partial<Record<"txt" | "a" | "aaaa", Record<string, string[]>>> & { https?: (host: string) => string | null } = {}): DomainLookups & { httpsCalls: string[] } {
  const httpsCalls: string[] = [];
  return {
    httpsCalls,
    txt: async (name) => (over.txt?.[name] ?? []).map((v) => [v]),
    a: async (name) => over.a?.[name] ?? [],
    aaaa: async (name) => over.aaaa?.[name] ?? [],
    https: async (host) => {
      httpsCalls.push(host);
      return over.https ? over.https(host) : null;
    },
  };
}

async function liveSite(tenant = "t1") {
  const s = await createSite(tenant, by, { templateId: "algemeen", bedrijf });
  await publishSite(s.id, by);
  return s;
}

beforeEach(() => {
  store.clear();
  audit.mockClear();
});

describe("domeinnaam invullen", () => {
  it("haalt het domein uit wat mensen intypen, met www als bijnaam", () => {
    expect(normalizeDomain("https://WWW.Bakkerij-Jansen.nl/contact?x=1")).toEqual({ host: "www.bakkerij-jansen.nl", alias: "bakkerij-jansen.nl" });
    expect(normalizeDomain(" bakkerij-jansen.nl ")).toEqual({ host: "bakkerij-jansen.nl", alias: "www.bakkerij-jansen.nl" });
    expect(normalizeDomain("bakkerij-jansen.nl:8080")).toEqual({ host: "bakkerij-jansen.nl", alias: "www.bakkerij-jansen.nl" });
    expect(normalizeDomain("winkel.bakkerij-jansen.nl")).toEqual({ host: "winkel.bakkerij-jansen.nl", alias: null });
    expect(normalizeDomain("bäcker.nl").host).toBe("xn--bcker-gra.nl");
  });

  it.each(["", "bakkerij", "1.2.3.4", "localhost", "bakker.test", "bak ker.nl", "-bakker.nl", "zekerflex.com", "sites.zekerflex.com"])("weigert %j", (raw) => {
    expect(() => normalizeDomain(raw)).toThrow();
  });
});

describe("DNS-regels", () => {
  it("A en AAAA op het domein zelf, www als CNAME, en de TXT-code van deze site", () => {
    const rows = dnsRecords("s1234567", { host: "www.bakkerij-jansen.nl", alias: "bakkerij-jansen.nl" });
    expect(rows.map((r) => `${r.type} ${r.short} ${r.value}`)).toEqual([
      `A @ ${env.SITES_IPV4}`,
      `AAAA @ ${env.SITES_IPV6}`,
      "CNAME www bakkerij-jansen.nl",
      `TXT _zekerflex ${verificationRecord("s1234567")}`,
    ]);
    expect(verificationRecord("s1234567")).not.toBe(verificationRecord("s7654321"));
  });

  it("een subdomein krijgt zijn eigen A-regel en geen www", () => {
    const rows = dnsRecords("s1234567", { host: "winkel.bakkerij-jansen.nl", alias: null });
    expect(rows.map((r) => `${r.type} ${r.short}`)).toEqual(["A winkel", "AAAA winkel", "TXT _zekerflex.winkel"]);
  });
});

describe("koppelen en controleren", () => {
  it("zonder TXT-regel wordt niets geclaimd en krijgt Caddy geen toestemming", async () => {
    const s = await liveSite();
    await linkDomain(s.id, "bakkerij-jansen.nl", by);
    const dns = fakeDns({ a: { "bakkerij-jansen.nl": [env.SITES_IPV4] } });
    const d = await checkDomain(s.id, by, dns);
    expect(d.verifiedAt).toBeNull();
    expect(d.check?.problem).toMatch(/TXT-regel/);
    expect(store.has("site-host:bakkerij-jansen.nl")).toBe(false);
    expect(dns.httpsCalls).toEqual([]);
    expect(await mayIssueCertificate("bakkerij-jansen.nl")).toBe(false);
  });

  it("met TXT, A-regel en https staat de site op het eigen domein; www doet mee", async () => {
    const s = await liveSite();
    await linkDomain(s.id, "bakkerij-jansen.nl", by);
    const code = verificationRecord(s.id);
    const dns = fakeDns({
      txt: { "_zekerflex.bakkerij-jansen.nl": [code] },
      a: { "bakkerij-jansen.nl": [env.SITES_IPV4], "www.bakkerij-jansen.nl": [env.SITES_IPV4] },
      https: () => code,
    });
    const d = await checkDomain(s.id, by, dns);
    expect(d.verifiedAt).toBeTruthy();
    expect(d.activeAt).toBeTruthy();
    expect(d.check).toMatchObject({ txt: true, a: true, aaaa: true, alias: true, https: true, problem: null });
    expect(dns.httpsCalls).toEqual(["bakkerij-jansen.nl"]);
    expect(await mayIssueCertificate("bakkerij-jansen.nl")).toBe(true);
    expect(await mayIssueCertificate("WWW.bakkerij-jansen.nl")).toBe(true);
    expect((await siteForHost("www.bakkerij-jansen.nl"))?.primary).toBe("bakkerij-jansen.nl");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "site.domain.active" }));
  });

  it("een AAAA-regel naar een ander adres houdt het tegen, en https wordt niet geprobeerd", async () => {
    const s = await liveSite();
    await linkDomain(s.id, "bakkerij-jansen.nl", by);
    const dns = fakeDns({
      txt: { "bakkerij-jansen.nl": [verificationRecord(s.id)] },
      a: { "bakkerij-jansen.nl": [env.SITES_IPV4] },
      aaaa: { "bakkerij-jansen.nl": ["2001:db8::1"] },
    });
    const d = await checkDomain(s.id, by, dns);
    expect(d.verifiedAt).toBeTruthy(); // eigendom is wel bewezen
    expect(d.activeAt).toBeNull();
    expect(d.check?.problem).toMatch(/AAAA-regel/);
    expect(dns.httpsCalls).toEqual([]);
  });

  it("een oude A-regel naast de onze telt als nog niet goed", async () => {
    const s = await liveSite();
    await linkDomain(s.id, "bakkerij-jansen.nl", by);
    const d = await checkDomain(s.id, by, fakeDns({ txt: { "bakkerij-jansen.nl": [verificationRecord(s.id)] }, a: { "bakkerij-jansen.nl": [env.SITES_IPV4, "185.1.2.3"] } }));
    expect(d.check?.a).toBe(false);
    expect(d.check?.problem).toMatch(/wijst nog niet naar ZekerFlex/);
  });

  it("niet gepubliceerd: bewezen, maar nog geen certificaat", async () => {
    const s = await createSite("t1", by, { templateId: "algemeen", bedrijf });
    await linkDomain(s.id, "bakkerij-jansen.nl", by);
    const d = await checkDomain(s.id, by, fakeDns({ txt: { "bakkerij-jansen.nl": [verificationRecord(s.id)] }, a: { "bakkerij-jansen.nl": [env.SITES_IPV4] } }));
    expect(d.check?.problem).toMatch(/Publiceer/);
    expect(await mayIssueCertificate("bakkerij-jansen.nl")).toBe(false);
  });

  it("een domein dat al bij een andere website hoort, kan niet nog eens", async () => {
    const a = await liveSite("t1");
    const b = await liveSite("t2");
    await linkDomain(a.id, "bakkerij-jansen.nl", by);
    await checkDomain(a.id, by, fakeDns({ txt: { "bakkerij-jansen.nl": [verificationRecord(a.id)] } }));
    await expect(linkDomain(b.id, "bakkerij-jansen.nl", by)).rejects.toMatchObject({ status: 409 });
    expect(store.get("site-host:bakkerij-jansen.nl")).toBe(a.id);
  });

  it("loskoppelen of wisselen geeft de oude claims vrij", async () => {
    const s = await liveSite();
    await linkDomain(s.id, "bakkerij-jansen.nl", by);
    await checkDomain(s.id, by, fakeDns({ txt: { "bakkerij-jansen.nl": [verificationRecord(s.id)] } }));
    expect(store.has("site-host:www.bakkerij-jansen.nl")).toBe(true);
    await linkDomain(s.id, "jansen-brood.nl", by);
    expect(store.has("site-host:bakkerij-jansen.nl")).toBe(false);
    expect(store.has("site-host:www.bakkerij-jansen.nl")).toBe(false);
    expect((await getDomain(s.id))?.host).toBe("jansen-brood.nl");
    await unlinkDomain(s.id, by);
    expect(await getDomain(s.id)).toBeNull();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "site.domain.unlinked" }));
  });
});
