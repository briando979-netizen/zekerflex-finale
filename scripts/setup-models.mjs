#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Autonome modeldownload voor The Sovereign Box.
//
//   npm run models                 # haalt de modellen uit .env
//   npm run models -- llama3.2:3b  # of expliciet
//
// Praat rechtstreeks met de lokale Ollama-dienst op :11434 (POST /api/pull) en
// streamt de voortgang. Idempotent: een model dat er al is wordt overgeslagen.
// ---------------------------------------------------------------------------
import { existsSync, readFileSync } from "node:fs";
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

const HOST = (process.env.LLM_BASE_URL || "http://localhost:11434/v1")
  .replace(/\/v1\/?$/, "")
  .replace(/\/+$/, "");

const explicit = process.argv.slice(2).filter(Boolean);
const wanted = explicit.length
  ? explicit
  : [
      process.env.LLM_MODEL || "llama3.1:8b",
      process.env.LLM_EMBED_MODEL || "nomic-embed-text",
    ];

const c = { g: "\x1b[32m", y: "\x1b[33m", r: "\x1b[31m", d: "\x1b[2m", x: "\x1b[0m" };
const log = (s) => process.stdout.write(`${s}\n`);

async function ollamaUp() {
  try {
    const res = await fetch(`${HOST}/api/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function installed() {
  try {
    const res = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return new Set((data.models ?? []).map((m) => m.name));
  } catch {
    return new Set();
  }
}

function human(bytes) {
  if (!bytes) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(1)} ${u[i]}`;
}

async function pull(model) {
  log(`${c.y}▶${c.x} ${model} downloaden…`);
  const res = await fetch(`${HOST}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`pull ${model}: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let lastPct = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.error) throw new Error(ev.error);
      if (ev.total && ev.completed) {
        const pct = Math.floor((ev.completed / ev.total) * 100);
        if (pct !== lastPct && pct % 5 === 0) {
          lastPct = pct;
          process.stdout.write(
            `\r  ${c.d}${ev.status} ${pct}% (${human(ev.completed)}/${human(ev.total)})${c.x}   `,
          );
        }
      } else if (ev.status) {
        process.stdout.write(`\r  ${c.d}${ev.status}${c.x}                      `);
      }
    }
  }
  process.stdout.write("\r");
  log(`${c.g}✔${c.x} ${model} gereed                                        `);
}

async function main() {
  log(`${c.d}Ollama: ${HOST}${c.x}`);
  if (!(await ollamaUp())) {
    log(`${c.r}✖${c.x} Ollama draait niet op ${HOST}. Start het en probeer opnieuw.`);
    process.exit(1);
  }

  const have = await installed();
  const todo = wanted.filter(
    (m) => !have.has(m) && !have.has(`${m}:latest`) && !m.startsWith("#"),
  );

  if (todo.length === 0) {
    log(`${c.g}✔${c.x} Alle modellen aanwezig: ${wanted.join(", ")}`);
    return;
  }

  for (const model of todo) {
    try {
      await pull(model);
    } catch (err) {
      log(`${c.r}✖${c.x} ${model}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  log("");
  log(`${c.d}Klaar. Als je LLM_EMBED_MODEL nog niet gezet hebt: zet die in .env en herstart de daemon.${c.x}`);
}

main().catch((err) => {
  log(`${c.r}✖${c.x} ${err.message}`);
  process.exit(1);
});
