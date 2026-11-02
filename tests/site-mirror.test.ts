import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Website-verhuizer: een kopie van de eigen site van een klant, met dezelfde
// uitstraling maar verbeterd, getoond in een afgeschermde sandbox.

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvListValues: async () => [],
}));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));

let sitesDir = "";
beforeAll(async () => {
  sitesDir = await mkdtemp(path.join(tmpdir(), "zf-sites-"));
  process.env.SITE_MIRROR_DIR = sitesDir;
});
afterAll(async () => {
  await rm(sitesDir, { recursive: true, force: true });
});

const mirror = await import("@/lib/website/mirror");
const verify = await import("@/lib/website/verify");
const { buildContentSecurityPolicy } = await import("@/lib/security/csp");

describe("paden in de kopie", () => {
  it("zet pagina's en bestanden op een vaste plek", () => {
    expect(mirror.localPathFor(new URL("https://bakkerij.nl/"), true)).toBe("index.html");
    expect(mirror.localPathFor(new URL("https://bakkerij.nl/over-ons"), true)).toBe("over-ons/index.html");
    expect(mirror.localPathFor(new URL("https://bakkerij.nl/contact.php"), true)).toBe("contact.php");
    expect(mirror.localPathFor(new URL("https://bakkerij.nl/css/site.css?ver=6.4"), false)).toBe("css/site.css");
    expect(mirror.localPathFor(new URL("https://bakkerij.nl/beeld.php?id=3"), false, "image/jpeg")).toMatch(/^beeld\.php__[a-f0-9]{8}\.jpg$/);
    // nooit buiten de map
    expect(mirror.localPathFor(new URL("https://bakkerij.nl/../../etc/passwd"), false)).toBe("etc/passwd");
  });
});

const PAGE = `<!doctype html><html><head><title>Bakkerij Jansen</title>
<meta name="generator" content="WordPress 6.4.2">
<base href="https://bakkerij.nl/">
<link rel="stylesheet" href="https://bakkerij.nl/css/site.css?ver=6.4">
<link rel="icon" href="/favicon.ico">
<script src="http://bakkerij.nl/js/app.js"></script>
<script src="https://cdn.voorbeeld.com/lib.js"></script>
<style>.hero{background:url('/img/hero.jpg')}</style>
</head><body>
<img src="/img/logo.png" alt="Logo"><img src="img/brood.jpg" srcset="/img/brood.jpg 1x, /img/brood@2x.jpg 2x"><img src="http://plaatjes.example.org/x.png">
<p>Elke ochtend vers brood, gebak en taarten uit eigen oven, gebakken door onze bakkers in Utrecht.</p>
<a href="/over-ons">Over ons</a><a href="https://www.bakkerij.nl/contact">Contact</a><a href="https://instagram.com/bakkerij">Insta</a>
<form method="post" class="wpcf7-form"><input name="naam"></form>
</body></html>`;

describe("ophalen, omschrijven en verbeteren", () => {
  it("vindt alle bestanden die de pagina laadt", () => {
    const found = mirror.discoverAssets(PAGE);
    expect(found).toEqual(expect.arrayContaining(["https://bakkerij.nl/css/site.css?ver=6.4", "/favicon.ico", "http://bakkerij.nl/js/app.js", "/img/hero.jpg", "/img/logo.png", "img/brood.jpg", "/img/brood@2x.jpg"]));
  });

  it("schrijft verwijzingen naar de eigen site om naar de kopie, de rest blijft", () => {
    const base = new URL("https://bakkerij.nl/");
    const map = new Map<string, string>([
      ["bakkerij.nl/", "/"],
      ["bakkerij.nl/css/site.css?ver=6.4", "/css/site.css"],
      ["bakkerij.nl/js/app.js", "/js/app.js"],
      ["bakkerij.nl/img/logo.png", "/img/logo.png"],
      ["bakkerij.nl/img/brood.jpg", "/img/brood.jpg"],
      ["bakkerij.nl/img/brood@2x.jpg", "/img/brood@2x.jpg"],
      ["bakkerij.nl/img/hero.jpg", "/img/hero.jpg"],
      ["bakkerij.nl/over-ons", "/over-ons/"],
      ["bakkerij.nl/contact", "/contact/"],
    ]);
    const counters = { httpsFixed: 0, missing: 0 };
    const out = mirror.rewriteRefs(PAGE, base, map, "bakkerij.nl", counters, "html");
    expect(out).toContain('href="/css/site.css"');
    expect(out).toContain('src="/js/app.js"');
    expect(out).toContain('srcset="/img/brood.jpg 1x, /img/brood@2x.jpg 2x"');
    expect(out).toContain("url('/img/hero.jpg')");
    expect(out).toContain('href="/contact/"');
    expect(out).toContain('src="https://cdn.voorbeeld.com/lib.js"');
    expect(out).toContain('href="https://instagram.com/bakkerij"');
    // onveilige externe afbeelding naar https, en het eigen http-script ook gerepareerd
    expect(out).toContain('src="https://plaatjes.example.org/x.png"');
    expect(counters.httpsFixed).toBe(2);
    // favicon zat niet in de kopie: wijst naar de originele site
    expect(out).toContain('href="https://bakkerij.nl/favicon.ico"');
    expect(counters.missing).toBe(1);
  });

  it("verbetert zonder het uiterlijk te veranderen", () => {
    const up = { lazyImages: 0, imagesCompressed: 0, bytesSaved: 0, httpsFixed: 0, viewportAdded: 0, langAdded: 0, descriptionAdded: 0, socialAdded: 0, canonicalAdded: 0, generatorRemoved: 0, sitemapAdded: false };
    const out = mirror.upgradeHtml(PAGE, { canonical: "https://bakkerij.nl/", ogImage: "https://bakkerij.nl/img/logo.png" }, up);
    expect(out).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(out).toContain('<html lang="nl">');
    expect(out).toContain('<meta name="description" content="Elke ochtend vers brood');
    expect(out).toContain('<meta property="og:image" content="https://bakkerij.nl/img/logo.png">');
    expect(out).toContain('<link rel="canonical" href="https://bakkerij.nl/">');
    expect(out).not.toContain("generator");
    expect(out).not.toContain("<base");
    // eerste twee afbeeldingen direct, de derde pas bij scrollen
    expect(out.match(/loading="lazy"/g)).toHaveLength(1);
    expect(up).toMatchObject({ viewportAdded: 1, langAdded: 1, descriptionAdded: 1, socialAdded: 1, canonicalAdded: 1, generatorRemoved: 1, lazyImages: 1 });
  });

  it("noemt wat in een statische kopie niet vanzelf werkt", () => {
    expect(mirror.detectDynamic(PAGE).join(" ")).toContain("Contactformulier");
    expect(mirror.detectDynamic("<p>alleen tekst</p>")).toEqual([]);
  });
});

