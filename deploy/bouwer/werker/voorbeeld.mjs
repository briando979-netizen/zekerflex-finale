// Live voorbeeld van de werkkopie: `next dev` op een wegwerp-database met alleen
// demogegevens (service bouwer-db, eigen afgesloten netwerk), bereikbaar via Caddy
// op BOUWER_VOORBEELD_HOST → de proxy hieronder (poort 4200). Toegang alleen met
// een getekende link uit Admin (HMAC met BOUWER_TOKEN, 2 uur geldig) → cookie.
// Stopt vanzelf na 30 minuten zonder bezoek, en altijd vóór een nieuwe opdracht
// (geheugen: tsc en next dev samen passen niet in de 3 GB van deze container).
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_DIR, WERK, omgevingZonderSleutel, sh, wachtOpUitrol } from "./werkkopie.mjs";

const DB = process.env.BOUWER_VOORBEELD_DB || "";
const REDIS = process.env.BOUWER_VOORBEELD_REDIS || "";
const HOST = process.env.BOUWER_VOORBEELD_HOST || "";
const TOKEN = process.env.BOUWER_TOKEN || "";
const DEV_POORT = 3200;
const PROXY_POORT = Number(process.env.BOUWER_VOORBEELD_POORT || 4200);
const STIL_MS = 30 * 60_000;
// per containerstart: sessies uit het voorbeeld gelden nergens anders
const GEHEIM = randomBytes(32).toString("hex");

/** @type {import("node:child_process").ChildProcess | null} */
let proces = null;
let stand = { staat: "uit", sinds: null, fout: null, regels: [] };
let laatsteBezoek = 0;

function regel(tekst) {
  for (const r of String(tekst).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split("\n")) {
    if (r.trim()) stand.regels.push(r.slice(0, 300));
  }
  if (stand.regels.length > 80) stand.regels.splice(0, stand.regels.length - 80);
}

export function voorbeeldBeschikbaar() {
  return Boolean(DB && HOST && TOKEN.length >= 24);
}

export function voorbeeldStand() {
  return { staat: stand.staat, sinds: stand.sinds, fout: stand.fout, regels: stand.regels.slice(-30), host: HOST, beschikbaar: voorbeeldBeschikbaar() };
}

