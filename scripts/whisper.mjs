#!/usr/bin/env node
// Start (or check) the local, sovereign Whisper speech-to-text server used by
// the Jarvis microphone. Wraps the `whisper` service in docker-compose.yml
// (fedirz/faster-whisper-server, OpenAI-compatible on :8000).
//
//   npm run whisper           → start + wait until ready
//   npm run whisper -- stop   → stop it
//   npm run whisper -- status → just check
//
// Nothing about this touches the database, Redis, auth or logs.

import { spawn } from "node:child_process";

const BASE = process.env.WHISPER_BASE_URL || "http://localhost:8000/v1";
const HEALTH = BASE.replace(/\/v1\/?$/, "") + "/health";
const action = process.argv[2] || "start";

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
    p.on("close", (code) => resolve(code ?? 1));
    p.on("error", () => resolve(127));
  });
}

async function reachable() {
  try {
    const r = await fetch(HEALTH, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    try {
      const r = await fetch(BASE + "/models", { signal: AbortSignal.timeout(2500) });
      return r.ok;
    } catch {
      return false;
    }
  }
}

const log = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);

if (action === "status") {
  log((await reachable()) ? `✓ Whisper bereikbaar op ${BASE}` : `✖ Whisper niet bereikbaar (${BASE})`);
  process.exit(0);
}

if (action === "stop") {
  log("Whisper-container stoppen…");
  const code = await run("docker", ["compose", "stop", "whisper"]);
  process.exit(code);
}

// start
if (await reachable()) {
  log(`✓ Whisper draait al op ${BASE}`);
  process.exit(0);
}

const docker = await run("docker", ["--version"]);
if (docker !== 0) {
  log("✖ Docker niet gevonden. Installeer Docker Desktop en probeer opnieuw,");
  log("  of draai zelf een OpenAI-compatibele Whisper-server op :8000 en zet WHISPER_BASE_URL.");
  process.exit(1);
}

log("Whisper-server starten via docker compose (eerste keer: modeldownload ~150 MB)…");
const up = await run("docker", ["compose", "up", "-d", "whisper"]);
if (up !== 0) {
  log("✖ `docker compose up` mislukte. Controleer docker-compose.yml en of Docker draait.");
  process.exit(up);
}

process.stdout.write(`${new Date().toISOString().slice(11, 19)} wachten tot Whisper klaar is`);
for (let i = 0; i < 120; i++) {
  if (await reachable()) {
    process.stdout.write("\n");
    log(`✓ Whisper klaar op ${BASE} — de Jarvis-microfoon werkt nu in elke browser.`);
    process.exit(0);
  }
  process.stdout.write(".");
  await new Promise((r) => setTimeout(r, 2000));
}
process.stdout.write("\n");
log("✖ Whisper kwam niet op tijd omhoog. Check: docker compose logs whisper");
process.exit(1);
