import { spawn } from "node:child_process";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Server-side local text-to-speech via Piper (https://github.com/rhasspy/piper).
//
// Piper is a fast neural TTS that runs entirely on CPU inside the box - no
// cloud. It is OPTIONAL: when PIPER_BIN / PIPER_MODEL are unset the voice agent
// falls back to the browser's built-in speech synthesis (also fully local).
// ---------------------------------------------------------------------------

const SYNTH_TIMEOUT_MS = 15_000;
const MAX_TEXT = 1200;

export function isServerTtsEnabled(): boolean {
  return Boolean(env.PIPER_BIN && env.PIPER_MODEL);
}

/** Synthesize `text` to a WAV buffer. Rejects when Piper is not configured. */
export function synthesize(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!env.PIPER_BIN || !env.PIPER_MODEL) {
      reject(new Error("Piper is not configured"));
      return;
    }
    const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    const proc = spawn(
      env.PIPER_BIN,
      ["--model", env.PIPER_MODEL, "--output_file", "-"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Piper synthesis timed out"));
    }, SYNTH_TIMEOUT_MS);

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        logger.warn("piper synthesis failed", { code, stderr: stderr.slice(0, 200) });
        reject(new Error(`Piper exited ${code}`));
      }
    });

    proc.stdin.write(clean);
    proc.stdin.end();
  });
}
