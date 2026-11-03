import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// De website op het eigen domein: alleen via Caddy's kop, www stuurt door,
// zoekmachines mogen hem zien, het contactformulier werkt, /site/<naam> stuurt
// door zodra het domein actief is, en Caddy's vraag krijgt alleen ja voor een
// bewezen domein van een gepubliceerde site.

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
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: async () => undefined, privateRateLimitIdentifier: (s: string) => s }));
const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));

import { createSite, publishSite } from "@/lib/sites/store";
import { checkDomain, linkDomain, verificationRecord } from "@/lib/sites/domain";
import { env } from "@/lib/env";
import * as own from "@/app/site-domein/[host]/[[...path]]/route";
import * as onZekerflex from "@/app/site/[slug]/[[...path]]/route";
import { GET as ask } from "@/app/api/sites/domein-check/route";

const HOST = "bakkerij-jansen.nl";
const by = { userId: "u1", name: "Jan" };
const bedrijf = { naam: "Bakkerij Jansen", kvk: "12345678", straat: "", postcode: "", plaats: "Rijssen", telefoon: "", email: "info@bakkerij-jansen.nl" };

let siteId = "";
let slug = "";

async function activeSite() {
  const s = await createSite("t1", by, { templateId: "algemeen", bedrijf });
  await publishSite(s.id, by);
  await linkDomain(s.id, HOST, by);
  const code = verificationRecord(s.id);
  await checkDomain(s.id, by, {
    txt: async (n) => (n === `_zekerflex.${HOST}` ? [[code]] : []),
    a: async () => [env.SITES_IPV4],
    aaaa: async () => [],
    https: async () => code,
  });
  siteId = s.id;
  slug = s.slug;
}

const req = (url: string, init: RequestInit & { site?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.site) headers.set("x-zf-site-host", init.site);
  return new Request(url, { ...init, headers });
};
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(async () => {
  store.clear();
  sendMail.mockClear();
  await activeSite();
});

describe("website op het eigen domein", () => {
  it("bestaat alleen via Caddy's kop: /site-domein/… intypen op zekerflex.com geeft niets", async () => {
    expect((await own.GET(req(`https://zekerflex.com/site-domein/${HOST}`), params({ host: HOST }))).status).toBe(404);
    expect((await own.GET(req(`https://zekerflex.com/site-domein/${HOST}`, { site: "ander.nl" }), params({ host: HOST }))).status).toBe(404);
  });

  it("toont de homepage met het eigen domein als vast adres, en zoekmachines mogen hem zien", async () => {
    const res = await own.GET(req(`https://${HOST}/`, { site: HOST }), params({ host: HOST }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`rel="canonical" href="https://${HOST}/"`);
    expect(html).not.toContain('name="robots"');
    expect(html).toContain('href="/contact"');
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
    expect(res.headers.get("Content-Security-Policy")).toContain(`https://${HOST}`);
    const contact = await (await own.GET(req(`https://${HOST}/contact`, { site: HOST }), params({ host: HOST, path: ["contact"] }))).text();
    expect(contact).toContain('action="/_zf/contact"');
  });

  it("www stuurt door naar het gekozen adres, met pad en zoekterm", async () => {
    const res = await own.GET(req(`https://www.${HOST}/contact?x=1`, { site: `www.${HOST}` }), params({ host: `www.${HOST}`, path: ["contact"] }));
    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe(`https://${HOST}/contact?x=1`);
  });

  it("robots.txt laat zoekmachines toe en wijst naar de sitemap op het eigen domein", async () => {
    const res = await own.GET(req(`https://${HOST}/robots.txt`, { site: HOST }), params({ host: HOST, path: ["robots.txt"] }));
    const body = await res.text();
    expect(body).toContain("Allow: /");
    expect(body).toContain(`Sitemap: https://${HOST}/sitemap.xml`);
  });

  it("beantwoordt de https-controle met de code van deze site", async () => {
    const res = await own.GET(req(`https://${HOST}/.well-known/zekerflex-site`, { site: HOST }), params({ host: HOST, path: [".well-known", "zekerflex-site"] }));
    expect(await res.text()).toBe(verificationRecord(siteId));
  });

  it("een domein dat niet gekoppeld is, legt uit wat er mis is", async () => {
    const res = await own.GET(req("https://vreemd.nl/", { site: "vreemd.nl" }), params({ host: "vreemd.nl" }));
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/Koppel het in ZekerFlex/);
  });

  it("het contactformulier bewaart het bericht en gaat naar /bedankt op het eigen domein", async () => {
    const form = new FormData();
    form.set("naam", "Piet");
    form.set("email", "piet@example.nl");
    form.set("bericht", "Hebben jullie morgen krentenbollen?");
    const res = await own.POST(req(`https://${HOST}/_zf/contact`, { method: "POST", body: form, site: HOST }), params({ host: HOST, path: ["_zf", "contact"] }));
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/bedankt");
    expect([...store.keys()].some((k) => k.startsWith(`site-contact:${siteId}:`))).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "info@bakkerij-jansen.nl", text: expect.stringContaining(`https://${HOST}`) }));
  });

  it("/site/<naam> stuurt door naar het eigen domein zodra dat actief is", async () => {
    const res = await onZekerflex.GET(req(`https://zekerflex.com/site/${slug}/contact`), params({ slug, path: ["contact"] }));
    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe(`https://${HOST}/contact`);
  });
});

describe("Caddy's vraag om een certificaat", () => {
  it("ja voor het bewezen domein en www, nee voor iets anders", async () => {
    const status = async (d: string) => (await ask(new Request(`http://app:3000/api/sites/domein-check?domain=${encodeURIComponent(d)}`))).status;
    expect(await status(HOST)).toBe(200);
    expect(await status(`www.${HOST}`)).toBe(200);
    expect(await status("vreemd.nl")).toBe(404);
    expect(await status("")).toBe(404);
    expect(await status("bakkerij-jansen.nl;rm -rf")).toBe(404);
  });
});
