#!/usr/bin/env node
// ---------------------------------------------------------------------------
// ZekerFlex Sovereign Box launcher.
//
//   npm run launch            # port 3000
//   PORT=3020 npm run launch
//
// 1. pre-flight: Postgres, Redis, local Ollama
// 2. apply any pending Prisma migrations (deliberate operator action)
// 3. start `next dev`
// 4. when the server answers, open the browser
// No cloud, no external services.
// ---------------------------------------------------------------------------
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { platform } from "node:os";
import { resolve } from "node:path";

// Load .env / .env.local without overriding the shell (mirrors lib/config/load-env.ts).
for (const f of [".env", ".env.local"]) {
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith("#")) continue;
    const eq = l.indexOf("=");
    if (eq === -1) continue;
    const k = l.slice(0, eq).trim();
    let v = l.slice(eq + 1).trim();
    if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const PORT = process.env.PORT || "3000";
const HOST = "localhost";
const URL = `http://${HOST}:${PORT}`;

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};
const line = (s) => process.stdout.write(`${s}\n`);
const ok = (s) => line(`  ${c.green}✔${c.reset} ${s}`);
const warn = (s) => line(`  ${c.yellow}▲${c.reset} ${s}`);
const fail = (s) => line(`  ${c.red}✖${c.reset} ${s}`);

function tcpProbe(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeout);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
    sock.connect(port, host);
  });
}

async function httpProbe(url, timeout = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return res.ok || res.status === 404 || res.status === 401;
  } catch {
    return false;
  }
}

function parseUrlParts(raw, fallbackPort) {
  try {
    const u = new URL(raw);
    return { host: u.hostname, port: Number(u.port || fallbackPort) };
  } catch {
    return { host: "localhost", port: fallbackPort };
  }
}

async function preflight() {
  line(`${c.bold}${c.cyan}ZekerFlex · The Sovereign Box${c.reset}`);
  line(`${c.dim}pre-flight checks${c.reset}`);

  const dbUrl = process.env.DATABASE_URL || "postgresql://localhost:5432";
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const llmUrl = process.env.LLM_BASE_URL || "http://localhost:11434/v1";

  const db = parseUrlParts(dbUrl, 5432);
  const cache = parseUrlParts(redisUrl.replace(/^redis/, "http"), 6379);
  const llm = parseUrlParts(llmUrl, 11434);

  const results = {
    postgres: await tcpProbe(db.host, db.port),
    redis: await tcpProbe(cache.host, cache.port),
    ollama: await httpProbe(`http://${llm.host}:${llm.port}/api/tags`),
  };

  results.postgres
    ? ok(`PostgreSQL bereikbaar op ${db.host}:${db.port}`)
    : fail(`PostgreSQL NIET bereikbaar op ${db.host}:${db.port}`);
  results.redis
    ? ok(`Redis bereikbaar op ${cache.host}:${cache.port}`)
    : fail(`Redis NIET bereikbaar op ${cache.host}:${cache.port}`);
  results.ollama
    ? ok(`Lokale inferentie (Ollama) bereikbaar op ${llm.host}:${llm.port}`)
    : warn(
        `Lokale inferentie NIET bereikbaar op ${llm.host}:${llm.port} — ` +
          `start 'ollama serve'. AI-functies degraderen netjes tot dat kan.`,
      );
  line(
    `  ${c.dim}vector store: lokale Float[] + JS cosine (geen pgvector-extensie vereist)${c.reset}`,
  );

  if (!results.postgres || !results.redis) {
    fail("Verplichte diensten ontbreken. Start Postgres + Redis en probeer opnieuw.");
    line(
      `${c.dim}  docker start zekerflex-postgres redis-server${c.reset}`,
    );
    process.exit(1);
  }
  return results;
}

function applyMigrations() {
  line(`${c.dim}database: migraties toepassen (indien nodig)${c.reset}`);
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: platform() === "win32",
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  if (r.status === 0) {
    ok(
      /No pending migrations/i.test(out)
        ? "schema up-to-date"
        : "migraties toegepast",
    );
  } else {
    warn(`prisma migrate deploy gaf een fout — server start toch:\n${out.slice(0, 400)}`);
  }
}

function openBrowser(url) {
  const p = platform();
  try {
    if (p === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else if (p === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    ok(`browser geopend op ${url}`);
  } catch {
    warn(`kon de browser niet automatisch openen — ga naar ${url}`);
  }
}

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    if (await httpProbe(url, 1000)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  await preflight();
  applyMigrations();

  line(`${c.dim}server: next dev op poort ${PORT}${c.reset}`);
  const dev = spawn("npx", ["next", "dev", "-p", PORT], {
    stdio: "inherit",
    shell: platform() === "win32",
    env: { ...process.env, PORT },
  });

  dev.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => dev.kill("SIGINT"));
  process.on("SIGTERM", () => dev.kill("SIGTERM"));

  const up = await waitForServer(URL);
  if (up) {
    line("");
    ok(`${c.bold}ZekerFlex draait op ${URL}${c.reset}`);
    line(
      `  ${c.dim}Jarvis-console: ${URL}/admin/jarvis · Verkeer: ${URL}/admin/analytics${c.reset}`,
    );
    openBrowser(URL);
  } else {
    warn(`server reageerde nog niet op ${URL} — controleer de logs hierboven.`);
  }
}

main().catch((err) => {
  fail(String(err?.message ?? err));
  process.exit(1);
});
