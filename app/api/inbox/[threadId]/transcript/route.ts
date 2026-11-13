import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { canAccess, getMessageById, getThread, setTranscript } from "@/lib/messaging/store";
import { isPlatformAdmin } from "@/lib/messaging/contacts";
import { readChatMedia } from "@/lib/messaging/media";
import { transcribeAudio } from "@/lib/asr/transcribe";
import { enforceRateLimit } from "@/lib/rate-limit";
import { uitschrijfTijd } from "@/lib/messaging/uitschrijf-tijd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ messageId: z.string().min(1).max(40) });

// POST /api/inbox/:id/transcript — een spraakbericht uitschrijven (zoals WhatsApp), met onze eigen Whisper
// (lib/asr/transcribe.ts; niets gaat naar een dienst van buiten). De taal herkent Whisper zelf: een werker spreekt
// ook Pools, Roemeens of Oekraïens. De tekst komt in het bericht zelf, dus elk lid van het gesprek ziet hem en hij
// verdwijnt mee als het bericht verwijderd wordt. Al uitgeschreven: meteen de bewaarde tekst. Nooit de tekst loggen.
export async function POST(req: Request, props: { params: Promise<{ threadId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const p = await requirePrincipal();
    const admin = await isPlatformAdmin(p.userId);
    const thread = await getThread(params.threadId);
    if (!thread || !canAccess(thread, p.userId, admin)) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gesprek niet gevonden" } }, { status: 404 });
    }
    const body = schema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) throw AppError.validation("Ongeldig verzoek");
    const m = await getMessageById(thread.id, body.data.messageId);
    if (!m || m.kind !== "voice" || m.deleted || !m.attachment) throw AppError.notFound("Spraakbericht niet gevonden");
    if (m.transcript !== undefined) return NextResponse.json({ message: m });

    await enforceRateLimit({
      name: "chat-transcript",
      identifier: p.userId,
      limit: 20,
      windowSeconds: 600,
      message: "Je liet net veel spraakberichten uitschrijven. Probeer het over een paar minuten opnieuw.",
    });
    const file = await readChatMedia(thread.id, m.attachment.mediaId, p.userId);
    if (!file) throw AppError.notFound("Spraakbericht niet gevonden");
    const uit = await transcribeAudio(file.bytes, file.filename, { language: null, timeoutMs: uitschrijfTijd(m.attachment.durationSec) });
    const bijgewerkt = await setTranscript(thread.id, m.id, uit.text);
    return NextResponse.json({ message: bijgewerkt ?? { ...m, transcript: uit.text } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
