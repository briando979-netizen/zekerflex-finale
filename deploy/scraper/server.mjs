// De browser-werker van ZekerFlex (deploy/scraper): een kleine HTTP-dienst om
// een headless Chromium (Playwright) heen. De app (lib/bronnen/scraper.ts)
// vraagt:
//   POST /schermafdruk  { url, breedte?, hoogte?, wachtMs? }
//        → { status, titel, ms, png (base64), dominant }  dominant = aandeel van
//          de meest voorkomende kleur in een steekproef (≈1 = leeg scherm)
//   POST /tekst         { url, selectors: ["h1", ".prijs"] }
//        → { status, titel, ms, teksten: { "h1": ["…"], … } }
//   GET  /gezond        → { ok: true }
// Elk verzoek heeft de kop x-scraper-token nodig. Eén browser, maximaal twee
// pagina's tegelijk, elke pagina een eigen context (geen cookies over en weer),
// en alleen http(s) naar publieke adressen: het interne netwerk is afgeschermd.
import http from "node:http";
import { isIP } from "node:net";
import { promises as dns } from "node:dns";
import { chromium } from "playwright";

const POORT = Number(process.env.PORT || 4300);
const TOKEN = process.env.SCRAPER_TOKEN || "";
const MAX_TEGELIJK = 2;
const MAX_MS = 45_000;
if (!TOKEN) {
  console.error("[scraper] SCRAPER_TOKEN ontbreekt: de dienst doet niets");
}

let browser = null;
let bezig = 0;
const wachtrij = [];

async function haalBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  return browser;
}

/** Een slot: maximaal MAX_TEGELIJK pagina's tegelijk. */
function slot() {
  return new Promise((los) => {
    const probeer = () => {
      if (bezig < MAX_TEGELIJK) {
        bezig++;
        los(() => {
          bezig--;
          const volgende = wachtrij.shift();
          if (volgende) volgende();
        });
      } else wachtrij.push(probeer);
    };
    probeer();
  });
}

const PRIVE = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const privaat = (ip) => ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80") || ip.startsWith("::ffff:127.") || PRIVE.some((r) => r.test(ip));

/** Alleen http(s) op 80/443 naar een publiek adres; de naam wordt hier al opgezocht. */
async function controleerUrl(raw) {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("alleen http(s)");
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("alleen poort 80/443");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("intern adres");
  const adressen = isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!adressen.length || adressen.some(privaat)) throw new Error("intern of privé adres");
  return u.toString();
}

/** Aandeel van de meest voorkomende kleur in een steekproef van de PNG (via een canvas in de pagina zelf). */
async function dominant(page, png) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await new Promise((r) => {
      img.onload = r;
      img.onerror = r;
    });
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(img, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    const tel = new Map();
    for (let i = 0; i < d.length; i += 4) {
      // grof afronden: een lichte schaduw telt nog als dezelfde kleur
      const k = `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
      tel.set(k, (tel.get(k) || 0) + 1);
    }
    return Math.max(...tel.values()) / (d.length / 4);
  }, png);
}

async function metPagina(url, breedte, hoogte, werk) {
  const vrij = await slot();
  const b = await haalBrowser();
  const ctx = await b.newContext({ viewport: { width: breedte, height: hoogte }, userAgent: "Mozilla/5.0 (X11; Linux x86_64) ZekerFlexSchermcontrole/1.0 (+https://zekerflex.com)", locale: "nl-NL" });
  const page = await ctx.newPage();
  const start = Date.now();
  try {
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: MAX_MS }).catch(() => page.goto(url, { waitUntil: "load", timeout: MAX_MS }));
    const status = res ? res.status() : 0;
    const uit = await werk(page, status);
    return { ...uit, status, titel: (await page.title().catch(() => "")).slice(0, 120), ms: Date.now() - start };
  } finally {
    await ctx.close().catch(() => {});
    vrij();
  }
}

async function lees(req) {
  const delen = [];
  for await (const d of req) {
    delen.push(d);
    if (Buffer.concat(delen).length > 64_000) throw new Error("te groot");
  }
  return delen.length ? JSON.parse(Buffer.concat(delen).toString("utf8")) : {};
}

const server = http.createServer(async (req, res) => {
  const antwoord = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "GET" && req.url === "/gezond") return antwoord(200, { ok: true, bezig });
    if (!TOKEN || req.headers["x-scraper-token"] !== TOKEN) return antwoord(401, { fout: "geen toegang" });
    if (req.method !== "POST") return antwoord(405, { fout: "alleen POST" });
    const body = await lees(req);
    const url = await controleerUrl(String(body.url || ""));
    const breedte = Math.min(1920, Math.max(320, Number(body.breedte) || 1280));
    const hoogte = Math.min(2000, Math.max(400, Number(body.hoogte) || 900));
    if (req.url === "/schermafdruk") {
      const wachtMs = Math.min(10_000, Math.max(0, Number(body.wachtMs) || 800));
      const uit = await metPagina(url, breedte, hoogte, async (page) => {
        await page.waitForTimeout(wachtMs);
        const png = (await page.screenshot({ type: "png", fullPage: false })).toString("base64");
        return { png, dominant: await dominant(page, png).catch(() => 0) };
      });
      return antwoord(200, uit);
    }
    if (req.url === "/tekst") {
      const selectors = Array.isArray(body.selectors) ? body.selectors.slice(0, 20).map(String) : [];
      const uit = await metPagina(url, breedte, hoogte, async (page) => {
        const teksten = {};
        for (const s of selectors) {
          teksten[s] = (await page.locator(s).allInnerTexts().catch(() => [])).slice(0, 50).map((t) => t.trim().slice(0, 2000));
        }
        return { teksten };
      });
      return antwoord(200, uit);
    }
    return antwoord(404, { fout: "onbekend pad" });
  } catch (e) {
    return antwoord(500, { fout: String(e && e.message ? e.message : e).slice(0, 300) });
  }
});

server.listen(POORT, "0.0.0.0", () => console.log(`[scraper] klaar op :${POORT}`));
for (const s of ["SIGTERM", "SIGINT"]) {
  process.on(s, async () => {
    await browser?.close().catch(() => {});
    process.exit(0);
  });
}
