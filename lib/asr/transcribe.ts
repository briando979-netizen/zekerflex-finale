import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// ASR — Automatic Speech Recognition via Whisper (OpenAI-compatible endpoint)
//
// Uses the same self-hosted LLM_BASE_URL that the rest of the platform uses,
// expecting a /v1/audio/transcriptions endpoint (Ollama supports this with
// a Whisper model, e.g. `ollama pull whisper`).
//
// Accepts audio as a Buffer (WAV/MP3/OGG/WebM) and returns a transcript.
// Language defaults to "nl" (Dutch) but can be overridden.
// ---------------------------------------------------------------------------

export interface TranscribeOptions {
  language?: string;
  prompt?: string; // optional context hint for Whisper
  timeoutMs?: number;
}

export interface TranscribeResult {
  text: string;
  language: string;
  durationMs: number;
}

export async function transcribeAudio(
  audio: Buffer,
  filename: string,
  opts: TranscribeOptions = {},
): Promise<TranscribeResult> {
  const base = env.LLM_BASE_URL ?? "http://localhost:11434/v1";
  const url = `${base}/audio/transcriptions`;
  const start = Date.now();

  const form = new FormData();
  const blob = new Blob([audio.buffer as ArrayBuffer], { type: mimeTypeFor(filename) });
  form.append("file", blob, filename);
  form.append("model", "whisper");
  form.append("language", opts.language ?? "nl");
  form.append("response_format", "json");
  if (opts.prompt) form.append("prompt", opts.prompt);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  try {
    const res = await fetch(url, { method: "POST", body: form, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw AppError.upstream(`ASR endpoint fout ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { text?: string };
    const text = (json.text ?? "").trim();
    logger.debug("asr: transcript klaar", { chars: text.length, durationMs: Date.now() - start });
    return { text, language: opts.language ?? "nl", durationMs: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

function mimeTypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    webm: "audio/webm",
    m4a: "audio/mp4",
    flac: "audio/flac",
  };
  return map[ext ?? ""] ?? "audio/wav";
}
