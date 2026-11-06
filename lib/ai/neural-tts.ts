import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { gebruikEigenVers } from "@/lib/gratis/keuzes";
import { piperAan, piperSpreek } from "@/lib/ai/piper";

// ---------------------------------------------------------------------------
// Neurale tekst-naar-spraak: een natuurlijke stem voor het "voorlezen" in de
// ZekerFlex AI-console, de AI-beller en de video-editor, i.p.v. de robotachtige
// browserstem. Twee bronnen, in deze volgorde:
//
//   1. Piper op onze eigen server (lib/ai/piper.ts, PIPER_URL) — gratis, geen
//      sleutel, gegevens blijven bij ons. Gaat vóór zodra "alles gratis"
//      aanstaat (Admin → ZekerFlex AI) of er geen Google-sleutel is.
//   2. Google Cloud Text-to-Speech (Wavenet NL) — per teken afgerekend.
//      Gebruikt GOOGLE_TTS_API_KEY (valt terug op GOOGLE_MAPS_API_KEY) en
//      vereist dat de "Cloud Text-to-Speech API" aanstaat. Let op: een
//      Maps-Platform-sleutel mag géén TTS — gebruik een losse, onbeperkte
//      API-sleutel.
//
// Lukt de een niet, dan probeert hij de ander; lukt geen van beide, dan geeft
// hij null terug en valt de aanroeper terug op de browserstem of op stilte.
// ---------------------------------------------------------------------------

/** Welke bron het geluid maakte — handig voor een log of een scherm. */
export type StemBron = "piper" | "google";

export interface NeuraleStem {
  audio: Buffer;
  /** mediatype van het geluid: "audio/mpeg" bij Google, bij Piper wat hij stuurde */
  mime: string;
  bron: StemBron;
}

function ttsKey(): string | undefined {
  return env.GOOGLE_TTS_API_KEY ?? env.GOOGLE_MAPS_API_KEY;
}

export function neuralTtsEnabled(): boolean {
  return Boolean(ttsKey()) || piperAan();
}

async function eigenStem(text: string): Promise<NeuraleStem | null> {
  const spraak = await piperSpreek(text, { formaat: "mp3" }).catch(() => null);
  return spraak ? { audio: spraak.audio, mime: spraak.mime, bron: "piper" } : null;
}

async function googleStem(text: string, voiceName: string, key: string): Promise<NeuraleStem | null> {
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
    return { audio: Buffer.from(data.audioContent, "base64"), mime: "audio/mpeg", bron: "google" };
  } catch (err) {
    logger.warn("neural tts error", { error: (err as Error).message });
    return null;
  }
}

/**
 * Zet tekst om naar geluid, met het mediatype en de bron erbij. Eerst onze eigen
 * server als dat mag, anders Google; mislukt de een, dan volgt de ander.
 * null = geen stem beschikbaar.
 */
export async function synthesizeSpeechMedia(text: string, voiceName = "nl-NL-Wavenet-D"): Promise<NeuraleStem | null> {
  const schoon = text.trim();
  if (!schoon) return null;
  const key = ttsKey();
  // De keuze voor de stem staat in KV (Admin → Alles gratis); verversen kost
  // niets (cache van 60 s). Standaard "automatisch": zolang Piper niet draait
  // en er een Google-sleutel is, blijft het Google.
  const eigenEerst = await gebruikEigenVers("stem", Boolean(key)).catch(() => !key);

  if (eigenEerst) {
    const eigen = await eigenStem(schoon);
    if (eigen) return eigen;
  }
  if (key) {
    const google = await googleStem(schoon, voiceName, key);
    if (google) return google;
  }
  if (!eigenEerst) {
    // Google lukte niet (tegoed, sleutel mag geen TTS): dan onze eigen stem.
    const eigen = await eigenStem(schoon);
    if (eigen) return eigen;
  }
  return null;
}

/**
 * Zet tekst om naar geluidsbytes (MP3 bij Google en bij een Piper-dienst die
 * MP3 kan; anders WAV), of null als het niet lukte/uit staat. Wie het mediatype
 * nodig heeft, gebruikt `synthesizeSpeechMedia`.
 */
export async function synthesizeSpeech(text: string, voiceName = "nl-NL-Wavenet-D"): Promise<Buffer | null> {
  const stem = await synthesizeSpeechMedia(text, voiceName);
  return stem?.audio ?? null;
}
