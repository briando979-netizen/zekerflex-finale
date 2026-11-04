import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { geminiStem } from "@/lib/ai/gemini-media";
import { synthesizeSpeech } from "@/lib/ai/neural-tts";
import { uitspraak } from "@/lib/video/auto";
import { bewaarBestand } from "@/lib/video/bestanden";
import { wavDuur } from "@/lib/video/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const invoer = z.object({
  tekst: z.string().trim().min(1).max(3000),
  stem: z.enum(["Kore", "Aoede", "Leda", "Charon", "Puck", "Orus"]).default("Kore"),
  toon: z.string().trim().max(160).optional(),
});

// POST: laat de AI een tekst inspreken; het geluid komt bij de bestanden van de editor.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const parsed = invoer.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Typ eerst de tekst die ingesproken moet worden.");
  const tekst = uitspraak(parsed.data.tekst);
  const wav = await geminiStem(tekst, parsed.data.stem, parsed.data.toon || undefined);
  if (wav) {
    const duur = wavDuur(wav);
    const item = await bewaarBestand(wav, `Stem: ${parsed.data.tekst.slice(0, 40)}`, { herkomst: "ai-stem", gemeld: "audio/wav", ...(duur ? { duur } : {}) });
    return NextResponse.json({ ok: true, item });
  }
  const mp3 = await synthesizeSpeech(tekst);
  if (mp3) {
    const item = await bewaarBestand(mp3, `Stem: ${parsed.data.tekst.slice(0, 40)}`, { herkomst: "ai-stem", gemeld: "audio/mpeg" });
    return NextResponse.json({ ok: true, item });
  }
  throw AppError.precondition("De AI-stem is nu niet beschikbaar (het dagtegoed van Google is op). Probeer het later nog eens, of neem je stem zelf op met de microfoonknop.");
});
