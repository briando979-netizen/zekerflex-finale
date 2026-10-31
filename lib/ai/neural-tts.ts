import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Neurale tekst-naar-spraak via Google Cloud Text-to-Speech (Wavenet NL) — een
// natuurlijke stem voor het "voorlezen" in de ZekerFlex AI-console, i.p.v. de
// robotachtige browserstem. Gebruikt GOOGLE_TTS_API_KEY (valt terug op
// GOOGLE_MAPS_API_KEY) en vereist dat de "Cloud Text-to-Speech API" aanstaat.
// Let op: een Maps-Platform-sleutel mag géén TTS — gebruik hiervoor een losse,
// onbeperkte API-sleutel. Dormant (→ browserstem) zolang geen sleutel TTS mag.
// ---------------------------------------------------------------------------

function ttsKey(): string | undefined {
  return env.GOOGLE_TTS_API_KEY ?? env.GOOGLE_MAPS_API_KEY;
}

export function neuralTtsEnabled(): boolean {
  return Boolean(ttsKey());
}

/** Zet tekst om naar MP3-bytes (neurale NL-stem), of null als het niet lukt/uit staat. */
export async function synthesizeSpeech(text: string, voiceName = "nl-NL-Wavenet-D"): Promise<Buffer | null> {
  const key = ttsKey();
  if (!key || !text.trim()) return null;
  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: text.slice(0, 2000) },
        voice: { languageCode: "nl-NL", name: voiceName },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.05 },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      logger.warn("neural tts failed", { status: res.status });
      return null;
    }
    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) return null;
    return Buffer.from(data.audioContent, "base64");
  } catch (err) {
    logger.warn("neural tts error", { error: (err as Error).message });
    return null;
  }
}
