import { afterEach, describe, expect, it, vi } from "vitest";
import { applyDnsToCloudflare } from "@/lib/hosting/cloudflare";
import { DEFAULT_HOSTING, type HostingConfig } from "@/lib/hosting/config";

function cfg(patch: (c: HostingConfig) => void): HostingConfig {
  const c = JSON.parse(JSON.stringify(DEFAULT_HOSTING)) as HostingConfig;
  c.api.provider = "Cloudflare";
  c.api.token = "tok";
  patch(c);
  return c;
}

interface CfExisting {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number;
}
interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

function jsonRes(obj: unknown): Response {
  return { ok: true, status: 200, json: async () => obj } as unknown as Response;
}

function mockCloudflare(existing: CfExisting[]): Call[] {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const u = String(url);
    calls.push(body ? { method, url: u, body } : { method, url: u });
    if (u.includes("/zones?name=")) return jsonRes({ success: true, result: [{ id: "zone1", name: "zekerflex.nl" }] });
    if (u.includes("/dns_records?per_page")) return jsonRes({ success: true, result: existing });
    if (u.includes("/dns_records")) return jsonRes({ success: true, result: { id: "new", ...(body ?? {}) } });
    return jsonRes({ success: false, errors: [{ message: `onverwacht ${u}` }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("applyDnsToCloudflare", () => {
  it("maakt ontbrekende records aan, laat ongewijzigde met rust, en raakt vreemde records nooit aan", async () => {
    const calls = mockCloudflare([
      { id: "a1", type: "A", name: "zekerflex.nl", content: "1.2.3.4", ttl: 3600 },
      { id: "g1", type: "TXT", name: "zekerflex.nl", content: "google-site-verification=abc", ttl: 3600 },
    ]);
    const c = cfg((x) => {
      x.dns.records = [
        { type: "A", name: "@", value: "1.2.3.4", ttl: "3600" },
        { type: "TXT", name: "@", value: "v=spf1 mx -all", ttl: "3600" },
        { type: "MX", name: "@", value: "10 mail.zekerflex.nl.", ttl: "3600" },
      ];
    });

    const result = await applyDnsToCloudflare(c, "zekerflex.nl");

    expect(result.zone).toBe("zekerflex.nl");
    expect(result.provider).toBe("Cloudflare");
    expect(result.unchanged).toContain("A @");
    expect(result.created).toEqual(expect.arrayContaining(["TXT @", "MX @"]));
    expect(result.errors).toHaveLength(0);

    // Niet-destructief: nooit een DELETE, en de Google-verificatie-TXT (g1) nooit aangeraakt.
    expect(calls.some((k) => k.method === "DELETE")).toBe(false);
    expect(calls.some((k) => k.url.includes("/dns_records/g1"))).toBe(false);
    // De A stond al goed → geen PUT.
    expect(calls.some((k) => k.method === "PUT")).toBe(false);
  });

  it("parseert MX naar content + priority", async () => {
    const calls = mockCloudflare([]);
    const c = cfg((x) => {
      x.dns.records = [{ type: "MX", name: "@", value: "10 mail.zekerflex.nl.", ttl: "3600" }];
    });
    await applyDnsToCloudflare(c, "zekerflex.nl");
    const mx = calls.find((k) => k.method === "POST" && k.body?.type === "MX");
    expect(mx?.body).toMatchObject({ content: "mail.zekerflex.nl", priority: 10, name: "zekerflex.nl" });
  });

  it("werkt een record bij als de inhoud is gewijzigd", async () => {
    const calls = mockCloudflare([{ id: "a1", type: "A", name: "zekerflex.nl", content: "9.9.9.9", ttl: 3600 }]);
    const c = cfg((x) => {
      x.dns.records = [{ type: "A", name: "@", value: "1.2.3.4", ttl: "3600" }];
    });
    const result = await applyDnsToCloudflare(c, "zekerflex.nl");
    expect(result.updated).toContain("A @");
    expect(calls.some((k) => k.method === "PUT" && k.url.includes("/dns_records/a1"))).toBe(true);
  });

  it("neemt het BIMI-record automatisch mee", async () => {
    const calls = mockCloudflare([]);
    const c = cfg((x) => {
      x.bimi.enabled = true;
      x.bimi.logoUrl = "https://zekerflex.nl/bimi-logo.svg";
    });
    const result = await applyDnsToCloudflare(c, "zekerflex.nl");
    expect(result.created).toContain("TXT default._bimi");
    const bimi = calls.find((k) => k.method === "POST" && k.body?.name === "default._bimi.zekerflex.nl");
    expect(String(bimi?.body?.content)).toContain("v=BIMI1; l=https://zekerflex.nl/bimi-logo.svg");
  });

  it("dry-run schrijft niets maar classificeert wel", async () => {
    const calls = mockCloudflare([{ id: "a1", type: "A", name: "zekerflex.nl", content: "9.9.9.9", ttl: 3600 }]);
    const c = cfg((x) => {
      x.dns.records = [
        { type: "A", name: "@", value: "1.2.3.4", ttl: "3600" }, // gewijzigd → updated (voorbeeld)
        { type: "TXT", name: "@", value: "v=spf1 -all", ttl: "3600" }, // nieuw → created (voorbeeld)
      ];
    });
    const result = await applyDnsToCloudflare(c, "zekerflex.nl", { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.updated).toContain("A @");
    expect(result.created).toContain("TXT @");
    expect(calls.some((k) => k.method === "POST" || k.method === "PUT")).toBe(false);
  });

  it("geeft een duidelijke fout als de zone niet bestaat", async () => {
    const fetchMock = vi.fn(async (): Promise<Response> => jsonRes({ success: true, result: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const c = cfg(() => {});
    await expect(applyDnsToCloudflare(c, "zekerflex.nl")).rejects.toThrow(/Geen Cloudflare-zone/);
  });
});
