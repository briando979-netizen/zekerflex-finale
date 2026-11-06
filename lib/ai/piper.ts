import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Piper: tekst naar spraak op onze eigen server. Een Nederlandse stem die
// niets per teken kost en waarvoor geen sleutel nodig is — de gratis
// tegenhanger van Google Text-to-Speech. lib/ai/neural-tts.ts kiest tussen de
// twee; dit bestand weet alleen hoe je onze eigen stem-server aanspreekt.
//
// De dienst staat naast de app op de VPS (zie deploy/piper/) en is alleen op
// het interne netwerk te bereiken. PIPER_URL wijst ernaar; staat die niet, dan
// doet dit bestand niets en blijft alles zoals het was.
//
// Twee vormen van stem-server worden ondersteund, zodat de eigenaar er later
// een andere onder kan zetten zonder dat de code mee hoeft:
//   1. OpenAI-compatibel:  POST {basis}/v1/audio/speech  (openedai-speech → MP3)
//   2. Piper's eigen HTTP-server: POST {basis}/ met de tekst in de body (→ WAV)
// Welke vorm antwoordde onthouden we op globalThis, niet in een module-
// variabele: Next bundelt elke route apart, dus die bestaat per bundel.
// ---------------------------------------------------------------------------

/** Het geluid dat onze eigen stem-server teruggaf, met het mediatype dat er echt in zit. */
export interface PiperSpraak {
  audio: Buffer;
  /** "audio/mpeg" of "audio/wav" — niet geraden, maar uit de bytes zelf gelezen */
  mime: string;
}

export interface PiperOpties {
  /** stemnaam zoals de dienst hem kent (zie deploy/piper/config/voice_to_speaker.yaml) */
  stem?: string;
  /** gewenst formaat; een dienst die alleen WAV kan, geeft WAV — `mime` zegt wat het werd */
  formaat?: "mp3" | "wav";
  timeoutMs?: number;
}

/** De stemnaam die onze stemmenlijst aan de Nederlandse Piper-stem knoopt. */
export const STANDAARD_PIPER_STEM = "alloy";

const TIMEOUT_MS = 20_000;
const MAX_TEKENS = 2000;

type Vorm = "openai" | "piper";

const gedeeld = globalThis as typeof globalThis & { __zfPiperVorm?: Record<string, Vorm> };

/** Waar onze eigen stem-server draait, zonder slotstreepje. Leeg = niet ingesteld. */
export function piperBasis(): string {
  return (env.PIPER_URL ?? "").trim().replace(/\/+$/, "");
}

/** Staat er een eigen stem-server klaar? */
export function piperAan(): boolean {
  return piperBasis().length > 0;
}

/** Alleen de host mag in een log — een adres kan een pad of een sleutel bevatten. */
function hostVan(basis: string): string {
  try {
    return new URL(basis).host;
  } catch {
    return "onbekend";
  }
}

function spraakUrl(basis: string, vorm: Vorm): string {
  if (vorm === "piper") return `${basis}/`;
  if (/\/audio\/speech$/.test(basis)) return basis;
  if (/\/v1$/.test(basis)) return `${basis}/audio/speech`;
  return `${basis}/v1/audio/speech`;
}

/** Welke vormen we proberen, de vorm die het laatst werkte vooraan. */
function vormen(basis: string): Vorm[] {
  // Wie zelf al een /v1-pad invult, bedoelt de OpenAI-vorm.
  const alle: Vorm[] = /\/v1(\/|$)|\/audio\/speech$/.test(basis) ? ["openai"] : ["openai", "piper"];
  const bekend = gedeeld.__zfPiperVorm?.[basis];
  return bekend ? [bekend, ...alle.filter((v) => v !== bekend)] : alle;
}

function onthoud(basis: string, vorm: Vorm): void {
  const lijst = gedeeld.__zfPiperVorm ?? {};
  lijst[basis] = vorm;
  gedeeld.__zfPiperVorm = lijst;
}

function verzoek(vorm: Vorm, tekst: string, opties: PiperOpties): RequestInit {
  if (vorm === "piper") {
    return { method: "POST", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: tekst };
  }
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "tts-1",
      input: tekst,
      voice: opties.stem?.trim() || STANDAARD_PIPER_STEM,
      response_format: opties.formaat ?? "mp3",
    }),
  };
}

/**
 * Wat er echt in de bytes zit weegt zwaarder dan de kop: een stem-server meldt
 * soms application/octet-stream. Geen geluid → null, dan was het een foutpagina.
 */
function mimeVan(kop: string | null, bytes: Buffer): string | null {
  const start = bytes.subarray(0, 4).toString("latin1");
  if (start === "RIFF") return "audio/wav";
  if (start === "OggS") return "audio/ogg";
  if (start.startsWith("ID3")) return "audio/mpeg";
  const eerste = bytes[0] ?? 0;
  const tweede = bytes[1] ?? 0;
  if (eerste === 0xff && (tweede & 0xe0) === 0xe0) return "audio/mpeg"; // ruwe MP3-frame
  const gemeld = (kop ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return gemeld.startsWith("audio/") ? gemeld : null;
}

async function leesSpraak(res: Response): Promise<PiperSpraak | null> {
  const bytes = Buffer.from(await res.arrayBuffer());
  // Minder dan een WAV-kop is nooit geluid.
  if (bytes.length < 44) return null;
  const mime = mimeVan(res.headers.get("content-type"), bytes);
  return mime ? { audio: bytes, mime } : null;
}

/**
 * Laat onze eigen server een tekst inspreken. Geeft de bytes met hun mediatype
 * terug, of null als er geen server staat of het niet lukte — de aanroeper valt
 * dan terug op het volgende net (Google, of de browserstem).
 */
export async function piperSpreek(tekst: string, opties: PiperOpties = {}): Promise<PiperSpraak | null> {
  const basis = piperBasis();
  const schoon = tekst.trim().slice(0, MAX_TEKENS);
  if (!basis || !schoon) return null;
  const timeoutMs = opties.timeoutMs ?? TIMEOUT_MS;
  const host = hostVan(basis);

  for (const vorm of vormen(basis)) {
    try {
      const res = await fetch(spraakUrl(basis, vorm), {
        ...verzoek(vorm, schoon, opties),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        // 400/404/405 = deze dienst kent deze vorm niet; de andere vorm proberen.
        if (res.status === 400 || res.status === 404 || res.status === 405) continue;
        logger.warn("piper gaf een fout", { host, vorm, status: res.status });
        return null;
      }
      const spraak = await leesSpraak(res);
      if (!spraak) continue; // antwoord zonder geluid (JSON-fout?) → andere vorm
      onthoud(basis, vorm);
      logger.debug("piper sprak", { host, vorm, mime: spraak.mime, bytes: spraak.audio.length });
      return spraak;
    } catch (err) {
      logger.warn("piper onbereikbaar", { host, vorm, error: (err as Error).message });
    }
  }
  return null;
}