function voorbeeldEnv() {
  return {
    DATABASE_URL: DB,
    DATABASE_URL_UNPOOLED: DB,
    REDIS_URL: REDIS || "redis://127.0.0.1:6399",
    AUTH_SECRET: GEHEIM,
    AUTH_URL: `https://${HOST}`,
    APP_BASE_URL: `https://${HOST}`,
    AUTH_TRUST_HOST: "true",
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

/** Demogegevens één keer zaaien, en opnieuw als de migraties veranderden. */
async function zaaiAlsNodig(env) {
  const migraties = (await fs.readdir(path.join(REPO_DIR, "prisma", "migrations")).catch(() => [])).sort().join(",");
  const merk = createHash("sha256").update(migraties).digest("hex");
  const merkBestand = path.join(WERK, "voorbeeld-zaad.hash");
  if ((await fs.readFile(merkBestand, "utf8").catch(() => "")) === merk) return;
  regel("Demogegevens zaaien (eenmalig)");
  // de database is een losse demo-container: het zaadscript mag hier bewust op een niet-lokale host
  const zaad = await sh("npx", ["ts-node", "--compiler-options", '{"module":"commonjs"}', "prisma/seed.ts"], {
    env: { ...env, SEED_ALLOW_REMOTE: "yes-i-am-sure" },
    timeout: 600_000,
    zonderSleutel: true,
  });
  regel(zaad.uit.split("\n").slice(-6).join("\n"));
  if (zaad.code !== 0) throw new Error("Demogegevens zaaien mislukte");
  const diensten = await sh("node", ["scripts/demo-shifts.mjs"], { env, timeout: 300_000, zonderSleutel: true });
  regel(diensten.uit.split("\n").slice(-3).join("\n"));
  // demo-accounts zijn onbevestigd; anders stuurt elke pagina naar /verifieer-email
  const sql = path.join(WERK, "voorbeeld-verifieer.sql");
  await fs.writeFile(sql, 'UPDATE "User" SET "emailVerifiedAt" = now() WHERE "emailVerifiedAt" IS NULL;\n');
  await sh("npx", ["prisma", "db", "execute", "--url", DB, "--file", sql], { timeout: 120_000, zonderSleutel: true });
  await fs.writeFile(merkBestand, merk);
}

async function wachtTotKlaar(maxMs = 240_000) {
  const eind = Date.now() + maxMs;
  while (Date.now() < eind) {
    if (!proces) throw new Error("De ontwikkelserver stopte tijdens het opstarten");
    try {
      const res = await fetch(`http://127.0.0.1:${DEV_POORT}/api/health`, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) return;
    } catch {
      /* nog aan het compileren */
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("De ontwikkelserver werd niet op tijd klaar");
}

/** Start het voorbeeld op de huidige werkkopie (op de achtergrond; volg via voorbeeldStand). */
export function startVoorbeeld() {
  if (!voorbeeldBeschikbaar()) throw new Error("Het voorbeeld is niet ingesteld op de server");
  if (proces || stand.staat === "start") return voorbeeldStand();
  stand = { staat: "start", sinds: new Date().toISOString(), fout: null, regels: [] };
  void (async () => {
    try {
      await fs.access(path.join(REPO_DIR, ".git")).catch(() => {
        throw new Error("Er is nog geen werkkopie: geef eerst een opdracht");
      });
      await wachtOpUitrol(() => regel("Er loopt een uitrol op de server; even wachten"));
      const env = voorbeeldEnv();
      regel("Database bijwerken");
      const migr = await sh("npx", ["prisma", "migrate", "deploy"], { env, timeout: 300_000, zonderSleutel: true });
      if (migr.code !== 0) throw new Error(`Database bijwerken mislukte: ${migr.uit.slice(-300)}`);
      await zaaiAlsNodig(env);
      regel("Ontwikkelserver starten (de eerste pagina compileert even)");
      proces = spawn("node", ["node_modules/next/dist/bin/next", "dev", "-p", String(DEV_POORT), "-H", "127.0.0.1"], {
        cwd: REPO_DIR,
        env: { ...omgevingZonderSleutel(), ...env },
        stdio: ["ignore", "pipe", "pipe"],
        // eigen procesgroep: next dev start zelf nog een server-proces dat mee moet stoppen
        detached: true,
      });
      proces.stdout?.on("data", regel);
      proces.stderr?.on("data", regel);
      proces.on("close", (code) => {
        proces = null;
        if (stand.staat === "aan" || stand.staat === "start") {
          stand.staat = "fout";
          stand.fout = `De ontwikkelserver stopte (code ${code})`;
        }
      });
      await wachtTotKlaar();
      stand.staat = "aan";
      laatsteBezoek = Date.now();
      regel("Voorbeeld staat aan");
    } catch (e) {
      stand.fout = e instanceof Error ? e.message : String(e);
      stopVoorbeeld();
      stand.staat = "fout";
    }
  })();
  return voorbeeldStand();
}

export function stopVoorbeeld() {
  const p = proces;
  proces = null;
  if (p?.pid) {
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {
      /* al weg */
    }
    setTimeout(() => {
      try {
        process.kill(-p.pid, "SIGKILL");
      } catch {
        /* al weg */
      }
    }, 5000).unref();
  }
  stand = { ...stand, staat: "uit", sinds: new Date().toISOString() };
}

// ---- toegang: getekende link → cookie → proxy naar next dev ------------------------

const teken = (exp) => createHmac("sha256", TOKEN).update(`voorbeeld:${exp}`).digest("base64url");

/** Geldig = niet verlopen en getekend met BOUWER_TOKEN (zie voorbeeldLink in lib/bouwer/werker.ts). */
export function geldig(waarde) {
  const [exp, sig] = String(waarde || "").split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(teken(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

const cookie = (req) => /(?:^|;\s*)zf_vb=([^;]+)/.exec(String(req.headers.cookie || ""))?.[1];

function pagina(res, status, titel, tekst) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(
    `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titel}</title>` +
      `<body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#0b0e13;color:#e8edf5">` +
      `<div style="max-width:28rem;padding:2rem;text-align:center"><h1 style="font-size:1.3rem">${titel}</h1><p style="color:#9aa5b4">${tekst}</p></div></body></html>`,
  );
}

const proxy = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://voorbeeld");
  const sleutel = url.searchParams.get("zf_vb");
  if (sleutel !== null) {
    if (!geldig(sleutel)) return pagina(res, 401, "Link verlopen", "Open het voorbeeld opnieuw via Admin → ZekerFlex AI → Bouwer.");
    url.searchParams.delete("zf_vb");
    res.writeHead(302, {
      "Set-Cookie": `zf_vb=${sleutel}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=7200`,
      Location: `${url.pathname}${url.search}`,
    });
    return res.end();
  }
  if (!geldig(cookie(req))) return pagina(res, 401, "Geen toegang", "Dit is het live voorbeeld van de ZekerFlex Bouwer. Open het via Admin → ZekerFlex AI → Bouwer.");
  if (stand.staat !== "aan") return pagina(res, 503, "Voorbeeld staat uit", "Start het voorbeeld in Admin → ZekerFlex AI → Bouwer.");
  laatsteBezoek = Date.now();
  const naar = http.request({ host: "127.0.0.1", port: DEV_POORT, method: req.method, path: req.url, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  naar.on("error", () => {
    if (!res.headersSent) pagina(res, 502, "Even geduld", "De ontwikkelserver reageert niet. Probeer het zo opnieuw.");
    else res.destroy();
  });
  req.pipe(naar);
});

// websockets (next dev ververst de pagina live bij wijzigingen)
proxy.on("upgrade", (req, sock, kop) => {
  if (!geldig(cookie(req)) || stand.staat !== "aan") return sock.destroy();
  laatsteBezoek = Date.now();
  const doel = net.connect(DEV_POORT, "127.0.0.1", () => {
    const regels = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) regels.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    doel.write(`${regels.join("\r\n")}\r\n\r\n`);
    if (kop?.length) doel.write(kop);
    sock.pipe(doel).pipe(sock);
  });
  doel.on("error", () => sock.destroy());
  sock.on("error", () => doel.destroy());
});

export function startVoorbeeldProxy() {
  if (!voorbeeldBeschikbaar()) return;
  proxy.listen(PROXY_POORT, () => console.log(`[bouwer] voorbeeld-proxy op ${PROXY_POORT} voor ${HOST}`));
  setInterval(() => {
    if (stand.staat === "aan" && Date.now() - laatsteBezoek > STIL_MS) {
      regel("30 minuten geen bezoek: voorbeeld gestopt");
      stopVoorbeeld();
    }
  }, 60_000).unref();
}
