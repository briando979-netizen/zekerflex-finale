import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { transcribeWoorden } from "@/lib/asr/transcribe";
import { WHISPER_HINT, isAudioTaal } from "@/lib/asr/bestand";
import { bestandBlob, bestandItem } from "@/lib/video/bestanden";
import { bestandIdUitBron } from "@/lib/video/spraak-ondertitels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Hoogstens zo groot in één keer (een half uur film); groter: eerst korter maken. */
const MAX_BYTES = 150_000_000;

const invoer = z.object({ bron: z.string().max(600), taal: z.string().max(5).default("nl") });

// Eén omzetting tegelijk: Whisper heeft een eigen geheugengrens en deelt de cpu met ons eigen taalmodel (1f, 13 nov).
// In het geheugen van het proces (globalThis: Next bundelt routes apart).
const g = globalThis as unknown as { __zfOndertitelBezig?: boolean };

// POST: de spraak in een video of geluid van de editor als woorden met hun tijd (eigen Whisper, gratis). De editor
// maakt er ondertitelregels van (lib/video/spraak-ondertitels.ts). Er wordt niets bewaard: alleen het antwoord.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const parsed = invoer.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Kies eerst een video- of geluidsclip.");
  const id = bestandIdUitBron(parsed.data.bron);
  const item = id ? await bestandItem(id) : null;
  if (!item || item.soort === "foto") throw AppError.validation("Ondertitels maken kan bij een video of geluid uit de bestanden van de editor.");
  if (item.bytes > MAX_BYTES) throw AppError.validation("Dit bestand is te groot om in één keer om te zetten (hoogstens 150 MB). Knip het eerst korter.");
  const taal = isAudioTaal(parsed.data.taal) ? parsed.data.taal : "nl";
  if (g.__zfOndertitelBezig) throw AppError.conflict("Er wordt al een clip omgezet naar ondertitels. Wacht tot die klaar is en probeer het dan nog eens.");
  g.__zfOndertitelBezig = true;
  try {
    // ruim binnen de 5 minuten die Node een verzoek geeft (requestTimeout): liever een nette melding dan een afgebroken
    // verbinding. Whisper doet ±0,6 s per seconde spraak (gemeten 13 nov), dus dit is ±7 minuten spraak.
    const r = await transcribeWoorden(await bestandBlob(item), `${item.id}.${item.ext}`, { language: taal, prompt: WHISPER_HINT, timeoutMs: 270_000 });
    return NextResponse.json({ ok: true, tekst: r.text, woorden: r.woorden, ms: r.durationMs });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.upstream("De spraakherkenning was niet op tijd klaar of gaf geen antwoord. Probeer het zo nog eens, of knip de clip korter (hoogstens zo'n 7 minuten spraak).");
  } finally {
    g.__zfOndertitelBezig = false;
  }
});
