import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Sovereign .env loader.
//
// Next.js already loads `.env` for the app, but scripts (ts-node), the seed and
// the test runner do not. This tiny parser (no dependency) reads `.env` and
// `.env.local` from the project root into `process.env` WITHOUT overriding
// anything the runtime already provided - so the app is independent of editor
// or terminal environment settings. Runs once.
// ---------------------------------------------------------------------------

export function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const first = value[0];
    const last = value[value.length - 1];
    if (
      value.length >= 2 &&
      ((first === '"' && last === '"') || (first === "'" && last === "'"))
    ) {
      value = value.slice(1, -1);
      if (first === '"') {
        value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
    }
    out[key] = value;
  }
  return out;
}

let done = false;

export function loadLocalEnv(): void {
  if (done) return;
  done = true;
  if (typeof process === "undefined" || typeof process.cwd !== "function") return;

  for (const file of [".env", ".env.local"]) {
    try {
      const path = resolve(process.cwd(), file);
      if (!existsSync(path)) continue;
      const parsed = parseDotenv(readFileSync(path, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // Missing / unreadable .env is fine - the zod schema in lib/env.ts
      // supplies safe local defaults for the sovereign offline environment.
    }
  }
}
