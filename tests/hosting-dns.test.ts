import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_HOSTING, type HostingConfig } from "@/lib/hosting/config";
import {
  desiredRecords,
  emptyResult,
  fqdn,
  parseMx,
  reconcile,
  txtFamily,
  type DesiredRecord,
} from "@/lib/hosting/dns/plan";
import { applyDnsToHetzner } from "@/lib/hosting/dns/hetzner";
import { resolveDnsProvider } from "@/lib/hosting/dns/providers";

function cfg(patch: (c: HostingConfig) => void): HostingConfig {
  const c = JSON.parse(JSON.stringify(DEFAULT_HOSTING)) as HostingConfig;
  c.api.provider = "Hetzner DNS";
  c.api.token = "tok";
  patch(c);
  return c;
}

describe("plan helpers", () => {
  it("fqdn: @ → apex, relatief → onder domein, al-fqdn blijft", () => {
    expect(fqdn("zekerflex.nl", "@")).toBe("zekerflex.nl");
    expect(fqdn("zekerflex.nl", "www")).toBe("www.zekerflex.nl");
    expect(fqdn("zekerflex.nl", "mail.zekerflex.nl")).toBe("mail.zekerflex.nl");
  });

  it("parseMx: priority + target", () => {
    expect(parseMx("10 mail.zekerflex.nl.")).toEqual({ priority: 10, target: "mail.zekerflex.nl" });
    expect(parseMx("mail.zekerflex.nl")).toEqual({ priority: 10, target: "mail.zekerflex.nl" });
  });

  it("txtFamily herkent v=-families en negeert de rest", () => {
    expect(txtFamily("v=spf1 mx -all")).toBe("v=spf1");
    expect(txtFamily('"v=DMARC1; p=reject"')).toBe("v=dmarc1");
    expect(txtFamily("google-site-verification=abc")).toBeNull();
  });

  it("desiredRecords neemt config-records + BIMI mee en slaat lege over", () => {
    const c = cfg((x) => {
      x.dns.records = [
        { type: "a", name: "", value: "1.2.3.4", ttl: "3600" },
        { type: "TXT", name: "@", value: "", ttl: "3600" }, // leeg → overgeslagen
      ];
      x.bimi.logoUrl = "https://zekerflex.nl/bimi-logo.svg";
    });
    const d = desiredRecords(c);
    expect(d.map((r) => r.label)).toEqual(["A @", "TXT default._bimi"]);
    expect(d[0]).toMatchObject({ type: "A", name: "@", ttl: 3600 });
  });
});

describe("reconcile — niet-destructief", () => {
  it("maakt aan, laat ongewijzigd met rust, isoleert fouten en verwijdert nooit", async () => {
    const desired: DesiredRecord[] = [
      { type: "A", name: "@", value: "1.1.1.1", ttl: 3600, label: "A @" },
      { type: "A", name: "www", value: "2.2.2.2", ttl: 3600, label: "A www" },
      { type: "A", name: "bad", value: "x", ttl: 3600, label: "A bad" },
    ];
    const existing = [{ key: "A@", value: "1.1.1.1" }];
    const created: string[] = [];
    const updated: string[] = [];

    const result = await reconcile(emptyResult("Test", "zone"), desired, existing, {
      findMatch: (d, ex) => ex.find((e) => e.key === `${d.type}${d.name}`),
      isUnchanged: (d, m) => m.value === d.value,
      create: async (d) => {
        if (d.name === "bad") throw new Error("boom");
        created.push(d.label);
      },
      update: async (d) => {
        updated.push(d.label);
      },
    });

    expect(result.unchanged).toEqual(["A @"]);
    expect(result.created).toEqual(["A www"]);
    expect(result.errors[0]).toContain("A bad: boom");
    expect(updated).toEqual([]);
  });
});

describe("resolveDnsProvider", () => {
  it("matcht op naam en geeft null voor onbekend/leeg", () => {
    expect(resolveDnsProvider("Cloudflare")?.id).toBe("cloudflare");
    expect(resolveDnsProvider("mijn Hetzner DNS account")?.id).toBe("hetzner");
    expect(resolveDnsProvider("")).toBeNull();
    expect(resolveDnsProvider("TransIP")).toBeNull();
  });
});

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}
function jsonRes(obj: unknown): Response {
  return { ok: true, status: 200, json: async () => obj } as unknown as Response;
}
function mockHetzner(records: unknown[]): Call[] {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const u = String(url);
    calls.push(body ? { method, url: u, body } : { method, url: u });
    if (u.includes("/zones?name=")) return jsonRes({ zones: [{ id: "z1", name: "zekerflex.nl" }] });
    if (u.includes("/records?zone_id=")) return jsonRes({ records });
    if (u.includes("/records")) return jsonRes({ record: { id: "new", ...(body ?? {}) } });
    return jsonRes({ error: { message: `onverwacht ${u}` } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("applyDnsToHetzner", () => {
  it("maakt ontbrekende records aan en raakt vreemde TXT's nooit aan", async () => {
    const calls = mockHetzner([
      { id: "r1", type: "A", name: "@", value: "1.2.3.4", ttl: 3600 },
      { id: "g1", type: "TXT", name: "@", value: "google-site-verification=abc", ttl: 3600 },
    ]);
    const c = cfg((x) => {
      x.dns.records = [
        { type: "A", name: "@", value: "1.2.3.4", ttl: "3600" },
        { type: "TXT", name: "@", value: "v=spf1 mx -all", ttl: "3600" },
        { type: "MX", name: "@", value: "10 mail.zekerflex.nl.", ttl: "3600" },
      ];
    });

    const result = await applyDnsToHetzner(c, "zekerflex.nl");

    expect(result.provider).toBe("Hetzner DNS");
    expect(result.unchanged).toContain("A @");
    expect(result.created).toEqual(expect.arrayContaining(["TXT @", "MX @"]));
    expect(calls.some((k) => k.method === "DELETE")).toBe(false);
    expect(calls.some((k) => k.url.includes("/records/g1"))).toBe(false);
    expect(calls.some((k) => k.method === "PUT")).toBe(false);

    const mx = calls.find((k) => k.method === "POST" && k.body?.type === "MX");
    expect(mx?.body).toMatchObject({ name: "@", value: "10 mail.zekerflex.nl.", zone_id: "z1" });
  });

  it("neemt het BIMI-record mee", async () => {
    const calls = mockHetzner([]);
    const c = cfg((x) => {
      x.bimi.enabled = true;
      x.bimi.logoUrl = "https://zekerflex.nl/bimi-logo.svg";
    });
    const result = await applyDnsToHetzner(c, "zekerflex.nl");
    expect(result.created).toContain("TXT default._bimi");
    const bimi = calls.find((k) => k.method === "POST" && k.body?.name === "default._bimi");
    expect(String(bimi?.body?.value)).toContain("v=BIMI1; l=https://zekerflex.nl/bimi-logo.svg");
  });
});
