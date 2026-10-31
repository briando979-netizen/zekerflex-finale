import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { synthesizeSpeech } from "@/lib/ai/neural-tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/tts { text } — geeft een natuurlijke neurale NL-stem (MP3)
// voor het voorlezen in de ZekerFlex AI-console. 404 als TTS (nog) niet
// geconfigureerd is → de console valt dan terug op de browserstem. Admin-only.
const schema = z.object({ text: z.string().trim().min(1).max(2000) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return new Response("Ongeldige tekst.", { status: 400 });

  const audio = await synthesizeSpeech(parsed.data.text);
  if (!audio) return new Response("Neurale stem niet beschikbaar.", { status: 404 });

  return new Response(new Uint8Array(audio), {
    status: 200,
    headers: { "content-type": "audio/mpeg", "cache-control": "private, no-store" },
  });
});
