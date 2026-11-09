import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { transcribeAudio } from "@/lib/asr/transcribe";
import { WHISPER_HINT, audioBestandFout, isAudioTaal } from "@/lib/asr/bestand";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

// ---------------------------------------------------------------------------
// POST /api/admin/audio-tekst — Admin → Audio naar tekst. Een geluids- of
// videobestand (veld "audio", taal in veld "taal") gaat naar onze eigen
// Whisper (lib/asr/transcribe.ts) en de tekst komt terug. Het bestand wordt
// nergens bewaard en de tekst niet gelogd: een opname kan privé zijn.
// ---------------------------------------------------------------------------

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (req, { principal }) => {
  await enforceRateLimit({
    name: "audio-tekst",
    identifier: principal.userId,
    limit: 40,
    windowSeconds: 3600,
    message: "Je hebt veel opnames omgezet. Probeer het over een uur opnieuw.",
  });

  const form = await req.formData().catch(() => null);
  const bestand = form?.get("audio");
  if (!(bestand instanceof File)) {
    return NextResponse.json({ error: { code: "GEEN_BESTAND", message: "Kies eerst een geluidsbestand." } }, { status: 400 });
  }
  const fout = audioBestandFout(bestand.name, bestand.type, bestand.size);
  if (fout) return NextResponse.json({ error: { code: "BESTAND_ONBRUIKBAAR", message: fout } }, { status: 422 });
  const taalVeld = form?.get("taal");
  const taal = isAudioTaal(taalVeld) ? taalVeld : "nl";

  const uit = await transcribeAudio(Buffer.from(await bestand.arrayBuffer()), bestand.name, {
    language: taal,
    prompt: WHISPER_HINT,
    timeoutMs: 15 * 60_000,
  });

  await recordAudit({
    category: "ADMIN",
    action: "admin.audio_naar_tekst",
    actorUserId: principal.userId,
    actorLabel: "admin",
    summary: `Opname omgezet naar tekst (${Math.round(bestand.size / 1024)} kB, ${taal})`,
    metadata: { bytes: bestand.size, taal, tekens: uit.text.length, ms: uit.durationMs },
  }).catch(() => undefined);

  return NextResponse.json({ tekst: uit.text, taal, ms: uit.durationMs });
});