describe("voorbeeld tonen", () => {
  it("zet het voorbeeld-pad voor verwijzingen vanaf de root, niet voor andere sites", () => {
    const html = '<link href="/css/a.css"><img src="/img/b.png" srcset="/img/b.png 1x, /img/c.png 2x"><a href="//cdn.x.nl/y">x</a><div style="background:url(/img/d.jpg)"></div>';
    const out = mirror.prefixRootRefs(html, "/website-preview/abc", "html");
    expect(out).toContain('href="/website-preview/abc/css/a.css"');
    expect(out).toContain('srcset="/website-preview/abc/img/b.png 1x, /website-preview/abc/img/c.png 2x"');
    expect(out).toContain('href="//cdn.x.nl/y"');
    expect(out).toContain("url(/website-preview/abc/img/d.jpg)");
  });

  it("vindt bestanden in de kopie, maar nooit daarbuiten", async () => {
    const id = "0123456789abcdef";
    const root = mirror.mirrorDir(id);
    await mkdir(path.join(root, "over-ons"), { recursive: true });
    await writeFile(path.join(root, "index.html"), "<p>home</p>");
    await writeFile(path.join(root, "over-ons", "index.html"), "<p>over</p>");
    await writeFile(path.join(sitesDir, "geheim.txt"), "niet tonen");
    expect((await mirror.resolveMirrorFile(id, []))?.file).toBe(path.join(root, "index.html"));
    expect((await mirror.resolveMirrorFile(id, ["over-ons"]))?.type).toBe("text/html; charset=utf-8");
    expect(await mirror.resolveMirrorFile(id, ["..", "..", "geheim.txt"])).toBeNull();
    expect(await mirror.resolveMirrorFile(id, ["%2e%2e", "geheim.txt"])).toBeNull();
    expect(await mirror.resolveMirrorFile("../etc", ["passwd"])).toBeNull();
  });

  it("het voorbeeld draait altijd in een sandbox zonder toegang tot zekerflex.com", () => {
    const csp = buildContentSecurityPolicy({ dev: false, nonce: "n", pathname: "/website-preview/0123456789abcdef/" });
    expect(csp).toMatch(/^sandbox allow-scripts/);
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("form-action 'none'");
    expect(buildContentSecurityPolicy({ dev: false, nonce: "n", pathname: "/website-check" })).not.toContain("sandbox");
  });
});

describe("eigendomsbewijs", () => {
  it("leest het domein uit wat de klant invulde", () => {
    expect(verify.hostOf("https://www.Bakkerij.nl/contact")).toBe("www.bakkerij.nl");
    expect(verify.hostOf("bakkerij.nl")).toBe("bakkerij.nl");
    expect(verify.hostOf("geen domein")).toBeNull();
    expect(verify.hostOf("")).toBeNull();
  });

  it("accepteert alleen de juiste TXT-regel en alleen voor dat domein", async () => {
    const record = verify.verificationRecord("site_1");
    const lookup = vi.fn(async (name: string) => (name === "bakkerij.nl" ? [["v=spf1 -all"], [record.slice(0, 10), record.slice(10)]] : []));
    expect((await verify.checkDnsVerification("site_1", "www.bakkerij.nl", lookup)).ok).toBe(true);
    expect(await verify.getVerification("site_1", "https://bakkerij.nl")).toMatchObject({ method: "dns" });
    // ander domein ingevuld: het bewijs geldt niet meer
    expect(await verify.getVerification("site_1", "slagerij.nl")).toBeNull();
    // de code van een andere klant telt niet
    expect((await verify.checkDnsVerification("site_2", "bakkerij.nl", lookup)).ok).toBe(false);
  });
});
