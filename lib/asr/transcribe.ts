import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// ASR — Automatic Speech Recognition via Whisper (OpenAI-compatible endpoint)
//
// Gaat naar de eigen Whisper-server (WHISPER_BASE_URL, dienst "whisper" in
// docker-compose.vps.yml) als WHISPER_ENABLED aan staat; anders naar
// LLM_BASE_URL, voor een AI-node die zelf /v1/audio/transcriptions kent.
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
  // De eigen Whisper-server (dienst "whisper" op de VPS) als die aan staat; Ollama kent geen
  // /audio/transcriptions, dus het taalmodel is alleen nog de terugval voor een LocalAI-achtige node.
  const viaWhisper = env.WHISPER_ENABLED;
  const base = (viaWhisper ? env.WHISPER_BASE_URL : (env.LLM_BASE_URL ?? "http://localhost:11434/v1")).replace(/\/+$/, "");
  const url = `${base}/audio/transcriptions`;
  const start = Date.now();

  const form = new FormData();
  // precies de bytes van de opname: audio.buffer kan bij een kleine Buffer een groter, gedeeld geheugenblok zijn
  const blob = new Blob([new Uint8Array(audio)], { type: mimeTypeFor(filename) });
  form.append("file", blob, filename);
  form.append("model", viaWhisper ? env.WHISPER_MODEL : "whisper");
  form.append("language", opts.language ?? "nl");
  form.append("response_format", "json");
  if (opts.prompt) form.append("prompt", opts.prompt);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
      signal: controller.signal,
      ...(viaWhisper && env.WHISPER_API_KEY ? { headers: { Authorization: `Bearer ${env.WHISPER_API_KEY}` } } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw AppError.upstream(`Spraakherkenning gaf een fout (${res.status}): ${text.slice(0, 200)}`);
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
