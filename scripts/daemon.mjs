#!/usr/bin/env node
// ---------------------------------------------------------------------------
// ZekerFlex Always-On Daemon.
//
//   npm run daemon
//
// - supervises `next dev` on ONE port (default 3000), restarts it on crash
//   with exponential backoff
// - runs the background jobs on an internal schedule (no external cron needed):
//   matching tick, follow-ups, active-hours, orchestration, RAG reindex
// - pings the local model every 20s: keeps it warm and detects recovery
//
// Everything talks to http://localhost:<PORT>. Ctrl-C stops it cleanly.
// ---------------------------------------------------------------------------
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";

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
const BASE = `http://localhost:${PORT}`;
const TOKEN = process.env.INTERNAL_CRON_TOKEN || "";
const isWin = platform() === "win32";

const log = (s) => console.log(`${new Date().toISOString()} ${s}`);

// --- supervised Next server ------------------------------------------------
let child = null;
let stopping = false;
let restarts = 0;
let backoff = 1000;
let stableTimer = null;

// A leftover production build (`next build`) confuses `next dev` (shared .next).
// Clear it once on daemon start so dev compiles fresh.
try {
  if (existsSync(resolve(process.cwd(), ".next/BUILD_ID"))) {
    rmSync(resolve(process.cwd(), ".next"), { recursive: true, force: true });
    log("  .next (productie-build) opgeruimd voor dev-modus");
  }
} catch {
  /* ignore */
}

function startServer() {
  log(`▶ next dev op ${BASE}`);
  child = spawn("npx", ["next", "dev", "-p", PORT], {
    stdio: "inherit",
    shell: isWin,
    env: { ...process.env, PORT },
  });

  stableTimer = setTimeout(() => {
    backoff = 1000;
    restarts = 0;
  }, 60_000);

  child.on("exit", (code, signal) => {
    if (stableTimer) clearTimeout(stableTimer);
    child = null;
    if (stopping) return;
    restarts += 1;
    if (restarts > 30) {
      log(`✖ next dev is 30x achter elkaar gecrasht — daemon stopt. Controleer de logs.`);
      process.exit(1);
    }
    log(`▲ next dev gestopt (code ${code ?? signal}) — herstart over ${backoff}ms (#${restarts})`);
    setTimeout(startServer, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  });
}

// --- scheduled jobs ------------------------------------------------------
async function hit(path, label) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "x-internal-token": TOKEN },
      signal: AbortSignal.timeout(path.includes("reindex") ? 300_000 : 60_000),
    });
    if (!res.ok && res.status !== 200) {
      log(`  ${label}: HTTP ${res.status}`);
    }
  } catch (err) {
    // The server may still be booting or restarting - that's fine, next tick.
    if (!/aborted|fetch failed|ECONNREFUSED/i.test(String(err?.message))) {
      log(`  ${label}: ${err?.message}`);
    }
  }
}

const jobs = [
  { path: "/api/internal/ai/watchdog", label: "ai-watchdog", everyMs: 20_000, firstDelayMs: 5_000 },
  { path: "/api/internal/matching/tick", label: "matching-tick", everyMs: 60_000, firstDelayMs: 10_000 },
  { path: "/api/internal/active-hours/recompute", label: "active-hours", everyMs: 4 * 3600_000, firstDelayMs: 60_000 },
  // Heavy LLM jobs: do NOT run at boot - they'd starve interactive Jarvis on a
  // slow box. First run after a few minutes, then on schedule.
  { path: "/api/internal/orchestration/tick", label: "orchestration", everyMs: 6 * 3600_000, firstDelayMs: 8 * 60_000 },
  { path: "/api/internal/rag/reindex", label: "rag-reindex", everyMs: 12 * 3600_000, firstDelayMs: 3 * 60_000 },
];

let jobTimers = [];

// --- autonomous model download --------------------------------------------
const OLLAMA = (process.env.LLM_BASE_URL || "http://localhost:11434/v1")
  .replace(/\/v1\/?$/, "")
  .replace(/\/+$/, "");

async function ensureModels() {
  let tags;
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    tags = new Set(((await res.json()).models ?? []).map((m) => m.name));
  } catch {
    log("▲ Ollama nog niet bereikbaar — modelcheck overgeslagen (watchdog blijft proberen).");
    return;
  }
  const want = [
    process.env.LLM_MODEL || "llama3.1:8b",
    ...(process.env.LLM_EMBED_MODEL ? [process.env.LLM_EMBED_MODEL] : []),
  ];
  const missing = want.filter((m) => !tags.has(m) && !tags.has(`${m}:latest`));
  if (missing.length === 0) {
    log(`▶ modellen aanwezig: ${want.join(", ")}`);
    return;
  }
  log(`▶ ontbrekende modellen worden op de achtergrond gedownload: ${missing.join(", ")}`);
  const dl = spawn("node", ["scripts/setup-models.mjs", ...missing], {
    stdio: "inherit",
    shell: isWin,
  });
  dl.on("exit", (code) =>
    log(
      code === 0
        ? "▶ modeldownload klaar — Jarvis is nu volledig operationeel."
        : `▲ modeldownload eindigde met code ${code} (probeer 'npm run models' handmatig).`,
    ),
  );
}

async function serverReady() {
  try {
    const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status === 401 || res.status === 404;
  } catch {
    return false;
  }
}

async function scheduleJobs() {
  while (!(await serverReady())) await new Promise((r) => setTimeout(r, 2000));
  if (!TOKEN) {
    log("▲ INTERNAL_CRON_TOKEN niet gezet — achtergrondjobs draaien zonder auth (alleen lokaal OK).");
  }
  log("▶ achtergrondjobs actief: " + jobs.map((j) => j.label).join(", "));
  for (const job of jobs) {
    setTimeout(() => {
      void hit(job.path, job.label);
      jobTimers.push(setInterval(() => void hit(job.path, job.label), job.everyMs));
    }, job.firstDelayMs ?? 0);
  }
}

// --- lifecycle ---------------------------------------------------------
function shutdown() {
  if (stopping) return;
  stopping = true;
  log("■ daemon stopt…");
  for (const t of jobTimers) clearInterval(t);
  if (stableTimer) clearTimeout(stableTimer);
  if (child) child.kill(isWin ? "SIGTERM" : "SIGINT");
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("uncaughtException", (err) => log(`✖ uncaught: ${err?.message}`));
process.on("unhandledRejection", (err) => log(`✖ unhandled: ${err}`));

log("ZekerFlex Always-On Daemon");
startServer();
void ensureModels();
void scheduleJobs();
