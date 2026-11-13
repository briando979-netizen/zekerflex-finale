import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const sleutel = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { sleutel, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
});
vi.mock("@/lib/env", async () => ({ env: { TRANSIP_LOGIN: "zekerflex-test", TRANSIP_PRIVATE_KEY: (await h).sleutel } }));
vi.mock("@/lib/logger", async () => ({ logger: (await h).log }));

import { addDnsEntry } from "@/lib/mail/hosting/transip";
import { valideerDnsRecord, zelfdeRecord } from "@/lib/mail/hosting/dns-record";

const { log } = await h;

interface Aanroep {
  method: string;
  pad: string;
  body: unknown;
}

let aanroepen: Aanroep[];
let zone: { name: string; type: string; content: string; expire: number }[];
let domeinStaatInAccount: boolean;

const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });

beforeEach(() => {
  aanroepen = [];
  zone = [{ name: "@", type: "TXT", content: "v=spf1 include:_spf.transip.email ~all", expire: 3600 }];
  domeinStaatInAccount = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { method?: string; body?: string }) => {
      const pad = url.replace("https://api.transip.nl/v6", "");
      const method = init.method ?? "GET";
      aanroepen.push({ method, pad, body: init.body ? JSON.parse(init.body) : undefined });
      if (pad === "/auth") return json(201, { token: "geheim-token" });
      if (method === "GET" && /^\/domains\/[^/]+$/.test(pad)) return domeinStaatInAccount ? json(200, { domain: { name: "zekerflex.test" } }) : json(404, { error: "niet gevonden" });
      if (method === "GET" && pad.endsWith("/dns")) return json(200, { dnsEntries: zone });
      if (method === "POST" && pad.endsWith("/dns")) return new Response(null, { status: 201 });
      return json(500, { error: "onverwacht" });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const dmarc = { name: "_dmarc", type: "TXT", content: "v=DMARC1; p=none; rua=mailto:postmaster@zekerflex.test" };
const naAuth = () => aanroepen.filter((a) => a.pad !== "/auth");

describe("addDnsEntry", () => {
  it("voegt één record toe met POST en de juiste vorm", async () => {
    await expect(addDnsEntry("zekerflex.test", dmarc)).resolves.toBe("toegevoegd");
    const posts = naAuth().filter((a) => a.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.pad).toBe("/domains/zekerflex.test/dns");
    expect(posts[0]!.body).toEqual({ dnsEntry: { name: "_dmarc", expire: 3600, type: "TXT", content: dmarc.content } });
  });

  it("gebruikt nooit PUT of DELETE", async () => {
    await addDnsEntry("zekerflex.test", dmarc);
    expect(aanroepen.some((a) => a.method === "PUT" || a.method === "DELETE")).toBe(false);
  });

  it("controleert eerst met GET en doet niets als het record er al staat (idempotent)", async () => {
    zone.push({ name: "_dmarc", type: "TXT", content: `"${dmarc.content}"`, expire: 300 });
    await expect(addDnsEntry("zekerflex.test", { ...dmarc, name: "_DMARC" })).resolves.toBe("bestond-al");
    expect(naAuth().some((a) => a.method === "POST")).toBe(false);
    expect(naAuth().some((a) => a.method === "GET" && a.pad.endsWith("/dns"))).toBe(true);
  });

  it("voegt wel toe als alleen de inhoud verschilt", async () => {
    zone.push({ name: "_dmarc", type: "TXT", content: "v=DMARC1; p=reject", expire: 3600 });
    await expect(addDnsEntry("zekerflex.test", dmarc)).resolves.toBe("toegevoegd");
  });

  it("weigert een domein dat niet in ons account staat, zonder te schrijven", async () => {
    domeinStaatInAccount = false;
    await expect(addDnsEntry("vreemd.test", dmarc)).rejects.toThrow(/niet in het TransIP-account/);
    expect(naAuth().some((a) => a.method === "POST")).toBe(false);
  });

  it("weigert een leeg of ongeldig domein, lege naam of inhoud en onbekende typen, zonder één aanroep", async () => {
    await expect(addDnsEntry("", dmarc)).rejects.toThrow();
    await expect(addDnsEntry("geen domein", dmarc)).rejects.toThrow();
    await expect(addDnsEntry("zekerflex.test", { ...dmarc, name: "  " })).rejects.toThrow(/leeg/);
    await expect(addDnsEntry("zekerflex.test", { ...dmarc, content: "" })).rejects.toThrow(/leeg/);
    await expect(addDnsEntry("zekerflex.test", { ...dmarc, type: "NS" })).rejects.toThrow(/niet toegestaan/);
    await expect(addDnsEntry("zekerflex.test", { ...dmarc, type: "SOA" })).rejects.toThrow(/niet toegestaan/);
    expect(aanroepen).toHaveLength(0);
  });

  it("logt geen token en geen antwoord", async () => {
    await addDnsEntry("zekerflex.test", dmarc);
    const alles = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls]);
    expect(alles).not.toContain("geheim-token");
    expect(alles).not.toContain("v=DMARC1");
  });
});

describe("valideerDnsRecord", () => {
  it("staat alleen TXT, CNAME, A, AAAA en MX toe (ook in kleine letters)", () => {
    for (const type of ["TXT", "cname", "A", "aaaa", "MX"]) {
      expect(valideerDnsRecord({ name: "www", type, content: "x" }).ok).toBe(true);
    }
    for (const type of ["NS", "SOA", "SRV", "CAA", "", 5]) {
      expect(valideerDnsRecord({ name: "www", type, content: "x" }).ok).toBe(false);
    }
  });
  it("neemt TTL 3600 als niets is opgegeven en weigert een rare TTL", () => {
    const r = valideerDnsRecord({ name: "@", type: "A", content: "192.0.2.1" });
    expect(r.ok && r.record.expire).toBe(3600);
    expect(valideerDnsRecord({ name: "@", type: "A", content: "192.0.2.1", expire: 5 }).ok).toBe(false);
    expect(valideerDnsRecord({ name: "@", type: "A", content: "192.0.2.1", expire: 1.5 }).ok).toBe(false);
  });
  it("weigert stuurtekens in de inhoud en rare namen", () => {
    expect(valideerDnsRecord({ name: "@", type: "TXT", content: "a\nb" }).ok).toBe(false);
    expect(valideerDnsRecord({ name: "a b", type: "TXT", content: "x" }).ok).toBe(false);
    expect(valideerDnsRecord({ name: "_dmarc", type: "TXT", content: "x" }).ok).toBe(true);
  });
});

describe("zelfdeRecord", () => {
  it("negeert hoofdletters in de naam en aanhalingstekens rond TXT", () => {
    expect(zelfdeRecord({ name: "_DMARC", type: "txt", content: '"v=DMARC1"' }, { name: "_dmarc", type: "TXT", content: "v=DMARC1" })).toBe(true);
    expect(zelfdeRecord({ name: "a", type: "TXT", content: "x" }, { name: "a", type: "CNAME", content: "x" })).toBe(false);
  });
});
